import { useState, useEffect } from 'react';
import { getSignalingHttpBase } from '../util/signalingBaseUrl';

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const seg = (n: number) =>
    Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `${seg(3)}-${seg(4)}`;
}

export function ConnectScreen(props: {
  onConnected: (opts: {
    token: string;
    url: string;
    room: string;
    identity: string;
  }) => void | Promise<void>;
  initialRoom?: string | null;
}) {
  const [mode, setMode] = useState<'home' | 'create' | 'join'>(
    props.initialRoom ? 'join' : 'home',
  );
  const [roomCode, setRoomCode] = useState(props.initialRoom ?? '');
  const [displayName, setDisplayName] = useState(
    () => localStorage.getItem('cf-display-name') ?? '',
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedCode, setGeneratedCode] = useState('');

  useEffect(() => {
    if (mode === 'create' && !generatedCode) {
      setGeneratedCode(generateRoomCode());
    }
  }, [mode, generatedCode]);

  const doJoin = async (room: string, name: string) => {
    const trimmedRoom = room.trim();
    const trimmedName = name.trim() || `User-${Math.floor(Math.random() * 9000 + 1000)}`;
    if (!trimmedRoom) {
      setError('Please enter a room code');
      return;
    }
    if (!trimmedName) {
      setError('Please enter your name');
      return;
    }
    setBusy(true);
    setError(null);
    localStorage.setItem('cf-display-name', trimmedName);
    try {
      const identity = `${trimmedName.replace(/\s+/g, '-')}-${Math.floor(Math.random() * 9000 + 1000)}`;
      const res = await fetch(`${getSignalingHttpBase()}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room: trimmedRoom,
          identity,
          name: trimmedName,
        }),
      });
      const data = (await res.json()) as { token?: string; url?: string; error?: string };
      if (!res.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      const token = data.token?.trim();
      const url = data.url?.trim();
      if (!token || !url) {
        setError('Malformed token response');
        return;
      }
      await Promise.resolve(
        props.onConnected({
          token,
          url,
          room: trimmedRoom,
          identity,
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (mode === 'home') {
    return (
      <div className="connect-screen">
        <div className="connect-card lobby-card">
          <div className="lobby-brand">
            <h1>Chat Freely</h1>
            <p className="connect-lead">
              Free-form video conferencing on a shared canvas.
            </p>
          </div>

          <label className="field">
            <span>Your name</span>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Enter your display name"
              autoComplete="name"
            />
          </label>

          <div className="lobby-actions">
            <button
              type="button"
              className="btn primary focus-ring lobby-btn"
              onClick={() => {
                if (!displayName.trim()) {
                  setError('Please enter your name first');
                  return;
                }
                setError(null);
                setMode('create');
              }}
            >
              <span className="lobby-btn-icon">+</span>
              Create a room
            </button>
            <button
              type="button"
              className="btn secondary focus-ring lobby-btn"
              onClick={() => {
                if (!displayName.trim()) {
                  setError('Please enter your name first');
                  return;
                }
                setError(null);
                setMode('join');
              }}
            >
              <span className="lobby-btn-icon">→</span>
              Join a room
            </button>
          </div>

          {error && <div className="connect-error">{error}</div>}
        </div>
      </div>
    );
  }

  if (mode === 'create') {
    return (
      <div className="connect-screen">
        <div className="connect-card lobby-card">
          <button type="button" className="back-link" onClick={() => { setMode('home'); setError(null); }}>
            ← Back
          </button>
          <h1>Create a room</h1>
          <p className="connect-lead">
            Share this code with others so they can join your room.
          </p>

          <div className="room-code-display">
            <span className="room-code-value">{generatedCode}</span>
            <button
              type="button"
              className="btn ghost focus-ring room-code-copy"
              onClick={() => {
                void navigator.clipboard.writeText(generatedCode);
              }}
            >
              Copy
            </button>
            <button
              type="button"
              className="btn ghost focus-ring room-code-copy"
              onClick={() => setGeneratedCode(generateRoomCode())}
            >
              ↻
            </button>
          </div>

          {error && <div className="connect-error">{error}</div>}

          <button
            type="button"
            className="btn primary focus-ring"
            disabled={busy}
            onClick={() => doJoin(generatedCode, displayName)}
          >
            {busy ? 'Creating…' : 'Create & Join'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="connect-screen">
      <div className="connect-card lobby-card">
        <button type="button" className="back-link" onClick={() => { setMode('home'); setError(null); }}>
          ← Back
        </button>
        <h1>Join a room</h1>
        <p className="connect-lead">Enter the room code shared by the host.</p>

        <label className="field">
          <span>Room code</span>
          <input
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
            placeholder="e.g. ABC-1234"
            autoComplete="off"
            className="room-code-input"
          />
        </label>

        {error && <div className="connect-error">{error}</div>}

        <button
          type="button"
          className="btn primary focus-ring"
          disabled={busy || !roomCode.trim()}
          onClick={() => doJoin(roomCode, displayName)}
        >
          {busy ? 'Joining…' : 'Join room'}
        </button>
      </div>
    </div>
  );
}
