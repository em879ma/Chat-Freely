import { useEffect, useRef, useState } from 'react';
import {
  RoomEvent,
  type Participant,
  type Room,
} from 'livekit-client';

/**
 * Polls audio levels for every participant at ~15 fps.
 * Returns a map of identity → audioLevel (0–1).
 */
export function useAudioLevels(room: Room | null): Record<string, number> {
  const [levels, setLevels] = useState<Record<string, number>>({});
  const timerRef = useRef(0);

  useEffect(() => {
    if (!room) {
      setLevels({});
      return;
    }

    const collect = (): Record<string, number> => {
      const next: Record<string, number> = {};
      next[room.localParticipant.identity] = room.localParticipant.audioLevel;
      room.remoteParticipants.forEach((p) => {
        next[p.identity] = p.audioLevel;
      });
      return next;
    };

    const poll = () => setLevels(collect());

    const onSpeakers = (_speakers: Participant[]) => poll();

    room.on(RoomEvent.ActiveSpeakersChanged, onSpeakers);
    timerRef.current = window.setInterval(poll, 66);

    return () => {
      clearInterval(timerRef.current);
      room.off(RoomEvent.ActiveSpeakersChanged, onSpeakers);
    };
  }, [room]);

  return levels;
}
