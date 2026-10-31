// Integration fixtures walk real authenticated avatars before invoking proximity
// actions. There is no teleport endpoint or production test bypass.
import WebSocket from "ws";
import { meadowRoute } from "./meadow-route.ts";
import { randomUUID } from "node:crypto";
import { afterEach } from "vitest";
import { cookieFor } from "./identity.ts";
import type { Player } from "../src/shared/presence.ts";
import { sitePosition, FEED_REACH, BUILD_REACH, roomDimensions } from "../src/shared/interactions.ts";
import { FARM_PLOTS, FARM_REACH } from "../src/shared/farm.ts";
interface Actor { ws: WebSocket; id: string; player: Player; cookie: string }
const actors = new Map<string, Promise<Actor>>();
const walks = new Map<string, Promise<Actor>>();
function actor(base: string, cookie: string): Promise<Actor> {
  const key = base + cookie;
  if (!actors.has(key)) actors.set(key, new Promise((resolve, reject) => {
    const url = new URL("/ws", base); url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(url, { headers: { cookie } });
    let connected: Actor | undefined;
    ws.on("error", reject);
    ws.on("message", raw => {
      const message = JSON.parse(raw.toString());
      if (message.type === "presence-welcome") {
        connected = { ws, id: message.selfId, player: message.players.find((p: Player) => p.id === message.selfId), cookie };
        resolve(connected);
      } else if (message.type === "presence-state" && connected) {
        connected.player = message.players.find((p: Player) => p.id === connected!.id) ?? connected.player;
      }
    });
  }));
  return actors.get(key)!;
}
export async function approachCookie(base: string, cookie: string, target: string): Promise<Actor> {
  const key = base + cookie + target;
  if (walks.has(key)) return walks.get(key)!;
  const work = (async () => {
    const a = await actor(base, cookie);
    let route:{x:number;y:number}[]=[];
    for (let i = 0; i < 600; i++) {
      let x: number, y: number, reach: number;
      if (target === "feed") {
        const state = await globalThis.fetch(new URL("/api/state", base)).then(r => r.json());
        const size=roomDimensions(state.guineaPigMovement.room);
        x = state.guineaPigMovement.x * size.width/100; y = state.guineaPigMovement.y * size.height/100; reach = FEED_REACH - 15; // Huahua spawns in the campfire; the nearest free cell is 32px away
      } else if (target === "farm") {
        ({ x, y } = FARM_PLOTS[0]); reach = FARM_REACH - 15;
      } else {
        ({ x, y } = sitePosition(target)!); reach = BUILD_REACH - 15;
      }
      const dx = x - a.player.x, dy = y - a.player.y, distance = Math.hypot(dx, dy);
      if (a.player.room === "outdoor" && distance <= reach) {
        a.ws.send(JSON.stringify({ type: "visitor-input", room: "outdoor", dx: 0, dy: 0 }));
        return a;
      }
      if(!route.length)route=meadowRoute(a.player,{x,y},Math.max(8,reach-12));
      while(route.length>1&&Math.hypot(route[0].x-a.player.x,route[0].y-a.player.y)<8)route.shift();
      if(route.length===1&&Math.hypot(route[0].x-a.player.x,route[0].y-a.player.y)<8){route=[];continue;}
      const waypoint=route[0],wx=waypoint.x-a.player.x,wy=waypoint.y-a.player.y;
      a.ws.send(JSON.stringify({type:"visitor-input",room:"outdoor",dx:Math.abs(wx)>Math.abs(wy)?Math.sign(wx):0,dy:Math.abs(wx)>Math.abs(wy)?0:Math.sign(wy)}));
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error(`Could not walk to ${target}`);
  })();
  walks.set(key, work);
  try { return await work; } finally { walks.delete(key); }
}
export const approach = (base: string, visitor: string, target: string) => approachCookie(base, cookieFor(visitor), target);
export async function interactionFetch(input: string | URL, init?: RequestInit) {
  const url = new URL(input);
  if (init?.method !== "POST" || !["/api/feed", "/api/construction/contribute"].includes(url.pathname)) return globalThis.fetch(input, init);
  const headers = new Headers(init.headers);
  const cookie = headers.get("cookie") ?? cookieFor(randomUUID());
  const body = typeof init.body === "string" ? JSON.parse(init.body) : {};
  const a = await approachCookie(url.origin, cookie, url.pathname === "/api/feed" ? "feed" : body.projectId);
  headers.set("cookie", cookie); headers.set("X-Player-Id", a.id);
  return globalThis.fetch(input, { ...init, headers });
}
afterEach(async () => {
  const connected = await Promise.allSettled(actors.values());
  await Promise.all(connected.map(async result => {
    if (result.status !== "fulfilled") return;
    const { ws } = result.value;
    if (ws.readyState === WebSocket.CLOSED) return;
    await new Promise<void>(resolve => { ws.once("close", () => resolve()); ws.close(); });
  }));
  actors.clear(); walks.clear();
});
