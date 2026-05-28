import './loadEnv.js';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { AccessToken } from 'livekit-server-sdk';
import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'node:http';
import type { ClientMessage, SessionLayoutState, RoomSettings } from '@chat-freely/shared';

const PORT = Number(process.env.SIGNALING_PORT ?? 8787);
/** Bind all interfaces so 127.0.0.1 / localhost / LAN IP all work (Safari + phone testing). */
const HOST = (process.env.SIGNALING_HOST ?? '0.0.0.0').trim() || '0.0.0.0';
const LIVEKIT_URL = (process.env.LIVEKIT_URL ?? '').trim();
const LIVEKIT_API_KEY = (process.env.LIVEKIT_API_KEY ?? '').trim();
const LIVEKIT_API_SECRET = (process.env.LIVEKIT_API_SECRET ?? '').trim();

const app = new Hono();

const CORS_ORIGIN = (process.env.CORS_ORIGIN ?? '').trim();

app.use(
  '*',
  cors({
    origin: (origin) => {
      if (CORS_ORIGIN === '*') return origin ?? '*';
      if (!origin) return origin;
      if (CORS_ORIGIN) {
        return CORS_ORIGIN.split(',').map((s) => s.trim()).includes(origin) ? origin : null;
      }
      try {
        const u = new URL(origin);
        if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') {
          if (u.protocol === 'http:' || u.protocol === 'https:') return origin;
        }
      } catch {
        /* ignore */
      }
      return null;
    },
    allowMethods: ['GET', 'POST', 'OPTIONS'],
  }),
);

app.get('/health', (c) => c.json({ ok: true }));

app.post('/token', async (c) => {
  if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET || !LIVEKIT_URL) {
    return c.json(
      {
        error:
          'Server missing LIVEKIT_URL, LIVEKIT_API_KEY, or LIVEKIT_API_SECRET. Copy .env.example to .env in the repo root.',
      },
      503,
    );
  }

  let body: { room?: string; identity?: string; name?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const room = body.room?.trim();
  const identity = body.identity?.trim();
  if (!room || !identity) {
    return c.json({ error: 'room and identity are required' }, 400);
  }

  const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity,
    name: body.name ?? identity,
  });
  at.addGrant({
    room,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });

  const token = await at.toJwt();
  return c.json({ token, url: LIVEKIT_URL });
});

const server = serve(
  { fetch: app.fetch, port: PORT, hostname: HOST },
  () => {
    console.log(
      `Signaling + token API on http://127.0.0.1:${PORT}/health (bound ${HOST}, pid ${process.pid})`,
    );
  },
);

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `[signaling] Port ${PORT} is already in use. Stop the other process: lsof -i :${PORT}  then kill <PID>. Or set SIGNALING_PORT in .env.`,
    );
  } else {
    console.error('[signaling] Server error:', err);
  }
  process.exit(1);
});

type RoomClient = { ws: WebSocket; identity: string };

const rooms = new Map<string, Set<RoomClient>>();

function broadcast(room: string, data: ClientMessage, except?: WebSocket) {
  const set = rooms.get(room);
  if (!set) return;
  const payload = JSON.stringify(data);
  for (const client of set) {
    if (client.ws !== except && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(payload);
    }
  }
}

const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (request: IncomingMessage, socket, head) => {
  const url = new URL(request.url ?? '', 'http://localhost');
  if (url.pathname !== '/ws') {
    socket.destroy();
    return;
  }
  const room = url.searchParams.get('room')?.trim();
  const identity = url.searchParams.get('identity')?.trim();
  if (!room || !identity) {
    socket.destroy();
    return;
  }

  wss.handleUpgrade(request, socket, head, (ws) => {
    const client: RoomClient = { ws, identity };
    if (!rooms.has(room)) rooms.set(room, new Set());
    rooms.get(room)!.add(client);

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(String(raw)) as
          | { type: 'chat'; body: string }
          | { type: 'layout-sync'; layout: SessionLayoutState }
          | { type: 'room-settings'; settings: RoomSettings }
          | { type: 'whiteboard-sync'; json: string };
        if (msg.type === 'chat' && typeof msg.body === 'string') {
          const out: ClientMessage = {
            type: 'chat',
            room,
            body: msg.body.slice(0, 4000),
            sender: identity,
            ts: Date.now(),
          };
          broadcast(room, out);
        } else if (msg.type === 'layout-sync' && msg.layout) {
          const out: ClientMessage = {
            type: 'layout-sync',
            room,
            layout: msg.layout,
            sender: identity,
            ts: Date.now(),
          };
          broadcast(room, out, ws);
        } else if (msg.type === 'room-settings' && msg.settings) {
          const out: ClientMessage = {
            type: 'room-settings',
            room,
            settings: msg.settings,
            sender: identity,
            ts: Date.now(),
          };
          broadcast(room, out, ws);
        } else if (msg.type === 'whiteboard-sync' && typeof msg.json === 'string') {
          const out: ClientMessage = {
            type: 'whiteboard-sync',
            room,
            json: msg.json,
            sender: identity,
            ts: Date.now(),
          };
          broadcast(room, out, ws);
        }
      } catch {
        /* ignore */
      }
    });

    ws.on('close', () => {
      rooms.get(room)?.delete(client);
      if (rooms.get(room)?.size === 0) rooms.delete(room);
    });
  });
});
