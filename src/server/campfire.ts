import { randomUUID } from "node:crypto";
import { CAMPFIRE, YOUTUBE_FALLBACK_MS, YOUTUBE_MAX_MS, youtubeVideoId, type MusicState, type MusicTrack } from "../shared/campfire.ts";
import { inReach } from "../shared/interactions.ts";
import type { Player } from "../shared/presence.ts";
export function createMusicQueue() {
  let current: MusicState["current"] = null;
  let currentOwner: string | null = null;
  let upcoming: (MusicTrack & { playerId: string; owner: string })[] = [];
  const snapshot = (now: number): MusicState => ({ current: current && { ...current }, upcoming: upcoming.map(({ owner, ...track }) => track), serverNow: now });
  function tick(now: number) {
    if (current && now < current.startedAt + current.durationMs) return false;
    if (!current && !upcoming.length) return false;
    const next = upcoming.shift();
    currentOwner = next?.owner ?? null;
    if (next) {
      const { owner, ...track } = next;
      current = { ...track, startedAt: now, playbackId: randomUUID(), awaitingDuration: !!track.videoId };
    } else current = null;
    return true;
  }
  function enqueue(owner: string, player: Player | undefined, track: MusicTrack, now: number) {
    if (!inReach(player, CAMPFIRE.x, CAMPFIRE.y, CAMPFIRE.reach)) return "Walk over to the campfire first.";
    if (upcoming.some(t => t.owner === owner)) return "You already have one track waiting.";
    if (upcoming.length >= 24) return "The queue is full. Enjoy a track and try again.";
    upcoming.push({ ...track, owner, playerId: player!.id }); tick(now);
    return null;
  }
  return { snapshot, tick,
    addYouTube(owner: string, player: Player | undefined, url: unknown, label: unknown, now: number) {
      const videoId = youtubeVideoId(url);
      if (!videoId) return "Paste a valid HTTPS YouTube or YouTube Music video link.";
      const title = typeof label === "string" ? label.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 80) : "";
      return enqueue(owner, player, { trackId: `youtube:${videoId}`, videoId, title: title || `YouTube · ${videoId}`, durationMs: YOUTUBE_FALLBACK_MS }, now);
    },
    // Prototype timing: only the submitter may supply a bounded duration for
    // their own current selection. Never let a stale report affect another song.
    reportDuration(owner: string, playbackId: unknown, seconds: unknown) {
      if (!current?.videoId || !current.awaitingDuration || currentOwner !== owner || current.playbackId !== playbackId ||
        typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0) return false;
      current.durationMs = Math.max(1000, Math.min(YOUTUBE_MAX_MS, Math.ceil(seconds * 1000)));
      current.awaitingDuration = false;
      return true;
    },
    skip(owner: string, player: Player | undefined, playbackId: unknown, now: number) {
      if (!current?.videoId || currentOwner !== owner || current.playbackId !== playbackId) return "Only the visitor who queued this YouTube track can skip it.";
      if (!inReach(player, CAMPFIRE.x, CAMPFIRE.y, CAMPFIRE.reach)) return "Walk over to the campfire first.";
      current = null; currentOwner = null; tick(now); return null;
    },
    remove(owner: string) { upcoming = upcoming.filter(t => t.owner !== owner); },
  };
}
