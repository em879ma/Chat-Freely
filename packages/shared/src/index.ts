export type LayoutMode = 'free' | 'grid';

export type ShapePresetId =
  | 'rect'
  | 'circle'
  | 'hexagon'
  | 'star'
  | 'chat-bubble'
  | 'skew-card';

export interface ParticipantTileState {
  /** Display name / LiveKit identity (one person may have multiple tiles, e.g. camera + screen). */
  participantIdentity: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
  shapePreset: ShapePresetId;
  /** Optional override; defaults come from shape preset map on the client. */
  clipPath?: string;
}

export interface SessionLayoutState {
  layoutMode: LayoutMode;
  tiles: Record<string, ParticipantTileState>;
}

export interface RoomSettings {
  /** data-URL of the background image (or null to clear) */
  bgDataUrl: string | null;
  bgOpacity: number;
  volumeAlert: boolean;
  /** Natural aspect ratio (width/height) of the uploaded bg image; null = default */
  stageAspect: number | null;
}

export type ClientMessage =
  | { type: 'chat'; room: string; body: string; sender: string; ts: number }
  | { type: 'layout-sync'; room: string; layout: SessionLayoutState; sender: string; ts: number }
  | { type: 'room-settings'; room: string; settings: RoomSettings; sender: string; ts: number }
  | { type: 'whiteboard-sync'; room: string; json: string; sender: string; ts: number };

export interface TokenResponse {
  token: string;
  url: string;
}
