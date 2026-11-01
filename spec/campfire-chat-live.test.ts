import { describe, expect, inject, it, afterEach } from "vitest";
import WebSocket from "ws";
import { randomUUID } from "node:crypto";
import { connectAs, nextMessage } from "./ws-client.ts";
import { meadowRoute } from "./meadow-route.ts";
import { CAMPFIRE_CHAT } from "../src/shared/chat.ts";
import type { Player } from "../src/shared/presence.ts";

// Real sockets against the running server: membership comes only from the
// server-owned avatar position, never from anything the client claims.
const base = inject("baseUrl");
const open: WebSocket[] = [];
afterEach(() => { for (const ws of open) ws.close(); open.length = 0; });

async function visitor() {
  const ws = await connectAs(base, randomUUID()); open.push(ws);
  const state = { id: "", player: undefined as Player | undefined, member: false, messages: [] as any[] };
  ws.on("message", raw => {
    const msg = JSON.parse(raw.toString());
    if (msg.type === "presence-welcome") state.id = msg.selfId;
    if (msg.type === "presence-welcome" || msg.type === "presence-state") state.player = msg.players.find((p: Player) => p.id === state.id) ?? state.player;
    if (msg.type === "chat-status") state.member = msg.member;
    if (msg.type === "chat-message") state.messages.push(msg.message);
  });
  await nextMessage(ws, m => m.type === "presence-welcome");
  return { ws, state };
}
async function until(check: () => boolean, ms = 5000) {
  const end = Date.now() + ms;
  while (!check()) { if (Date.now() > end) throw new Error("condition not met"); await new Promise(r => setTimeout(r, 25)); }
}
async function walk(v: Awaited<ReturnType<typeof visitor>>, to: { x: number; y: number }, reach = 16) {
  let route = meadowRoute(v.state.player!, to, reach);
  for (let i = 0; i < 800; i++) {
    const p = v.state.player!;
    if (Math.hypot(to.x - p.x, to.y - p.y) <= reach) break;
    while (route.length > 1 && Math.hypot(route[0].x - p.x, route[0].y - p.y) < 8) route.shift();
    const w = route[0], dx = w.x - p.x, dy = w.y - p.y;
    v.ws.send(JSON.stringify({ type: "visitor-input", room: "outdoor", dx: Math.abs(dx) > Math.abs(dy) ? Math.sign(dx) : 0, dy: Math.abs(dx) > Math.abs(dy) ? 0 : Math.sign(dy) }));
    await new Promise(r => setTimeout(r, 50));
  }
  v.ws.send(JSON.stringify({ type: "visitor-input", room: "outdoor", dx: 0, dy: 0 }));
}
const fire = { x: CAMPFIRE_CHAT.x, y: CAMPFIRE_CHAT.y + 90 };
const far = { x: CAMPFIRE_CHAT.x, y: CAMPFIRE_CHAT.y + CAMPFIRE_CHAT.leave + 60 };

describe("campfire chat over the live socket", () => {
  it("reaches visitors at the campfire and nobody outside it", async () => {
    const a = await visitor(), b = await visitor(), c = await visitor();
    await Promise.all([walk(a, fire, 40), walk(b, fire, 40), walk(c, far)]);
    await until(() => a.state.member && b.state.member && !c.state.member);
    a.ws.send(JSON.stringify({ type: "chat-send", text: "hello by the fire", clientId: "a-1" }));
    await until(() => b.state.messages.some(m => m.text === "hello by the fire"));
    await until(() => a.state.messages.some(m => m.clientId === "a-1"));
    expect(b.state.messages.find(m => m.text === "hello by the fire").clientId).toBeUndefined();
    await new Promise(r => setTimeout(r, 300));
    expect(c.state.messages).toEqual([]);

    // Outside the area, a send is refused rather than delivered anywhere.
    c.ws.send(JSON.stringify({ type: "chat-send", text: "anyone?", clientId: "c-1" }));
    expect(await nextMessage(c.ws, m => m.type === "chat-rejected")).toMatchObject({ clientId: "c-1", reason: "Return to the campfire to send." });
  }, 60000);

  it("stops delivery once a visitor walks away", async () => {
    const a = await visitor(), b = await visitor();
    await Promise.all([walk(a, fire, 40), walk(b, fire, 40)]);
    await until(() => a.state.member && b.state.member);
    await walk(b, far);
    await until(() => !b.state.member);
    a.ws.send(JSON.stringify({ type: "chat-send", text: "are you still there", clientId: "a-2" }));
    await until(() => a.state.messages.some(m => m.clientId === "a-2"));
    await new Promise(r => setTimeout(r, 300));
    expect(b.state.messages.map(m => m.text)).not.toContain("are you still there");
  }, 60000);
});
