import { YouTubePlayback } from "./YouTubePlayback.tsx";
import { useEffect, useRef, useState } from "react";
import { CAMPFIRE, youtubeVideoId, type MusicState } from "../../shared/campfire.ts";
import { inReach } from "../../shared/interactions.ts";
import { presenceState } from "../game/presenceState.ts";
import { EventBus } from "../game/eventBus.ts";
export function CampfirePanel() {
  const [expanded,setExpanded]=useState(false);
  const [youtubeUrl, setYouTubeUrl] = useState(""), [youtubeTitle, setYouTubeTitle] = useState(""), [urlError, setUrlError] = useState("");
  const [near,setNear]=useState(false);
  const [music,setMusic]=useState<MusicState>({current:null,upcoming:[],serverNow:0});
  const [enabled,setEnabled]=useState(false), [volume,setVolume]=useState(.25), [muted,setMuted]=useState(false);
  const clock=useRef({server:0,local:0});
  const panel=useRef<HTMLElement>(null);
  useEffect(()=>{
    const update=()=>{ const self=presenceState.players.find(p=>p.id===presenceState.selfId); setNear(presenceState.connected && inReach(self,CAMPFIRE.x,CAMPFIRE.y,CAMPFIRE.reach)); };
    const receive=(state:MusicState)=>{clock.current={server:state.serverNow,local:Date.now()};setMusic(state);};
    const open=()=>setExpanded(true);
    EventBus.on("presence-updated",update);EventBus.on("music-state",receive);EventBus.on("open-campfire",open);
    return ()=>{EventBus.off("presence-updated",update);EventBus.off("music-state",receive);EventBus.off("open-campfire",open);};
  },[]);
  const self=presenceState.players.find(p=>p.id===presenceState.selfId);
  const pending=music.upcoming.some(t=>t.playerId===self?.id);
  const title=(track: {trackId:string;title?:string})=>track.title ?? track.trackId;
  const send=(intent:unknown)=>EventBus.emit("visitor-input",intent);
  return <section ref={panel} className="campfire-panel" aria-label="Campfire gathering">
    <div className="radio-header"><button type="button" className="radio-toggle" aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}>♫ Campfire Radio <span>{expanded ? "−" : "+"}</span></button></div>
    <div className={expanded ? "radio-details" : "radio-details radio-hidden"}>
    <div><span className="campfire-eyebrow">A place to pause</span><h2>By the campfire</h2>
    <p>{near ? "Walk beside a free log and press E to sit. Press E again or walk to stand up." : "Find the fire in the middle of the meadow. Walk closer to sit or share music."}</p></div>
    <div className="campfire-music"><div><strong>Shared meadow radio</strong><p role="status">Now playing: {music.current ? title(music.current) : "Quiet by the fire"}</p>
    <p>Up next · one waiting track per visitor</p><ol>{music.upcoming.map((t,i)=><li key={`${t.playerId}-${i}`}>{title(t)}{t.playerId===self?.id ? " · yours" : ""}</li>)}</ol>{!music.upcoming.length && <p className="shop-hint">The queue is clear.</p>}
    {near && <div className="campfire-track-buttons"><button onClick={()=>send({type:"music-remove"})}>Remove my waiting track</button></div>}</div>
    {music.current?.videoId && <>
      <YouTubePlayback track={music.current} enabled={enabled} near={near} muted={muted} volume={volume}
        serverOffset={clock.current.server - clock.current.local} />
      {near && music.current.playerId === self?.id && <button type="button" onClick={() => send({type:"music-skip",playbackId:music.current!.playbackId})}>Skip my current YouTube track</button>}
    </>}
    {near && <form className="youtube-queue-form" onSubmit={event => {
      event.preventDefault();
      if (!youtubeVideoId(youtubeUrl)) { setUrlError("Paste a YouTube or YouTube Music video link, not a playlist."); return; }
      setUrlError(""); send({type:"music-add-youtube",url:youtubeUrl,title:youtubeTitle});
    }}>
      <strong>Queue from YouTube</strong>
      <label>YouTube or YouTube Music link<input type="url" required maxLength={2048} value={youtubeUrl} onChange={e => {setYouTubeUrl(e.target.value);setUrlError("");}} placeholder="https://music.youtube.com/watch?v=…" /></label>
      <label>Track name (optional)<input type="text" maxLength={80} value={youtubeTitle} onChange={e => setYouTubeTitle(e.target.value)} placeholder="Song · artist" /></label>
      {urlError && <p role="alert">{urlError}</p>}
      <button type="submit" disabled={pending || !youtubeUrl.trim()}>Queue YouTube track</button>
      <small>Share a video you own or have permission to play. One waiting track per visitor.</small>
    </form>}
    </div></div>
    <div className="radio-now" role="status">{music.current ? title(music.current) : "Quiet by the fire"}</div>
    <div className="campfire-listening"><strong>Your listening</strong><p>Sound stays near the fire.</p><button onClick={() => setEnabled(true)}>{enabled ? "Sound enabled" : "Enable sound"}</button>
    <button aria-pressed={muted} onClick={()=>setMuted(!muted)}>{muted ? "Unmute music" : "Mute music"}</button><label>Volume <input aria-label="Music volume" type="range" min="0" max="1" step="0.01" value={volume} onChange={e=>setVolume(Number(e.target.value))}/></label></div>
    <details className="music-notes" hidden={!expanded}><summary>About the music</summary><small>YouTube links use its visible embedded player. Shared YouTube playback is a prototype: up to 10 minutes per selection, or 5 minutes if the submitter’s player cannot report its length. The submitter can skip an unavailable track. Queues clear on server restart.</small></details>
  </section>;
}
