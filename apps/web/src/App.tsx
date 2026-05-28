import { useCallback, useEffect, useMemo, useState } from 'react';
import { Room, RoomEvent } from 'livekit-client';
import { ConnectScreen } from './components/ConnectScreen';
import { RoomView } from './components/RoomView';
import { isAppleSafari } from './util/browser';

function getRoomFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('room')?.trim() || null;
}

export default function App() {
  const [session, setSession] = useState<{
    room: Room;
    sessionRoom: string;
    identity: string;
  } | null>(null);

  const initialRoom = useMemo(getRoomFromUrl, []);

  const connect = useCallback(
    async (opts: { token: string; url: string; room: string; identity: string }) => {
      const safari = isAppleSafari();
      const room = new Room({
        adaptiveStream: !safari,
        dynacast: !safari,
        videoCaptureDefaults: {
          facingMode: 'user',
          resolution: safari
            ? { width: 640, height: 480, frameRate: 30 }
            : { width: 1280, height: 720, frameRate: 30 },
        },
      });
      room.on(RoomEvent.Disconnected, () => {
        setSession(null);
        const url = new URL(window.location.href);
        url.searchParams.delete('room');
        window.history.replaceState({}, '', url.toString());
      });
      try {
        await room.connect(opts.url.trim(), opts.token.trim());
        void room.startAudio().catch(() => {});
        try {
          await room.localParticipant.setCameraEnabled(true);
        } catch (e) {
          console.warn('Camera failed to start', e);
        }
        try {
          await room.localParticipant.setMicrophoneEnabled(true);
        } catch (e) {
          console.warn('Microphone failed to start', e);
        }

        const url = new URL(window.location.href);
        url.searchParams.set('room', opts.room);
        window.history.replaceState({}, '', url.toString());

        setSession({
          room,
          sessionRoom: opts.room,
          identity: opts.identity,
        });
      } catch (e) {
        await room.disconnect();
        window.alert(e instanceof Error ? e.message : String(e));
      }
    },
    [],
  );

  const leave = useCallback(() => {
    void session?.room.disconnect();
    setSession(null);
    const url = new URL(window.location.href);
    url.searchParams.delete('room');
    window.history.replaceState({}, '', url.toString());
  }, [session]);

  useEffect(() => {
    return () => {
      void session?.room.disconnect();
    };
  }, [session]);

  if (!session) {
    return <ConnectScreen onConnected={(p) => void connect(p)} initialRoom={initialRoom} />;
  }

  return (
    <RoomView
      room={session.room}
      sessionRoom={session.sessionRoom}
      identity={session.identity}
      onLeave={leave}
    />
  );
}
