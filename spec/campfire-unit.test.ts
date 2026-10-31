import {describe,it,expect} from "vitest";
import { createMusicQueue } from "../src/server/campfire.ts";
import { createPresence } from "../src/server/presence.ts";
import { pickNextTarget } from "../src/server/guinea-pig.ts";
import { CAMPFIRE, SEATS } from "../src/shared/campfire.ts";
import type { Player } from "../src/shared/presence.ts";
import type { WebSocket } from "ws";
const p:Player={id:"a",room:"outdoor",x:640,y:640,facing:1,moving:false,color:0};
describe("campfire authority",()=>{
 it("validates range, identity quota across tabs, track choice and advances on server time",()=>{
 const q=createMusicQueue();expect(q.addYouTube("a",{...p,x:1200},"https://youtu.be/M7lc1UVf-VE","embers",0)).toBeTruthy();
 expect(q.addYouTube("a",p,"invalid","bad",0)).toBeTruthy();expect(q.addYouTube("a",p,"https://youtu.be/M7lc1UVf-VE","embers",0)).toBeNull();
 expect(q.addYouTube("a",p,"https://youtu.be/M7lc1UVf-VE","stars",1)).toBeNull();expect(q.addYouTube("a",{...p,id:"another-tab"},"https://youtu.be/M7lc1UVf-VE","meadow",2)).toBeTruthy();
 expect(q.addYouTube("b",{...p,id:"b"},"https://youtu.be/M7lc1UVf-VE","meadow",3)).toBeNull();
 expect(q.tick(299999)).toBe(false);expect(q.tick(300000)).toBe(true);
 expect(q.snapshot(300000).current?.title).toBe("stars");q.remove("b");expect(q.snapshot(300000).upcoming).toHaveLength(0);
 });
 it("prevents two visitors taking one seat and releases on movement, room change and disconnect",()=>{
 const presence=createPresence(),a={} as WebSocket,b={} as WebSocket;
 const aid=presence.join(a),bid=presence.join(b);
 presence.moveRoom(aid,"outdoor",{x:554,y:492});presence.moveRoom(bid,"outdoor",{x:554,y:492});
 presence.input(a,{type:"campfire-seat",seatId:"west"},1000);presence.input(b,{type:"campfire-seat",seatId:"west"},1000);
 expect(presence.playerFor(a)?.seatId).toBe("west");expect(presence.playerFor(b)?.seatId).toBeUndefined();
 presence.input(a,{type:"visitor-input",room:"outdoor",dx:1,dy:0},1100);expect(presence.playerFor(a)?.seatId).toBeUndefined();
 presence.input(b,{type:"campfire-seat",seatId:"west"},1200);expect(presence.playerFor(b)?.seatId).toBe("west");
 presence.moveRoom(bid,"indoor");expect(presence.playerFor(b)?.seatId).toBeUndefined();presence.leave(a);expect(presence.snapshot()).toHaveLength(1);
 });
 it("animals take clear finite routes and keep moving over 2000 decisions",()=>{
 let seed=9;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
 let x=25,y=60,moves=0,visits=0;
 const obstacles=[{...CAMPFIRE,radius:34},...SEATS.map(s=>({...s,radius:27}))];
 for(let i=0;i<2000;i++){
 const t=pickNextTarget(x,y,random);expect(Number.isFinite(t.durationMs)).toBe(true);
 for(const o of obstacles){if(Math.hypot(x*12.8-o.x,y*10.24-o.y)<o.radius)continue;
 for(let j=1;j<=24;j++)expect(Math.hypot((x+(t.targetX-x)*j/24)*12.8-o.x,(y+(t.targetY-y)*j/24)*10.24-o.y)).toBeGreaterThanOrEqual(o.radius);}
 if(Math.hypot(t.targetX-x,t.targetY-y)>1)moves++;
 x=t.targetX;y=t.targetY;if(Math.hypot(x*12.8-CAMPFIRE.x,y*10.24-CAMPFIRE.y)<100)visits++;
 }expect(moves).toBeGreaterThan(1900);expect(visits).toBeGreaterThan(100);
 });
});
