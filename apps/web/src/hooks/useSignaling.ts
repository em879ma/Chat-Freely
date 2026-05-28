import { useEffect, useRef } from 'react';
import type { ClientMessage, SessionLayoutState, RoomSettings } from '@chat-freely/shared';

/** Build `ws(s)://host` from signaling HTTP base URL. */
function toWebSocketOrigin(httpBase: string): string {
  try {
    const u = new URL(httpBase);
    const proto = u.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${u.host}`;
  } catch {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}`;
  }
}

export function useSignaling(options: {
  signalingUrl: string;
  room: string;
  identity: string;
  enabled: boolean;
  onChat?: (m: Extract<ClientMessage, { type: 'chat' }>) => void;
  onLayoutRemote?: (m: Extract<ClientMessage, { type: 'layout-sync' }>) => void;
  onRoomSettings?: (m: Extract<ClientMessage, { type: 'room-settings' }>) => void;
  onWhiteboardSync?: (m: Extract<ClientMessage, { type: 'whiteboard-sync' }>) => void;
  sendLayout: () => SessionLayoutState | null;
}) {
  const { signalingUrl, room, identity, enabled, sendLayout } = options;
  const onChatRef = useRef(options.onChat);
  const onLayoutRef = useRef(options.onLayoutRemote);
  const onSettingsRef = useRef(options.onRoomSettings);
  const onWbSyncRef = useRef(options.onWhiteboardSync);
  onChatRef.current = options.onChat;
  onLayoutRef.current = options.onLayoutRemote;
  onSettingsRef.current = options.onRoomSettings;
  onWbSyncRef.current = options.onWhiteboardSync;

  const wsRef = useRef<WebSocket | null>(null);
  const layoutTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sendLayoutRef = useRef(sendLayout);
  sendLayoutRef.current = sendLayout;

  useEffect(() => {
    if (!enabled || !room || !identity) return;

    const wsOrigin = toWebSocketOrigin(signalingUrl);
    const u = new URL(`${wsOrigin}/ws`);
    u.searchParams.set('room', room);
    u.searchParams.set('identity', identity);
    const ws = new WebSocket(u.toString());
    wsRef.current = ws;

    ws.addEventListener('message', (ev) => {
      try {
        const msg = JSON.parse(String(ev.data)) as ClientMessage;
        if (msg.type === 'chat') onChatRef.current?.(msg);
        if (msg.type === 'layout-sync') onLayoutRef.current?.(msg);
        if (msg.type === 'room-settings') onSettingsRef.current?.(msg);
        if (msg.type === 'whiteboard-sync') onWbSyncRef.current?.(msg);
      } catch {
        /* ignore */
      }
    });

    return () => {
      if (layoutTimer.current) clearTimeout(layoutTimer.current);
      ws.close();
      wsRef.current = null;
    };
  }, [enabled, room, identity, signalingUrl]);

  const scheduleLayoutBroadcast = () => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    if (layoutTimer.current) clearTimeout(layoutTimer.current);
    layoutTimer.current = setTimeout(() => {
      const layout = sendLayoutRef.current();
      if (!layout) return;
      ws.send(JSON.stringify({ type: 'layout-sync', layout }));
    }, 200);
  };

  const sendChat = (body: string) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'chat', body }));
  };

  const sendRoomSettings = (settings: RoomSettings) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'room-settings', settings }));
  };

  const sendWhiteboardSync = (json: string) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'whiteboard-sync', json }));
  };

  return { scheduleLayoutBroadcast, sendChat, sendRoomSettings, sendWhiteboardSync };
}
