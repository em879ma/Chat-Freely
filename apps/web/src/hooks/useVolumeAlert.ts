import { useEffect, useRef } from 'react';
import { useLayoutStore } from '../layoutStore';

const BASE_W = 300;
const BASE_H = Math.round((BASE_W * 9) / 16);
const MAX_SCALE = 2.2;
const MIN_SCALE = 0.7;
const LERP = 0.08;
const BOUNCE_STRENGTH = 6;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function rectsOverlap(a: Rect, b: Rect): boolean {
  return !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * When volume-alert is enabled, continuously adjusts tile sizes
 * based on audio levels and applies collision bounce.
 */
export function useVolumeAlert(
  enabled: boolean,
  audioLevels: Record<string, number>,
) {
  const rafRef = useRef(0);
  const prevSizes = useRef<Record<string, { w: number; h: number }>>({});

  useEffect(() => {
    if (!enabled) {
      prevSizes.current = {};
      return;
    }

    let running = true;

    const tick = () => {
      if (!running) return;

      const state = useLayoutStore.getState();
      if (state.layoutMode === 'grid') {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      const { stageSize } = state;
      const ids = Object.keys(state.tiles);
      if (ids.length === 0) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      const updates: Record<string, { x: number; y: number; width: number; height: number }> = {};

      for (const id of ids) {
        const tile = state.tiles[id];
        const identity = tile.participantIdentity;
        const level = audioLevels[identity] ?? 0;

        const targetScale = MIN_SCALE + (MAX_SCALE - MIN_SCALE) * Math.min(level * 3, 1);
        const targetW = BASE_W * targetScale;
        const targetH = BASE_H * targetScale;

        const prev = prevSizes.current[id] ?? { w: tile.width, h: tile.height };
        const newW = prev.w + (targetW - prev.w) * LERP;
        const newH = prev.h + (targetH - prev.h) * LERP;
        prevSizes.current[id] = { w: newW, h: newH };

        const cx = tile.x + tile.width / 2;
        const cy = tile.y + tile.height / 2;
        updates[id] = {
          x: cx - newW / 2,
          y: cy - newH / 2,
          width: Math.round(newW),
          height: Math.round(newH),
        };
      }

      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const a = ids[i];
          const b = ids[j];
          const ra: Rect = { x: updates[a].x, y: updates[a].y, w: updates[a].width, h: updates[a].height };
          const rb: Rect = { x: updates[b].x, y: updates[b].y, w: updates[b].width, h: updates[b].height };

          if (rectsOverlap(ra, rb)) {
            const acx = ra.x + ra.w / 2;
            const acy = ra.y + ra.h / 2;
            const bcx = rb.x + rb.w / 2;
            const bcy = rb.y + rb.h / 2;

            let dx = acx - bcx;
            let dy = acy - bcy;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            dx /= dist;
            dy /= dist;

            updates[a].x += dx * BOUNCE_STRENGTH;
            updates[a].y += dy * BOUNCE_STRENGTH;
            updates[b].x -= dx * BOUNCE_STRENGTH;
            updates[b].y -= dy * BOUNCE_STRENGTH;
          }
        }
      }

      for (const id of ids) {
        const u = updates[id];
        u.x = clamp(u.x, 0, stageSize.width - u.width);
        u.y = clamp(u.y, 0, stageSize.height - u.height);
      }

      useLayoutStore.setState((prev) => {
        const next = { ...prev.tiles };
        for (const id of ids) {
          if (!next[id]) continue;
          next[id] = { ...next[id], ...updates[id] };
        }
        return { tiles: next };
      });

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [enabled, audioLevels]);
}
