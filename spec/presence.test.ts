import { expect, it, inject } from "vitest";
import WebSocket from "ws";
import { randomUUID } from "node:crypto";
import { createPresence } from "../src/server/presence.ts";
import { WALK_SPEED, INPUT_LEASE_MS, ROOM_BOUNDS } from "../src/shared/presence.ts";
import { cookieFor } from "./identity.ts";
import { nextMessage } from "./ws-client.ts";

function fixture() {
  const presence = createPresence();
  const ws = {} as WebSocket;
  const id = presence.join(ws);
  return { presence, ws, id };
}
it("uses server time and normalises diagonal movement; client coordinates cannot teleport", () => {
  const { presence, ws } = fixture();
  const before = presence.snapshot()[0];
  presence.input(ws, { type: "visitor-input", room: "outdoor", dx: 1, dy: 1, x: 90000, speed: 9999 }, 1000);
  presence.tick(1050, 0.05);
  const after = presence.snapshot()[0];
  expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeCloseTo(WALK_SPEED * 0.05);
  expect(after.moving).toBe(true);
});
it("rejects malformed, non-finite, out-of-range and unknown-room intents", () => {
  const { presence, ws } = fixture();
  const before = presence.snapshot()[0];
  for (const value of [null, [], { type: "visitor-input", room: "private", dx: 1, dy: 0 },
    { type: "visitor-input", room: "outdoor", dx: Infinity, dy: 0 },
    { type: "visitor-input", room: "outdoor", dx: 2, dy: 0 }]) presence.input(ws, value, 1000);
  presence.tick(1050, 0.05);
  expect(presence.snapshot()[0]).toEqual(before);
});
it("stops when input expires, stays in bounds and resets position on room changes", () => {
  const { presence, ws } = fixture();
  const intent = { type: "visitor-input", room: "outdoor", dx: 1, dy: 0 };
  presence.moveRoom(presence.playerFor(ws)!.id,"outdoor",{x:640,y:620});
  for (let n = 0; n < 100; n++) {
    presence.input(ws, intent, n * 100);
    presence.tick(n * 100, 0.1);
  }
  expect(presence.snapshot()[0].x).toBe(ROOM_BOUNDS.outdoor.right);
  presence.input(ws, { ...intent, dx: -1 }, 10000);
  presence.tick(10000, 0.05);
  const x = presence.snapshot()[0].x;
  presence.tick(10000 + INPUT_LEASE_MS + 1, 0.05);
  expect(presence.snapshot()[0].x).toBe(x);
  expect(presence.snapshot()[0].moving).toBe(false);
  presence.input(ws, { ...intent, room: "indoor", dx: 0 }, 11000);
  expect(presence.snapshot()[0].room).toBe("outdoor");
  presence.moveRoom(presence.snapshot()[0].id, "indoor");
  expect(presence.snapshot()[0]).toMatchObject({ room: "indoor", x: 336, y: 336 });
});
it("keeps connections independent and removes departing avatars", () => {
  const { presence, ws, id } = fixture();
  const second = {} as WebSocket;
  const secondId = presence.join(second);
  expect(secondId).not.toBe(id);
  presence.moveRoom(id, "indoor");
  expect(presence.snapshot().find(p => p.id === secondId)?.room).toBe("outdoor");
  presence.leave(ws);
  expect(presence.tick(1000, 0.05)?.players.map(p => p.id)).toEqual([secondId]);
});
it("shares joins, movement and departures, and refuses room changes away from a doorway", async () => {
  const url = new URL("/ws", inject("baseUrl"));
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  async function join() {
    const cookie = cookieFor(randomUUID());
    const ws = new WebSocket(url, { headers: { cookie } });
    const welcome = await nextMessage(ws, msg => msg.type === "presence-welcome");
    return { ws, cookie, id: welcome.selfId as string, players: welcome.players };
  }
  const a = await join();
  let b: Awaited<ReturnType<typeof join>> | undefined;
  try {
    const joined = nextMessage(a.ws, msg => msg.type === "presence-state" && msg.players.length >= 2);
    b = await join();
    await joined;
    expect(b.players.some((p: { id: string }) => p.id === a.id)).toBe(true);
    const start = b.players.find((p: { id: string }) => p.id === a.id).x;
    const moved = nextMessage(b.ws, msg => msg.type === "presence-state" && msg.players.some((p: { id: string; x: number }) => p.id === a.id && p.x > start));
    a.ws.send(JSON.stringify({ type: "visitor-input", room: "outdoor", dx: 1, dy: 0 }));
    await moved;
    a.ws.send(JSON.stringify({ type: "visitor-input", room: "indoor", dx: 0, dy: 0 }));
    const entered = await fetch(new URL("/api/room", inject("baseUrl")), { method: "POST", headers: { "Content-Type": "application/json", cookie: a.cookie, "X-Player-Id": a.id }, body: JSON.stringify({ room: "indoor" }) });
    expect(entered.status).toBe(403);
    const stillOutside = nextMessage(b.ws, msg => msg.type === "presence-state" && msg.players.some((p: { id: string; room: string; x: number }) => p.id === a.id && p.room === "outdoor"));
    a.ws.send(JSON.stringify({ type: "visitor-input", room: "outdoor", dx: -1, dy: 0 }));
    await stillOutside;
    const left = nextMessage(b.ws, msg => msg.type === "presence-state" && !msg.players.some((p: { id: string }) => p.id === a.id));
    a.ws.close();
    await left;
  } finally { a.ws.close(); b?.ws.close(); }
});
