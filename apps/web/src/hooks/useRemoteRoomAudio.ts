import { useEffect } from 'react';
import {
  RoomEvent,
  Track,
  type RemoteParticipant,
  type Room,
  type TrackPublication,
} from 'livekit-client';

/**
 * Attach remote mic tracks to hidden <audio> elements so we can keep all
 * <video> tiles muted (autoplay policy) without losing voice.
 */
export function useRemoteRoomAudio(room: Room | null): void {
  useEffect(() => {
    if (!room) return;

    const attachParticipantAudio = (p: RemoteParticipant) => {
      p.audioTrackPublications.forEach((pub) => {
        if (pub.kind !== Track.Kind.Audio) return;
        const t = pub.track;
        if (t) t.attach();
      });
    };

    room.remoteParticipants.forEach((p) => attachParticipantAudio(p));

    const onTrackSubscribed = (
      _track: Track,
      pub: TrackPublication,
      participant: RemoteParticipant,
    ) => {
      if (pub.kind === Track.Kind.Audio && pub.track) {
        pub.track.attach();
      }
    };

    const onParticipantConnected = (p: RemoteParticipant) => {
      attachParticipantAudio(p);
    };

    room.on(RoomEvent.TrackSubscribed, onTrackSubscribed);
    room.on(RoomEvent.ParticipantConnected, onParticipantConnected);

    return () => {
      room.off(RoomEvent.TrackSubscribed, onTrackSubscribed);
      room.off(RoomEvent.ParticipantConnected, onParticipantConnected);
    };
  }, [room]);
}
