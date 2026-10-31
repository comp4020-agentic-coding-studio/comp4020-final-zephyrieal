import { useEffect, useRef, useState } from "react";
import type { MusicState } from "../../shared/campfire.ts";
import { loadYouTube, type YouTubePlayer } from "../net/youtube.ts";
import { EventBus } from "../game/eventBus.ts";

type Current = NonNullable<MusicState["current"]>;
export function YouTubePlayback({ track, enabled, near, muted, volume, serverOffset }: {
  track: Current; enabled: boolean; near: boolean; muted: boolean; volume: number; serverOffset: number;
}) {
  const host = useRef<HTMLDivElement>(null), player = useRef<YouTubePlayer | null>(null);
  const settings = useRef({ near, muted, volume, serverOffset });
  settings.current = { near, muted, volume, serverOffset };
  const [status, setStatus] = useState("Enable sound to load the YouTube player."), [retry, setRetry] = useState(0);
  const elapsed = () => Math.max(0, (Date.now() + settings.current.serverOffset - track.startedAt) / 1000);
  useEffect(() => {
    const p = player.current;
    if (!p) return;
    p.setVolume(volume * 100);
    if (muted || !near) p.mute(); else p.unMute();
    if (!near) p.pauseVideo();
  }, [near, muted, volume]);
  useEffect(() => {
    if (!enabled || !host.current) return;
    let cancelled = false, ready = false, wasVisible = false;
    let observer: IntersectionObserver | undefined;
    let interval: ReturnType<typeof setInterval> | undefined;
    let intersection = false;
    const visible = () => !!host.current && intersection && !document.hidden && settings.current.near &&
      getComputedStyle(host.current).visibility !== "hidden" && !host.current.closest("[inert]");
    const report = (p: YouTubePlayer) => {
      const seconds = p.getDuration();
      if (seconds > 0) EventBus.emit("visitor-input", { type: "music-duration", playbackId: track.playbackId, seconds });
    };
    const updateVisibility = () => {
      if (!ready || !player.current) return;
      const shown = visible();
      if (!shown) { player.current.pauseVideo(); if (wasVisible) setStatus("Paused locally. Keep the player visible and stay near the fire."); }
      else if (!wasVisible) { player.current.seekTo(elapsed(), true); player.current.playVideo(); }
      wasVisible = shown;
    };
    setStatus("Loading YouTube…");
    void loadYouTube().then(api => {
      if (cancelled || !host.current) return;
      const mount = document.createElement("div"); host.current.replaceChildren(mount);
      const instance = new api.Player(mount, {
        videoId: track.videoId!, width: "100%", height: "210", host: "https://www.youtube-nocookie.com",
        playerVars: { origin: location.origin, playsinline: 1, controls: 1, autoplay: 0, start: Math.floor(elapsed()) },
        events: {
          onReady: ({target}) => {
            if (cancelled) return;
            player.current = target; ready = true;
            target.getIframe().title = `YouTube: ${track.title}`;
            target.getIframe().referrerPolicy = "strict-origin-when-cross-origin";
            target.setVolume(settings.current.volume * 100);
            if (settings.current.muted || !settings.current.near) target.mute(); else target.unMute();
            report(target); setStatus("Use the YouTube player to listen. Playback may differ between visitors.");
            observer = new IntersectionObserver(entries => { intersection = entries[0].intersectionRatio >= .5; updateVisibility(); }, {threshold: [.5]});
            observer.observe(host.current!);
            interval = setInterval(() => { updateVisibility(); }, 500);
          },
          onStateChange: ({target,data}) => {
            if (cancelled) return;
            if (data === 1) { report(target); if (!visible()) target.pauseVideo(); else setStatus("Playing from YouTube · shared queue prototype"); }
            if (data === 0) setStatus("This video has ended. Waiting for the shared queue to advance.");
          },
          onError: ({data}) => { if (!cancelled) setStatus(`YouTube cannot play this video here (code ${data}). It may be unavailable or embedding may be disabled. The person who queued it can skip it.`); },
          onAutoplayBlocked: () => { if (!cancelled) setStatus("Your browser blocked autoplay. Press Play in the YouTube player."); },
        },
      });
      player.current = instance;
    }).catch(error => { if (!cancelled) setStatus(error.message); });
    document.addEventListener("visibilitychange", updateVisibility);
    return () => { cancelled = true; clearInterval(interval); observer?.disconnect(); document.removeEventListener("visibilitychange", updateVisibility); player.current?.destroy(); player.current = null; };
  }, [track.playbackId, enabled, retry]);
  return <section className="youtube-playback" aria-label="YouTube player">
    <strong>YouTube · shared playback prototype</strong>
    <div ref={host} className="youtube-frame" />
    <p role="status">{status}</p>
    <a href={`https://www.youtube.com/watch?v=${track.videoId}`} target="_blank" rel="noreferrer">Open on YouTube ↗</a>
    {enabled && <button type="button" onClick={() => {
      if (player.current && near) { player.current.seekTo(elapsed(), true); player.current.playVideo(); }
      else setRetry(n => n + 1);
    }}>Rejoin shared playback</button>}
    <small>Keep the video visible to listen. Ads, availability and autoplay can differ for each visitor.</small>
  </section>;
}
