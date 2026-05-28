import { create } from 'zustand';
import type { LayoutMode, ParticipantTileState } from '@chat-freely/shared';

const DEFAULT_W = 300;
const DEFAULT_H = Math.round((DEFAULT_W * 9) / 16);

function defaultTile(participantIdentity: string, _tileId: string, index: number): ParticipantTileState {
  const col = index % 4;
  const row = Math.floor(index / 4);
  return {
    participantIdentity,
    x: 24 + col * (DEFAULT_W + 16),
    y: 24 + row * (DEFAULT_H + 16),
    width: DEFAULT_W,
    height: DEFAULT_H,
    rotation: 0,
    zIndex: 10 + index,
    shapePreset: 'rect',
    clipPath: undefined,
  };
}

function gridLayout(
  identities: string[],
  width: number,
  height: number,
  prev: Record<string, ParticipantTileState>,
): Record<string, ParticipantTileState> {
  const n = Math.max(1, identities.length);
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  const margin = 16;
  const cellW = (width - margin * (cols + 1)) / cols;
  const cellH = (height - margin * (rows + 1)) / rows;
  const tileW = Math.max(120, cellW);
  const tileH = Math.max(68, Math.round((tileW * 9) / 16));
  const out: Record<string, ParticipantTileState> = {};
  identities.forEach((id, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    out[id] = {
      participantIdentity: prev[id]?.participantIdentity ?? id,
      x: margin + c * (cellW + margin) + (cellW - tileW) / 2,
      y: margin + r * (cellH + margin) + (cellH - tileH) / 2,
      width: tileW,
      height: tileH,
      rotation: 0,
      zIndex: 10 + i,
      shapePreset: prev[id]?.shapePreset ?? 'rect',
    };
  });
  return out;
}

export interface LayoutSlice {
  layoutMode: LayoutMode;
  tiles: Record<string, ParticipantTileState>;
  stageSize: { width: number; height: number };
  setLayoutMode: (mode: LayoutMode) => void;
  setStageSize: (width: number, height: number) => void;
  ensureTiles: (entries: { tileId: string; participantIdentity: string }[]) => void;
  removeTile: (tileId: string) => void;
  applyGrid: () => void;
  updateTile: (tileId: string, partial: Partial<ParticipantTileState>) => void;
  bumpZ: (tileId: string) => void;
  replaceLayout: (tiles: Record<string, ParticipantTileState>, layoutMode: LayoutMode) => void;
}

export const useLayoutStore = create<LayoutSlice>((set, get) => ({
  layoutMode: 'free',
  tiles: {},
  stageSize: { width: 1200, height: 720 },

  setLayoutMode: (mode) => {
    set({ layoutMode: mode });
    if (mode === 'grid') get().applyGrid();
  },

  setStageSize: (width, height) => set({ stageSize: { width, height } }),

  ensureTiles: (entries) => {
    set((state) => {
      const next = { ...state.tiles };
      let idx = Object.keys(next).length;
      entries.forEach(({ tileId, participantIdentity }) => {
        if (!next[tileId]) {
          next[tileId] = defaultTile(participantIdentity, tileId, idx);
          idx += 1;
        } else {
          next[tileId] = { ...next[tileId], participantIdentity };
        }
      });
      return { tiles: next };
    });
    if (get().layoutMode === 'grid') get().applyGrid();
  },

  removeTile: (tileId) =>
    set((state) => {
      const next = { ...state.tiles };
      delete next[tileId];
      return { tiles: next };
    }),

  applyGrid: () => {
    const { tiles, stageSize } = get();
    const ids = Object.keys(tiles);
    if (ids.length === 0) return;
    set({ tiles: gridLayout(ids, stageSize.width, stageSize.height, tiles) });
  },

  updateTile: (tileId, partial) =>
    set((state) => {
      const cur = state.tiles[tileId];
      if (!cur) return state;
      return { tiles: { ...state.tiles, [tileId]: { ...cur, ...partial } } };
    }),

  bumpZ: (tileId) =>
    set((state) => {
      const cur = state.tiles[tileId];
      if (!cur) return state;
      const maxZ = Math.max(
        ...Object.values(state.tiles).map((t) => t.zIndex),
        cur.zIndex,
      );
      return { tiles: { ...state.tiles, [tileId]: { ...cur, zIndex: maxZ + 1 } } };
    }),

  replaceLayout: (tiles, layoutMode) => set({ tiles: { ...tiles }, layoutMode }),
}));
