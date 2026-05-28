import { useEffect, useRef } from 'react';
import { TrackEvent } from 'livekit-client';
import { Rnd } from 'react-rnd';
import type { ParticipantTileState } from '@chat-freely/shared';
import type { VideoSourceItem } from '../hooks/useVideoSources';
import { getVideoContainerStyle } from '../shapePresets';

export function ParticipantTile(props: {
  item: VideoSourceItem;
  tile: ParticipantTileState | undefined;
  disabled: boolean;
  audioLevel: number;
  onDragStop: (x: number, y: number) => void;
  onResizeStop: (x: number, y: number, width: number, height: number) => void;
  onActivate: () => void;
  onShapeChange: (preset: ParticipantTileState['shapePreset']) => void;
}) {
  const { item, tile, disabled, audioLevel, onDragStop, onResizeStop, onActivate, onShapeChange } = props;
  const videoRef = useRef<HTMLVideoElement>(null);

  const hasTile = tile != null;
  const mediaId = item.track.mediaStreamTrack?.id ?? '';

  useEffect(() => {
    const el = videoRef.current;
    const track = item.track;
    if (!el) return;

    track.attach(el);

    const tryPlay = () => {
      el.play().catch(() => {});
    };

    tryPlay();
    el.addEventListener('loadeddata', tryPlay);
    el.addEventListener('loadedmetadata', tryPlay);
    el.addEventListener('canplay', tryPlay);

    const onRestarted = () => tryPlay();
    const onUnmuted = () => tryPlay();
    track.on(TrackEvent.Restarted, onRestarted);
    track.on(TrackEvent.Unmuted, onUnmuted);

    const raf = requestAnimationFrame(() => {
      tryPlay();
      if (el.srcObject && 'getVideoTracks' in el.srcObject) {
        (el.srcObject as MediaStream)
          .getVideoTracks()
          .forEach((t) => t.addEventListener('unmute', tryPlay, { once: true }));
      }
    });

    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('loadeddata', tryPlay);
      el.removeEventListener('loadedmetadata', tryPlay);
      el.removeEventListener('canplay', tryPlay);
      track.off(TrackEvent.Restarted, onRestarted);
      track.off(TrackEvent.Unmuted, onUnmuted);
      track.detach(el);
    };
  }, [hasTile, item.track, mediaId]);

  if (!tile) return null;

  const maskStyle = getVideoContainerStyle(tile.shapePreset, tile.clipPath);

  const label = item.isScreenShare
    ? `${tile.participantIdentity} · screen`
    : tile.participantIdentity;

  return (
    <Rnd
      size={{ width: tile.width, height: tile.height }}
      position={{ x: tile.x, y: tile.y }}
      disableDragging={disabled}
      enableResizing={disabled ? false : undefined}
      lockAspectRatio={false}
      dragHandleClassName="participant-drag-handle"
      onDragStart={onActivate}
      onResizeStart={onActivate}
      onDragStop={(_e, d) => onDragStop(d.x, d.y)}
      onResizeStop={(_e, _dir, ref, _delta, pos) =>
        onResizeStop(pos.x, pos.y, ref.offsetWidth, ref.offsetHeight)
      }
      style={{ zIndex: tile.zIndex }}
      className="participant-rnd"
    >
      <div className="participant-shell">
        <div
          className="participant-clip participant-drag-handle"
          style={tile.rotation ? { ...maskStyle, transform: `rotate(${tile.rotation}deg)` } : maskStyle}
        >
          <video
            ref={videoRef}
            className="participant-video"
            playsInline
            muted
            autoPlay
            controls={false}
          />
        </div>
        <div className="participant-chrome">
          <span className="participant-label">
            {label}
            <span
              className="volume-meter"
              style={{ width: `${Math.round(Math.min(audioLevel * 3, 1) * 100)}%` }}
            />
          </span>
          <select
            className="participant-shape focus-ring"
            aria-label="Clip shape"
            value={tile.shapePreset}
            onChange={(e) =>
              onShapeChange(e.target.value as ParticipantTileState['shapePreset'])
            }
          >
            {(
              [
                ['rect', 'Rect'],
                ['circle', 'Circle'],
                ['hexagon', 'Hex'],
                ['star', 'Star'],
                ['chat-bubble', 'Bubble'],
                ['skew-card', 'Skew'],
              ] as const
            ).map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </div>
      </div>
    </Rnd>
  );
}
