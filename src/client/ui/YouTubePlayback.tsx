import { useEffect, useRef, useState } from "react";
import type { MusicState } from "../../shared/campfire.ts";
import { loadYouTube, type YouTubePlayer } from "../net/youtube.ts";
import { presenceState } from "../game/presenceState.ts";
import { radioDistanceGain } from "../game/radioDistance.ts";
import { EventBus } from "../game/eventBus.ts";

type Current = NonNullable<MusicState["current"]>;
export function YouTubePlayback({ track, enabled, muted, volume, serverOffset }: {
  track: Current; enabled: boolean; muted: boolean; volume: number; serverOffset: number;
}) {
  const host = useRef<HTMLDivElement>(null), player = useRef<YouTubePlayer | null>(null);
  const audioReady=useRef(false);
  const settings = useRef({ muted, volume, serverOffset });
  const audio=useRef<{instance:YouTubePlayer|null;gain:number;lastVolume:number;lastMuted:boolean|undefined;at:number}>({instance:null,gain:1,lastVolume:-1,lastMuted:undefined,at:0});
  settings.current = { muted, volume, serverOffset };
  const [status, setStatus] = useState("Enable sound to load the YouTube player."), [retry, setRetry] = useState(0);
  const elapsed = () => Math.max(0, (Date.now() + settings.current.serverOffset - track.startedAt) / 1000);
  const updateAudio=()=>{
    const p=player.current;if(!p||!audioReady.current)return;
    const self=presenceState.players.find(visitor=>visitor.id===presenceState.selfId);
    const target=radioDistanceGain(self),now=performance.now(),state=audio.current;
    if(state.instance!==p){state.instance=p;state.gain=target;state.lastVolume=-1;state.lastMuted=undefined;state.at=now;}
    const blend=1-Math.exp(-Math.max(0,Math.min(200,now-state.at))/220);
    state.gain+=(target-state.gain)*blend;state.at=now;
    const effective=Math.round(settings.current.volume*state.gain*100);
    if(effective!==state.lastVolume){p.setVolume(effective);state.lastVolume=effective;}
    if(settings.current.muted!==state.lastMuted){
      if(settings.current.muted)p.mute();else p.unMute();
      state.lastMuted=settings.current.muted;
    }
  };
  useEffect(()=>{
    updateAudio();
    const timer=setInterval(updateAudio,50);
    return ()=>clearInterval(timer);
  },[muted,volume]);
  useEffect(() => {
    if (!enabled || !host.current) return;
    audioReady.current=false;
    let cancelled = false, ready = false, wasVisible = false;
    let interval: ReturnType<typeof setInterval> | undefined;
    // Collapsing the radio hides controls, not the listening session.
    const visible = () => !document.hidden;
    const report = (p: YouTubePlayer) => {
      const seconds = p.getDuration();
      if (seconds > 0) EventBus.emit("visitor-input", { type: "music-duration", playbackId: track.playbackId, seconds });
    };
    const updateVisibility = () => {
      if (!ready || !player.current) return;
      const shown = visible();
      if (!shown) { player.current.pauseVideo(); if (wasVisible) setStatus("Paused locally while the game tab is hidden."); }
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
            player.current = target; ready = true; audioReady.current=true;
            target.getIframe().title = `YouTube: ${track.title}`;
            target.getIframe().referrerPolicy = "strict-origin-when-cross-origin";
            updateAudio();
            report(target); setStatus("Use the YouTube player to listen. Playback may differ between visitors.");
            updateVisibility();
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
    return () => { audioReady.current=false; cancelled = true; clearInterval(interval); document.removeEventListener("visibilitychange", updateVisibility); player.current?.destroy(); player.current = null; };
  }, [track.playbackId, enabled, retry]);
  return <section className="youtube-playback" aria-label="YouTube player">
    <strong>YouTube · shared playback prototype</strong>
    <div ref={host} className="youtube-frame" />
    <p role="status">{status}</p>
    <a href={`https://www.youtube.com/watch?v=${track.videoId}`} target="_blank" rel="noreferrer">Open on YouTube ↗</a>
    {enabled && <button type="button" onClick={() => {
      if (player.current && audioReady.current) { player.current.seekTo(elapsed(), true); player.current.playVideo(); }
      else setRetry(n => n + 1);
    }}>Rejoin shared playback</button>}
    <small>Music continues when the radio controls are collapsed. Ads, availability and autoplay can differ for each visitor.</small>
  </section>;
}
