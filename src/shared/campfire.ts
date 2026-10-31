export const CAMPFIRE = { x: 640, y: 510, reach: 150 };
export const SEATS = [
  { id: "west", x: 554, y: 492 }, { id: "east", x: 726, y: 492 },
  { id: "south-west", x: 576, y: 578 }, { id: "south-east", x: 704, y: 578 },
] as const;
export const YOUTUBE_FALLBACK_MS = 5 * 60 * 1000;
export const YOUTUBE_MAX_MS = 10 * 60 * 1000;
export interface MusicTrack { trackId: string; title: string; videoId?: string; durationMs: number }
export interface MusicState {
  current: (MusicTrack & { startedAt: number; playbackId: string; playerId: string; awaitingDuration?: boolean }) | null;
  upcoming: (MusicTrack & { playerId: string })[];
  serverNow: number;
}
// Accept video links only, never arbitrary iframe URLs, playlists or HTML.
export function youtubeVideoId(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
    const host = url.hostname.toLowerCase();
    let id: string | null = null;
    if (host === "youtu.be") id = url.pathname.slice(1);
    else if (["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"].includes(host)) {
      if (url.pathname === "/watch") id = url.searchParams.get("v");
      else if (/^\/(shorts|embed)\/[^/]+$/.test(url.pathname)) id = url.pathname.split("/")[2];
    }
    return id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
  } catch { return null; }
}
