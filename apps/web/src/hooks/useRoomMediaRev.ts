import { useEffect, useReducer } from 'react';
import { RoomEvent, type Room } from 'livekit-client';

/**
 * Bumps when local (or room) track state changes so React re-reads
 * `localParticipant.isCameraEnabled` / `isMicrophoneEnabled`.
 */
export function useRoomMediaRev(room: Room): void {
  const [, bump] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    const h = () => bump();
    room.on(RoomEvent.LocalTrackPublished, h);
    room.on(RoomEvent.LocalTrackUnpublished, h);
    room.on(RoomEvent.TrackMuted, h);
    room.on(RoomEvent.TrackUnmuted, h);
    room.on(RoomEvent.ActiveDeviceChanged, h);
    room.on(RoomEvent.MediaDevicesChanged, h);
    return () => {
      room.off(RoomEvent.LocalTrackPublished, h);
      room.off(RoomEvent.LocalTrackUnpublished, h);
      room.off(RoomEvent.TrackMuted, h);
      room.off(RoomEvent.TrackUnmuted, h);
      room.off(RoomEvent.ActiveDeviceChanged, h);
      room.off(RoomEvent.MediaDevicesChanged, h);
    };
  }, [room]);
}
