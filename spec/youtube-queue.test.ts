import { describe, it, expect } from "vitest";
import { createMusicQueue } from "../src/server/campfire.ts";
import { youtubeVideoId, YOUTUBE_MAX_MS, YOUTUBE_FALLBACK_MS } from "../src/shared/campfire.ts";
import type { Player } from "../src/shared/presence.ts";
const p:Player={id:"a",room:"outdoor",x:640,y:640,facing:1,moving:false,color:0};
const url="https://music.youtube.com/watch?v=M7lc1UVf-VE";
describe("YouTube shared queue",()=>{
 it("accepts video links and rejects foreign hosts, insecure links and playlists",()=>{
  for(const link of [url,"https://youtu.be/M7lc1UVf-VE","https://www.youtube.com/shorts/M7lc1UVf-VE"]) expect(youtubeVideoId(link)).toBe("M7lc1UVf-VE");
  for(const link of [null,"javascript:alert(1)","https://youtube.com.evil.test/watch?v=M7lc1UVf-VE","http://youtube.com/watch?v=M7lc1UVf-VE","https://user@youtube.com/watch?v=M7lc1UVf-VE","https://youtube.com/playlist?list=abc","https://youtu.be/invalid"]) expect(youtubeVideoId(link)).toBeNull();
 });
 it("shares quota across tabs, checks proximity and strips private owners",()=>{
  const q=createMusicQueue();expect(q.addYouTube("secret",{...p,x:1200},url,"",0)).toBeTruthy();
  expect(q.addYouTube("secret",p,url,"Demo",0)).toBeNull();
  expect(q.addYouTube("secret",p,"https://youtu.be/M7lc1UVf-VE","embers",1)).toBeNull();
  expect(q.addYouTube("secret",{...p,id:"tab2"},url,"Second",2)).toBeTruthy();
  expect(JSON.stringify(q.snapshot(2))).not.toContain("secret");
  q.remove("other");expect(q.snapshot(3).upcoming).toHaveLength(1);
  q.remove("secret");expect(q.snapshot(3).upcoming).toHaveLength(0);
 });
 it("accepts one bounded duration only from its owner and advances to the next video",()=>{
  const q=createMusicQueue();q.addYouTube("a",p,url,"Demo",1000);q.addYouTube("b",{...p,id:"b"},"https://youtu.be/M7lc1UVf-VE","stars",1001);
  const id=q.snapshot(1001).current!.playbackId;
  expect(q.reportDuration("b",id,1)).toBe(false);expect(q.reportDuration("a","stale",1)).toBe(false);
  for(const n of [NaN,Infinity,0,-1]) expect(q.reportDuration("a",id,n)).toBe(false);
  expect(q.reportDuration("a",id,2)).toBe(true);expect(q.reportDuration("a",id,300)).toBe(false);
  expect(q.tick(2999)).toBe(false);expect(q.tick(3000)).toBe(true);expect(q.snapshot(3000).current?.title).toBe("stars");
  expect(q.reportDuration("a",id,1)).toBe(false);
 });
 it("caps long videos, expires unavailable videos and restricts skipping",()=>{
  const q=createMusicQueue();q.addYouTube("a",p,url,"Demo",0);
  const id=q.snapshot(0).current!.playbackId;
  expect(q.skip("b",p,id,1)).toBeTruthy();expect(q.skip("a",{...p,x:1200},id,1)).toBeTruthy();
  expect(q.reportDuration("a",id,999999)).toBe(true);expect(q.snapshot(1).current!.durationMs).toBe(YOUTUBE_MAX_MS);
  expect(q.skip("a",p,id,2)).toBeNull();expect(q.snapshot(2).current).toBeNull();
  q.addYouTube("a",p,url,"Demo",3);expect(q.tick(3+YOUTUBE_FALLBACK_MS)).toBe(true);expect(q.snapshot(3+YOUTUBE_FALLBACK_MS).current).toBeNull();
 });
});
