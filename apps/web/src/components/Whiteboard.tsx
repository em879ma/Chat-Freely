import { useEffect, useRef, useState, useCallback } from 'react';
import * as fabric from 'fabric';

type BoardVideoMeta = {
  blobUrl: string;
  raf: number;
};

const VIDEO_MARK = '__boardVideo' as const;
const DECODE_HOST_ID = 'cf-board-video-decode-host';

function getBoardVideoDecodeHost(): HTMLElement {
  let el = document.getElementById(DECODE_HOST_ID);
  if (!el) {
    el = document.createElement('div');
    el.id = DECODE_HOST_ID;
    el.setAttribute('aria-hidden', 'true');
    Object.assign(el.style, {
      position: 'fixed',
      left: '-9999px',
      top: '0',
      width: '4px',
      height: '4px',
      overflow: 'hidden',
      opacity: '0',
      pointerEvents: 'none',
      zIndex: '-9999',
    });
    document.body.appendChild(el);
  }
  return el;
}

function getBoardVideoMeta(o: fabric.FabricObject): BoardVideoMeta | undefined {
  return (o as fabric.FabricObject & { [VIDEO_MARK]?: BoardVideoMeta })[VIDEO_MARK];
}

function setBoardVideoMeta(o: fabric.FabricObject, meta: BoardVideoMeta) {
  (o as fabric.FabricObject & { [VIDEO_MARK]?: BoardVideoMeta })[VIDEO_MARK] = meta;
}

function cleanupBoardVideoObject(o: fabric.FabricObject | undefined) {
  if (!o) return;
  const meta = getBoardVideoMeta(o);
  if (!meta) return;
  if (meta.raf) cancelAnimationFrame(meta.raf);
  meta.raf = 0;
  const el = (o as fabric.FabricImage).getElement();
  if (el instanceof HTMLVideoElement) {
    el.pause();
    el.removeAttribute('src');
    el.load();
  }
  URL.revokeObjectURL(meta.blobUrl);
  delete (o as fabric.FabricObject & { [VIDEO_MARK]?: BoardVideoMeta })[VIDEO_MARK];
}

function getVideoFromActiveObject(o: fabric.FabricObject | undefined): HTMLVideoElement | null {
  if (!o || !(o instanceof fabric.FabricImage)) return null;
  const el = o.getElement();
  return el instanceof HTMLVideoElement ? el : null;
}

function imageFileToDataUrl(file: File, maxDim = 800): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const scale = maxDim / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.75));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };
    img.src = url;
  });
}

export function Whiteboard(props: {
  activeTool: 'select' | 'draw';
  drawColor?: string;
  brushWidth?: number;
  brushOpacity?: number;
  onCanvasChange?: (json: string) => void;
  remoteCanvasJson?: string | null;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<fabric.Canvas | null>(null);
  const [ready, setReady] = useState(false);
  const [hasSelection, setHasSelection] = useState(false);
  const [selectedOpacity, setSelectedOpacity] = useState(1);
  const [selectedVideo, setSelectedVideo] = useState<HTMLVideoElement | null>(null);

  const isRemoteRef = useRef(false);
  const broadcastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCanvasChangeRef = useRef(props.onCanvasChange);
  onCanvasChangeRef.current = props.onCanvasChange;

  const serializeAndBroadcast = useCallback(() => {
    if (isRemoteRef.current) return;
    if (broadcastTimerRef.current) clearTimeout(broadcastTimerRef.current);
    broadcastTimerRef.current = setTimeout(() => {
      const c = fabricRef.current;
      if (!c) return;
      const fullJson = c.toJSON() as { objects: object[]; [k: string]: unknown };
      const videoIndices = new Set<number>();
      c.getObjects().forEach((o, i) => {
        if (getBoardVideoMeta(o)) videoIndices.add(i);
      });
      fullJson.objects = fullJson.objects.filter((_, i) => !videoIndices.has(i));
      onCanvasChangeRef.current?.(JSON.stringify(fullJson));
    }, 300);
  }, []);

  useEffect(() => {
    const canvasEl = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvasEl || !wrap) return;

    const canvas = new fabric.Canvas(canvasEl, {
      backgroundColor: 'transparent',
      selection: true,
    });
    fabricRef.current = canvas;
    setReady(true);

    const syncSelection = () => {
      const active = canvas.getActiveObject();
      setHasSelection(active != null);
      setSelectedOpacity(active ? (active.opacity ?? 1) : 1);
      setSelectedVideo(getVideoFromActiveObject(active ?? undefined));
    };

    const onRemoved = (opt: { target?: fabric.FabricObject }) => {
      if (isRemoteRef.current) return;
      cleanupBoardVideoObject(opt.target);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const target = e.target as HTMLElement | null;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
        const active = canvas.getActiveObject();
        if (!active) return;
        e.preventDefault();
        if ('forEachObject' in active && typeof active.forEachObject === 'function') {
          (active as fabric.ActiveSelection).forEachObject((o: fabric.FabricObject) => canvas.remove(o));
        }
        canvas.remove(active);
        canvas.discardActiveObject();
        canvas.requestRenderAll();
        setHasSelection(false);
        setSelectedVideo(null);
        serializeAndBroadcast();
      }
    };

    const onCanvasModified = () => serializeAndBroadcast();

    canvas.on('selection:created', syncSelection);
    canvas.on('selection:updated', syncSelection);
    canvas.on('selection:cleared', () => { setHasSelection(false); setSelectedOpacity(1); setSelectedVideo(null); });
    canvas.on('object:removed', onRemoved);
    canvas.on('object:added', onCanvasModified);
    canvas.on('object:modified', onCanvasModified);
    canvas.on('path:created', onCanvasModified);
    document.addEventListener('keydown', onKeyDown);

    const resize = () => {
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      canvas.setDimensions({ width: w, height: h });
      canvas.requestRenderAll();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    const pauseAllBoardVideos = () => {
      for (const o of canvas.getObjects()) {
        if (!(o instanceof fabric.FabricImage)) continue;
        const el = o.getElement();
        if (!(el instanceof HTMLVideoElement)) continue;
        el.pause();
        const meta = getBoardVideoMeta(o);
        if (meta?.raf) {
          cancelAnimationFrame(meta.raf);
          meta.raf = 0;
        }
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') pauseAllBoardVideos();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('visibilitychange', onVisibility);
      ro.disconnect();
      canvas.off('selection:created', syncSelection);
      canvas.off('selection:updated', syncSelection);
      canvas.off('selection:cleared');
      canvas.off('object:removed', onRemoved);
      canvas.off('object:added', onCanvasModified);
      canvas.off('object:modified', onCanvasModified);
      canvas.off('path:created', onCanvasModified);
      for (const o of canvas.getObjects()) cleanupBoardVideoObject(o);
      canvas.dispose();
      fabricRef.current = null;
      if (broadcastTimerRef.current) clearTimeout(broadcastTimerRef.current);
      setReady(false);
      setHasSelection(false);
      setSelectedOpacity(1);
      setSelectedVideo(null);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load remote canvas JSON
  useEffect(() => {
    const c = fabricRef.current;
    if (!c || !props.remoteCanvasJson) return;

    isRemoteRef.current = true;

    const videoObjs: fabric.FabricObject[] = [];
    for (const o of c.getObjects()) {
      if (getBoardVideoMeta(o)) videoObjs.push(o);
    }

    const parsed = JSON.parse(props.remoteCanvasJson);

    c.loadFromJSON(parsed).then(() => {
      for (const o of videoObjs) c.add(o);
      c.requestRenderAll();
      isRemoteRef.current = false;
    }).catch(() => {
      for (const o of videoObjs) c.add(o);
      c.requestRenderAll();
      isRemoteRef.current = false;
    });
  }, [props.remoteCanvasJson]);

  const { drawColor = '#1a1d24', brushWidth = 2, brushOpacity = 1 } = props;

  useEffect(() => {
    const c = fabricRef.current;
    if (!c) return;
    if (props.activeTool === 'draw') {
      c.isDrawingMode = true;
      const brush = new fabric.PencilBrush(c);
      brush.width = brushWidth;
      const hex = drawColor;
      const alpha = Math.round(brushOpacity * 255).toString(16).padStart(2, '0');
      brush.color = hex.length === 7 ? hex + alpha : hex;
      c.freeDrawingBrush = brush;
    } else {
      c.isDrawingMode = false;
    }
  }, [props.activeTool, ready, drawColor, brushWidth, brushOpacity]);

  const addText = () => {
    const c = fabricRef.current;
    if (!c) return;
    const text = new fabric.IText('Double-click to edit', {
      left: 40,
      top: 40,
      fill: '#1a1d24',
      fontSize: 22,
      editable: true,
    });
    c.add(text);
    c.setActiveObject(text);
    c.requestRenderAll();
  };

  const addImage = async (file: File) => {
    const c = fabricRef.current;
    if (!c) return;
    try {
      const dataUrl = await imageFileToDataUrl(file, 800);
      const img = await fabric.FabricImage.fromURL(dataUrl, { crossOrigin: 'anonymous' });
      img.scaleToWidth(220);
      img.set({ left: 80, top: 80 });
      c.add(img);
      c.requestRenderAll();
    } catch {
      window.alert('Failed to add image');
    }
  };

  const addVideo = (file: File) => {
    const c = fabricRef.current;
    if (!c) return;

    const blobUrl = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', 'true');
    video.preload = 'auto';

    const startRaf = (fabImg: fabric.FabricImage, vid: HTMLVideoElement) => {
      const tick = () => {
        if (!vid.paused && !vid.ended) {
          if (document.visibilityState === 'visible') c.requestRenderAll();
          const meta = getBoardVideoMeta(fabImg);
          if (meta) meta.raf = requestAnimationFrame(tick);
        }
      };
      const meta = getBoardVideoMeta(fabImg);
      if (meta?.raf) cancelAnimationFrame(meta.raf);
      if (meta) meta.raf = requestAnimationFrame(tick);
    };

    const stopRaf = (fabImg: fabric.FabricImage) => {
      const meta = getBoardVideoMeta(fabImg);
      if (meta?.raf) {
        cancelAnimationFrame(meta.raf);
        meta.raf = 0;
      }
    };

    let added = false;
    const fail = (msg: string) => {
      if (added) return;
      added = true;
      URL.revokeObjectURL(blobUrl);
      video.pause();
      video.removeAttribute('src');
      video.load();
      video.remove();
      window.alert(msg);
    };

    const tryAddToCanvas = () => {
      if (added) return;
      const w = video.videoWidth;
      const h = video.videoHeight;
      if (!w || !h) return;

      added = true;
      video.width = w;
      video.height = h;

      let fabImg: fabric.FabricImage;
      try {
        fabImg = new fabric.FabricImage(video, {
          left: 100,
          top: 100,
          width: w,
          height: h,
          objectCaching: false,
        });
        fabImg.scaleToWidth(320);
        fabImg.setCoords();
      } catch (e) {
        added = false;
        URL.revokeObjectURL(blobUrl);
        video.remove();
        console.error(e);
        window.alert(e instanceof Error ? e.message : 'Could not create video on canvas');
        return;
      }

      setBoardVideoMeta(fabImg, { blobUrl, raf: 0 });

      video.addEventListener('play', () => startRaf(fabImg, video));
      video.addEventListener('pause', () => stopRaf(fabImg));
      video.addEventListener('ended', () => stopRaf(fabImg));

      c.add(fabImg);
      c.setActiveObject(fabImg);
      c.requestRenderAll();
      setSelectedVideo(video);
    };

    video.addEventListener('error', () =>
      fail('Could not load this video (unsupported format or codec in this browser).'),
    );

    Object.assign(video.style, { width: '2px', height: '2px', display: 'block' });
    getBoardVideoDecodeHost().appendChild(video);
    video.src = blobUrl;

    video.addEventListener('loadedmetadata', () => tryAddToCanvas());
    video.addEventListener('loadeddata', () => tryAddToCanvas());
    video.addEventListener('canplay', () => tryAddToCanvas());
    video.addEventListener('seeked', () => {
      tryAddToCanvas();
      c.requestRenderAll();
    });

    video.play()
      .then(() => {
        video.pause();
        tryAddToCanvas();
      })
      .catch(() => {
        video.currentTime = 0.001;
      });

    window.setTimeout(() => {
      if (!added && (!video.videoWidth || !video.videoHeight)) {
        fail('Video took too long to load. Try a smaller MP4 (H.264) file.');
      }
    }, 12000);
  };

  const playSelected = () => {
    const v = selectedVideo;
    if (!v) return;
    void v.play().catch((e) => window.alert(e instanceof Error ? e.message : String(e)));
    fabricRef.current?.requestRenderAll();
  };

  const pauseSelected = () => {
    selectedVideo?.pause();
    fabricRef.current?.requestRenderAll();
  };

  const changeOpacity = (val: number) => {
    const c = fabricRef.current;
    if (!c) return;
    const active = c.getActiveObject();
    if (!active) return;
    active.set('opacity', val);
    setSelectedOpacity(val);
    c.requestRenderAll();
    serializeAndBroadcast();
  };

  const deleteSelected = () => {
    const c = fabricRef.current;
    if (!c) return;
    const active = c.getActiveObject();
    if (!active) return;
    if ('forEachObject' in active && typeof active.forEachObject === 'function') {
      (active as fabric.ActiveSelection).forEachObject((o: fabric.FabricObject) => c.remove(o));
    }
    c.remove(active);
    c.discardActiveObject();
    c.requestRenderAll();
    setHasSelection(false);
    setSelectedVideo(null);
    serializeAndBroadcast();
  };

  const clear = () => {
    const c = fabricRef.current;
    if (!c) return;
    [...c.getObjects()].forEach((o) => c.remove(o));
    c.discardActiveObject();
    c.requestRenderAll();
    setSelectedVideo(null);
    serializeAndBroadcast();
  };

  return (
    <div ref={wrapRef} className="whiteboard-wrap">
      <canvas ref={canvasRef} className="whiteboard-canvas" />
      <div className="whiteboard-toolbar">
        <button type="button" className="btn focus-ring" onClick={addText}>
          Text
        </button>
        <label className="btn focus-ring">
          Image
          <input
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void addImage(f);
              e.target.value = '';
            }}
          />
        </label>
        <label className="btn focus-ring">
          Video
          <input
            type="file"
            accept="video/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) addVideo(f);
              e.target.value = '';
            }}
          />
        </label>
        <button
          type="button"
          className="btn focus-ring"
          disabled={!selectedVideo}
          onClick={playSelected}
        >
          Play
        </button>
        <button
          type="button"
          className="btn focus-ring"
          disabled={!selectedVideo}
          onClick={pauseSelected}
        >
          Pause
        </button>
        {hasSelection && (
          <label className="inline toolbar-opacity">
            Opacity
            <input
              type="range"
              min="0.05"
              max="1"
              step="0.05"
              value={selectedOpacity}
              onChange={(e) => changeOpacity(Number(e.target.value))}
              className="opacity-slider"
            />
          </label>
        )}
        <button
          type="button"
          className="btn focus-ring"
          disabled={!hasSelection}
          onClick={deleteSelected}
        >
          Delete
        </button>
        <button type="button" className="btn danger focus-ring" onClick={clear}>
          Clear board
        </button>
      </div>
    </div>
  );
}
