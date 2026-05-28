import type { CSSProperties } from 'react';
import type { ShapePresetId } from '@chat-freely/shared';

/** CSS clip-path values (video stays rectangular; only visibility is clipped). */
export const SHAPE_CLIP_PATH: Record<ShapePresetId, string> = {
  rect: 'inset(0 round 14px)',
  circle: 'circle(50% at 50% 50%)',
  hexagon: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)',
  star: 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)',
  'chat-bubble':
    'polygon(0% 12%, 0% 75%, 72% 75%, 78% 92%, 84% 75%, 100% 75%, 100% 12%)',
  'skew-card': 'polygon(5% 0%, 100% 0%, 95% 100%, 0% 100%)',
};

export const SHAPE_LABEL: Record<ShapePresetId, string> = {
  rect: 'Rounded rect',
  circle: 'Circle',
  hexagon: 'Hexagon',
  star: 'Star',
  'chat-bubble': 'Bubble',
  'skew-card': 'Skew card',
};

export const SHAPE_PRESET_LIST: ShapePresetId[] = [
  'rect',
  'circle',
  'hexagon',
  'star',
  'chat-bubble',
  'skew-card',
];

/**
 * Rect/circle use border-radius (reliable with HTML video in Chrome/WebKit).
 * Polygons use clip-path — can be finicky; keep -webkit- prefix via React style.
 */
export function getVideoContainerStyle(
  preset: ShapePresetId,
  clipOverride?: string,
): CSSProperties {
  if (clipOverride) {
    return {
      clipPath: clipOverride,
      WebkitClipPath: clipOverride,
      overflow: 'hidden',
      borderRadius: 0,
    };
  }
  if (preset === 'rect') {
    return { borderRadius: 14, overflow: 'hidden' };
  }
  if (preset === 'circle') {
    return { borderRadius: '50%', overflow: 'hidden' };
  }
  const c = SHAPE_CLIP_PATH[preset];
  return {
    clipPath: c,
    WebkitClipPath: c,
    overflow: 'hidden',
    borderRadius: 0,
  };
}
