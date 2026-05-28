import { useEffect, useState } from 'react';
import {
  LocalParticipant,
  RoomEvent,
  Track,
  type RemoteParticipant,
  type Room,
  type VideoTrack,
} from 'livekit-client';

export interface VideoSourceItem {
  tileId: string;
  participantIdentity: string;
  isScreenShare: boolean;
  isLocal: boolean;
  track: VideoTrack;
}

function collect(room: Room): VideoSourceItem[] {
  const list: VideoSourceItem[] = [];

  const addParticipant = (p: LocalParticipant | RemoteParticipant) => {
    p.trackPublications.forEach((pub) => {
      if (pub.kind !== Track.Kind.Video) return;
      const t = pub.track;
      if (!t || t.kind !== Track.Kind.Video) return;
      list.push({
        tileId: `${p.identity}:${pub.trackSid}`,
        participantIdentity: p.identity,
        isScreenShare: pub.source === Track.Source.ScreenShare,
        isLocal: p instanceof LocalParticipant,
        track: t as VideoTrack,
      });
    });
  };

  addParticipant(room.localParticipant);
  room.remoteParticipants.forEach((rp) => addParticipant(rp));
  return list;
}

export function useVideoSources(room: Room | null): VideoSourceItem[] {
  const [sources, setSources] = useState<VideoSourceItem[]>([]);

  useEffect(() => {
    if (!room) {
      setSources([]);
      return;
    }

    const rebuild = () => setSources(collect(room));

    rebuild();

    room.on(RoomEvent.LocalTrackPublished, rebuild);
    room.on(RoomEvent.LocalTrackUnpublished, rebuild);
    room.on(RoomEvent.TrackPublished, rebuild);
    room.on(RoomEvent.TrackMuted, rebuild);
    room.on(RoomEvent.TrackUnmuted, rebuild);
    room.on(RoomEvent.TrackSubscribed, rebuild);
    room.on(RoomEvent.TrackUnsubscribed, rebuild);
    room.on(RoomEvent.ParticipantConnected, rebuild);
    room.on(RoomEvent.ParticipantDisconnected, rebuild);

    return () => {
      room.off(RoomEvent.LocalTrackPublished, rebuild);
      room.off(RoomEvent.LocalTrackUnpublished, rebuild);
      room.off(RoomEvent.TrackPublished, rebuild);
      room.off(RoomEvent.TrackMuted, rebuild);
      room.off(RoomEvent.TrackUnmuted, rebuild);
      room.off(RoomEvent.TrackSubscribed, rebuild);
      room.off(RoomEvent.TrackUnsubscribed, rebuild);
      room.off(RoomEvent.ParticipantConnected, rebuild);
      room.off(RoomEvent.ParticipantDisconnected, rebuild);
    };
  }, [room]);

  return sources;
}
