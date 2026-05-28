import { useCallback, useEffect, useRef, useState } from 'react';
import { Room, RoomEvent } from 'livekit-client';
import type { ClientMessage, RoomSettings } from '@chat-freely/shared';
import { useLayoutStore } from '../layoutStore';
import { useSignaling } from '../hooks/useSignaling';
import { useVideoSources } from '../hooks/useVideoSources';
import { useAudioLevels } from '../hooks/useAudioLevels';
import { useVolumeAlert } from '../hooks/useVolumeAlert';
import { useRemoteRoomAudio } from '../hooks/useRemoteRoomAudio';
import { useRoomMediaRev } from '../hooks/useRoomMediaRev';
import { ParticipantTile } from './ParticipantTile';
import { Whiteboard } from './Whiteboard';
import { EmojiBlast } from './EmojiBlast';
import { getSignalingHttpBase } from '../util/signalingBaseUrl';

type ChatRow = Extract<ClientMessage, { type: 'chat' }>;
type LayoutRow = Extract<ClientMessage, { type: 'layout-sync' }>;
type SettingsRow = Extract<ClientMessage, { type: 'room-settings' }>;
type WbSyncRow = Extract<ClientMessage, { type: 'whiteboard-sync' }>;

function fileToDataUrl(file: File, maxDim = 1920): Promise<string> {
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
      resolve(canvas.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed')); };
    img.src = url;
  });
}

const DRAW_COLORS = [
  '#1a1d24', '#c0392b', '#e67e22', '#f1c40f',
  '#27ae60', '#2980b9', '#8e44ad', '#5b6abf',
  '#e84393', '#636e72',
];

const BRUSH_TYPES = [
  { id: 'pencil', label: 'Pencil', width: 2, opacity: 1 },
  { id: 'pen', label: 'Pen', width: 4, opacity: 1 },
  { id: 'marker', label: 'Marker', width: 12, opacity: 0.6 },
  { id: 'highlighter', label: 'Highlight', width: 24, opacity: 0.3 },
] as const;

const EMOJI_LIST = [
  '😀','😂','🥰','😎','🤩','🥳',
  '🔥','❤️','👍','👏','🎉','✨',
  '💀','😭','🤯','💯','🚀','⭐',
  '🌈','🎵','💎','🦋','🍕','🐱',
];

export function RoomView(props: {
  room: Room;
  sessionRoom: string;
  identity: string;
  onLeave: () => void;
}) {
  const { room, sessionRoom, identity, onLeave } = props;
  const stageRef = useRef<HTMLDivElement>(null);
  useRoomMediaRev(room);
  useRemoteRoomAudio(room);
  const sources = useVideoSources(room);
  const audioLevels = useAudioLevels(room);

  const [volumeAlert, setVolumeAlert] = useState(false);
  const [bgDataUrl, setBgDataUrl] = useState<string | null>(null);
  const [bgOpacity, setBgOpacity] = useState(1);
  const [stageAspect, setStageAspect] = useState<number | null>(null);

  useVolumeAlert(volumeAlert, audioLevels);

  const layoutMode = useLayoutStore((s) => s.layoutMode);
  const setLayoutMode = useLayoutStore((s) => s.setLayoutMode);
  const tiles = useLayoutStore((s) => s.tiles);
  const setStageSize = useLayoutStore((s) => s.setStageSize);
  const ensureTiles = useLayoutStore((s) => s.ensureTiles);
  const removeTile = useLayoutStore((s) => s.removeTile);
  const updateTile = useLayoutStore((s) => s.updateTile);
  const bumpZ = useLayoutStore((s) => s.bumpZ);
  const replaceLayout = useLayoutStore((s) => s.replaceLayout);

  const gridLocked = layoutMode === 'grid';

  const [chatOpen, setChatOpen] = useState(true);
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState<ChatRow[]>([]);
  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);
  const [videoInputs, setVideoInputs] = useState<MediaDeviceInfo[]>([]);

  /* Tool state */
  const [tool, setTool] = useState<'select' | 'draw'>('select');
  const [drawColor, setDrawColor] = useState(DRAW_COLORS[0]);
  const [brushType, setBrushType] = useState<(typeof BRUSH_TYPES)[number]['id']>('pencil');
  const [brushSize, setBrushSize] = useState(2);
  const [activeEmoji, setActiveEmoji] = useState<string | null>(null);

  /* Sidebar flyouts */
  const [flyout, setFlyout] = useState<string | null>(null);

  const [screenBusy, setScreenBusy] = useState(false);

  const [remoteWbJson, setRemoteWbJson] = useState<string | null>(null);

  useEffect(() => {
    const entries = sources.map((s) => ({ tileId: s.tileId, participantIdentity: s.participantIdentity }));
    ensureTiles(entries);
    const ids = new Set(sources.map((s) => s.tileId));
    Object.keys(useLayoutStore.getState().tiles).forEach((id) => { if (!ids.has(id)) removeTile(id); });
  }, [sources, ensureTiles, removeTile]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setStageSize(el.clientWidth, el.clientHeight);
      if (useLayoutStore.getState().layoutMode === 'grid') useLayoutStore.getState().applyGrid();
    });
    ro.observe(el);
    setStageSize(el.clientWidth, el.clientHeight);
    return () => ro.disconnect();
  }, [setStageSize]);

  useEffect(() => {
    let c = false;
    (async () => {
      const a = await Room.getLocalDevices('audioinput');
      const v = await Room.getLocalDevices('videoinput');
      if (!c) { setAudioInputs(a); setVideoInputs(v); }
    })();
    return () => { c = true; };
  }, [room]);

  useEffect(() => {
    const h = (e: Error) => console.warn('MediaDevicesError', e);
    room.on(RoomEvent.MediaDevicesError, h);
    return () => { room.off(RoomEvent.MediaDevicesError, h); };
  }, [room]);

  const sendLayoutSnapshot = useCallback(() => {
    const s = useLayoutStore.getState();
    return { layoutMode: s.layoutMode, tiles: { ...s.tiles } };
  }, []);

  const onChat = useCallback((m: ChatRow) => { setMessages((p) => [...p.slice(-200), m]); }, []);
  const onLayoutRemote = useCallback((m: LayoutRow) => {
    if (m.sender === identity) return;
    replaceLayout(m.layout.tiles, m.layout.layoutMode);
  }, [identity, replaceLayout]);
  const onRoomSettings = useCallback((m: SettingsRow) => {
    setBgDataUrl(m.settings.bgDataUrl);
    setBgOpacity(m.settings.bgOpacity);
    setVolumeAlert(m.settings.volumeAlert);
    setStageAspect(m.settings.stageAspect);
  }, []);
  const onWhiteboardSync = useCallback((m: WbSyncRow) => {
    setRemoteWbJson(m.json);
  }, []);

  const { scheduleLayoutBroadcast, sendChat, sendRoomSettings, sendWhiteboardSync } = useSignaling({
    signalingUrl: getSignalingHttpBase(), room: sessionRoom, identity, enabled: true,
    onChat, onLayoutRemote, onRoomSettings, onWhiteboardSync, sendLayout: sendLayoutSnapshot,
  });

  const broadcastSettings = useCallback((patch: Partial<RoomSettings>) => {
    sendRoomSettings({ bgDataUrl, bgOpacity, volumeAlert, stageAspect, ...patch });
  }, [bgDataUrl, bgOpacity, volumeAlert, stageAspect, sendRoomSettings]);

  const micEnabled = room.localParticipant.isMicrophoneEnabled;
  const camEnabled = room.localParticipant.isCameraEnabled;
  const layoutNotify = () => scheduleLayoutBroadcast();

  const shareScreen = async () => {
    setScreenBusy(true);
    try {
      await room.localParticipant.setScreenShareEnabled(!room.localParticipant.isScreenShareEnabled, { audio: false, selfBrowserSurface: 'include', surfaceSwitching: 'include', contentHint: 'detail' });
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e));
    } finally { setScreenBusy(false); }
  };

  const handleBgUpload = async (file: File) => {
    try {
      const dataUrl = await fileToDataUrl(file);
      const img = new Image();
      img.onload = () => {
        const aspect = img.naturalWidth / img.naturalHeight;
        setBgDataUrl(dataUrl); setStageAspect(aspect);
        broadcastSettings({ bgDataUrl: dataUrl, stageAspect: aspect });
      };
      img.src = dataUrl;
    } catch { window.alert('Failed to load background image'); }
  };

  const handleClearBg = () => { setBgDataUrl(null); setStageAspect(null); broadcastSettings({ bgDataUrl: null, stageAspect: null }); };
  const handleBgOpacity = (v: number) => { setBgOpacity(v); broadcastSettings({ bgOpacity: v }); };
  const handleVolumeAlertToggle = () => { const n = !volumeAlert; setVolumeAlert(n); broadcastSettings({ volumeAlert: n }); };

  const closeFlyout = () => setFlyout(null);
  const toggleFlyout = (id: string) => setFlyout((p) => (p === id ? null : id));

  const currentBrush = BRUSH_TYPES.find((b) => b.id === brushType) ?? BRUSH_TYPES[0];

  const stageStyle: React.CSSProperties = stageAspect
    ? { aspectRatio: `${stageAspect}`, maxHeight: '100%', flex: 'none', width: 'auto', alignSelf: 'center' }
    : {};

  return (
    <div className="room-root" onClick={() => { if (flyout) closeFlyout(); }}>
      {/* ── Header ── */}
      <header className="room-header">
        <div className="room-title">
          <strong>Chat Freely</strong>
          <span className="room-code-badge" title="Click to copy room code" onClick={() => {
            void navigator.clipboard.writeText(sessionRoom);
          }}>
            {sessionRoom}
          </span>
          <button type="button" className="btn ghost focus-ring share-link-btn" title="Copy invite link" onClick={() => {
            const url = new URL(window.location.href);
            url.searchParams.set('room', sessionRoom);
            void navigator.clipboard.writeText(url.toString());
          }}>
            Share link
          </button>
        </div>
        <div className="room-header-actions">
          <button type="button" className="btn ghost focus-ring" onClick={() => setChatOpen((v) => !v)}>
            {chatOpen ? 'Hide chat' : 'Chat'}
          </button>
          <button type="button" className="btn danger focus-ring" onClick={onLeave}>Leave</button>
        </div>
      </header>

      <div className="room-body">
        {/* ── Left sidebar ── */}
        <nav className="left-sidebar" onClick={(e) => e.stopPropagation()}>
          {/* Select / Draw */}
          <button type="button" className={`icon-btn${tool === 'select' && !activeEmoji ? ' active' : ''}`} title="Select"
            onClick={() => { setTool('select'); setActiveEmoji(null); closeFlyout(); }}>
            ↖
          </button>

          <div className="flyout-anchor">
            <button type="button" className={`icon-btn${tool === 'draw' ? ' active' : ''}`} title="Draw"
              onClick={() => { setTool('draw'); setActiveEmoji(null); toggleFlyout('draw'); }}>
              ✏
            </button>
            {flyout === 'draw' && (
              <div className="flyout" onClick={(e) => e.stopPropagation()}>
                <p className="flyout-title">Brush</p>
                <div className="brush-row">
                  {BRUSH_TYPES.map((b) => (
                    <button key={b.id} className={`brush-btn${brushType === b.id ? ' active' : ''}`}
                      onClick={() => { setBrushType(b.id); setBrushSize(b.width); }}>
                      {b.label}
                    </button>
                  ))}
                </div>
                <div className="size-row">
                  <span>Size</span>
                  <input type="range" min="1" max="40" value={brushSize}
                    onChange={(e) => setBrushSize(Number(e.target.value))} />
                  <span>{brushSize}</span>
                </div>
                <p className="flyout-title">Color</p>
                <div className="color-row">
                  {DRAW_COLORS.map((c) => (
                    <button key={c} className={`color-dot${drawColor === c ? ' active' : ''}`}
                      style={{ background: c }} onClick={() => setDrawColor(c)} />
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="sidebar-sep" />

          {/* Emoji blast */}
          <div className="flyout-anchor">
            <button type="button" className={`icon-btn${activeEmoji ? ' active' : ''}`} title="Emoji Blast"
              onClick={() => toggleFlyout('emoji')}>
              🎉
            </button>
            {flyout === 'emoji' && (
              <div className="flyout" onClick={(e) => e.stopPropagation()}>
                <p className="flyout-title">Pick an emoji, then click the stage</p>
                <div className="emoji-grid">
                  {EMOJI_LIST.map((em) => (
                    <button key={em} className={`emoji-cell${activeEmoji === em ? ' active' : ''}`}
                      onClick={() => { setActiveEmoji(em); setTool('select'); closeFlyout(); }}>
                      {em}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="sidebar-sep" />

          {/* Layout */}
          <button type="button" className={`icon-btn${layoutMode === 'free' ? ' active' : ''}`} title="Free layout"
            onClick={() => { setLayoutMode('free'); layoutNotify(); }}>
            ⊞
          </button>
          <button type="button" className={`icon-btn${layoutMode === 'grid' ? ' active' : ''}`} title="Grid layout"
            onClick={() => { setLayoutMode('grid'); layoutNotify(); }}>
            ⊟
          </button>

          <div className="sidebar-sep" />

          {/* Vol-Alert */}
          <button type="button" className={`icon-btn${volumeAlert ? ' active' : ''}`} title="Volume Alert"
            onClick={handleVolumeAlertToggle}>
            📢
          </button>

          {/* Background */}
          <div className="flyout-anchor">
            <button type="button" className={`icon-btn${bgDataUrl ? ' active' : ''}`} title="Background"
              onClick={() => toggleFlyout('bg')}>
              🖼
            </button>
            {flyout === 'bg' && (
              <div className="flyout" onClick={(e) => e.stopPropagation()}>
                <p className="flyout-title">Background</p>
                <label className="btn focus-ring" style={{ textAlign: 'center' }}>
                  Upload image
                  <input type="file" accept="image/*" hidden onChange={(e) => {
                    const f = e.target.files?.[0]; if (f) void handleBgUpload(f); e.target.value = '';
                  }} />
                </label>
                {bgDataUrl && (
                  <>
                    <div className="size-row">
                      <span>Opacity</span>
                      <input type="range" min="0" max="1" step="0.05" value={bgOpacity}
                        onChange={(e) => handleBgOpacity(Number(e.target.value))} />
                    </div>
                    <button type="button" className="btn danger" onClick={handleClearBg}>Clear</button>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="sidebar-sep" />

          {/* Device settings */}
          <div className="flyout-anchor">
            <button type="button" className="icon-btn" title="Devices" onClick={() => toggleFlyout('devices')}>
              ⚙
            </button>
            {flyout === 'devices' && (
              <div className="flyout" onClick={(e) => e.stopPropagation()}>
                <p className="flyout-title">Devices</p>
                <label className="size-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                  <span>Microphone</span>
                  <select className="focus-ring" value={room.getActiveDevice('audioinput') ?? ''}
                    onChange={(e) => void room.switchActiveDevice('audioinput', e.target.value)}>
                    {audioInputs.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Microphone'}</option>)}
                  </select>
                </label>
                <label className="size-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                  <span>Camera</span>
                  <select className="focus-ring" value={room.getActiveDevice('videoinput') ?? ''}
                    onChange={(e) => void room.switchActiveDevice('videoinput', e.target.value)}>
                    {videoInputs.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Camera'}</option>)}
                  </select>
                </label>
              </div>
            )}
          </div>
        </nav>

        {/* ── Stage ── */}
        <div className="stage-container">
          <div ref={stageRef} className="stage" style={stageStyle}>
            {bgDataUrl && (
              <div className="stage-bg" style={{ backgroundImage: `url(${bgDataUrl})`, opacity: bgOpacity }} />
            )}
            <Whiteboard
              activeTool={tool}
              drawColor={drawColor}
              brushWidth={brushSize}
              brushOpacity={currentBrush.opacity}
              onCanvasChange={sendWhiteboardSync}
              remoteCanvasJson={remoteWbJson}
            />
            <div className="video-layer">
              {sources.map((item) => (
                <ParticipantTile
                  key={item.tileId} item={item} tile={tiles[item.tileId]}
                  disabled={gridLocked} audioLevel={audioLevels[item.participantIdentity] ?? 0}
                  onActivate={() => bumpZ(item.tileId)}
                  onDragStop={(x, y) => { updateTile(item.tileId, { x, y }); layoutNotify(); }}
                  onResizeStop={(x, y, w, h) => { updateTile(item.tileId, { x, y, width: w, height: h }); layoutNotify(); }}
                  onShapeChange={(p) => { updateTile(item.tileId, { shapePreset: p }); layoutNotify(); }}
                />
              ))}
            </div>
            <EmojiBlast activeEmoji={activeEmoji} onDone={() => setActiveEmoji(null)} />
          </div>
        </div>

        {/* ── Chat ── */}
        {chatOpen && (
          <aside className="chat-panel">
            <div className="chat-messages">
              {messages.map((m, i) => (
                <div key={`${m.ts}-${i}`} className="chat-row">
                  <span className="chat-sender">{m.sender}</span>
                  <span className="chat-body">{m.body}</span>
                </div>
              ))}
            </div>
            <form className="chat-form" onSubmit={(e) => { e.preventDefault(); const t = chatInput.trim(); if (!t) return; sendChat(t); setChatInput(''); }}>
              <input value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="Message…" />
              <button type="submit" className="btn primary">Send</button>
            </form>
          </aside>
        )}
      </div>

      {/* ── Bottom bar (slim: mic/cam/share only) ── */}
      <footer className="control-bar">
        <button type="button" className={`btn${micEnabled ? '' : ' off'}`}
          onClick={async () => { try { await room.localParticipant.setMicrophoneEnabled(!micEnabled); } catch (e) { window.alert(e instanceof Error ? e.message : String(e)); } }}>
          {micEnabled ? '🎙 Mute' : '🎙 Unmute'}
        </button>
        <button type="button" className={`btn${camEnabled ? '' : ' off'}`}
          onClick={async () => { try { await room.localParticipant.setCameraEnabled(!camEnabled); } catch (e) { window.alert(e instanceof Error ? e.message : String(e)); } }}>
          {camEnabled ? '📷 Cam off' : '📷 Cam on'}
        </button>
        <button type="button" className="btn" disabled={screenBusy} onClick={() => void shareScreen()}>
          {room.localParticipant.isScreenShareEnabled ? '🖥 Stop share' : '🖥 Share'}
        </button>
      </footer>
    </div>
  );
}
