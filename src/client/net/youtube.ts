export interface YouTubePlayer {
  playVideo(): void; pauseVideo(): void; seekTo(seconds: number, allowSeekAhead: boolean): void;
  setVolume(volume: number): void; mute(): void; unMute(): void; getDuration(): number;
  destroy(): void; getIframe(): HTMLIFrameElement;
}
interface PlayerEvent { target: YouTubePlayer; data?: number }
export interface YouTubeAPI {
  Player: new (element: HTMLElement, options: {
    videoId: string; width: string; height: string; host: string;
    playerVars: Record<string, string | number>;
    events: { onReady(event: PlayerEvent): void; onStateChange(event: PlayerEvent): void; onError(event: PlayerEvent): void; onAutoplayBlocked(): void };
  }) => YouTubePlayer;
}
declare global { interface Window { YT?: YouTubeAPI; onYouTubeIframeAPIReady?: () => void } }
let loading: Promise<YouTubeAPI> | undefined;
export function loadYouTube(): Promise<YouTubeAPI> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (loading) return loading;
  loading = new Promise<YouTubeAPI>((resolve, reject) => {
    const script = document.createElement("script");
    const previous = window.onYouTubeIframeAPIReady;
    const fail = () => { clearTimeout(timeout); script.remove(); loading = undefined; window.onYouTubeIframeAPIReady = previous; reject(new Error("YouTube could not load. Check your connection and try again.")); };
    const timeout = window.setTimeout(fail, 15000);
    window.onYouTubeIframeAPIReady = () => { clearTimeout(timeout); previous?.(); if (window.YT) resolve(window.YT); };
    script.src = "https://www.youtube.com/iframe_api"; script.async = true; script.onerror = fail;
    document.head.append(script);
  });
  return loading;
}
