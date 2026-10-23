import { expect, it } from "vitest";
import type WebSocket from "ws";
import { createPresence } from "../src/server/presence.ts";
it("only changes the sending avatar and expires transient gestures using server time", () => {
  const p = createPresence(), a = {} as WebSocket, b = {} as WebSocket;
  p.join(a); p.join(b);
  p.input(a, { type: "visitor-gesture", gesture: "help", playerId: p.playerFor(b)!.id, duration: 999999 }, 1000);
  expect(p.tick(1050, .05)?.players.map(x => x.gesture)).toEqual(["help", undefined]);
  p.tick(4000, .05);
  expect(p.playerFor(a)?.gesture).toBeUndefined();
});
it("keeps sitting through neutral input but ends it on walking or room changes", () => {
  const p = createPresence(), a = {} as WebSocket; const id = p.join(a);
  p.input(a, { type: "visitor-gesture", gesture: "sit" }, 1000);
  p.input(a, { type: "visitor-input", room: "outdoor", dx: 0, dy: 0 }, 1100);
  p.tick(9000, .05); expect(p.playerFor(a)?.gesture).toBe("sit");
  p.input(a, { type: "visitor-input", room: "outdoor", dx: 1, dy: 0 }, 9100);
  expect(p.playerFor(a)?.gesture).toBeUndefined();
  p.input(a, { type: "visitor-gesture", gesture: "sit" }, 10000);
  p.moveRoom(id, "indoor"); expect(p.playerFor(a)?.gesture).toBeUndefined();
});
it("rejects unknown gestures and limits repeated requests", () => {
  const p = createPresence(), a = {} as WebSocket; p.join(a);
  p.input(a, { type: "visitor-gesture", gesture: "dance" }, 1000);
  expect(p.playerFor(a)?.gesture).toBeUndefined();
  p.input(a, { type: "visitor-gesture", gesture: "sit" }, 2000);
  p.input(a, { type: "visitor-gesture", gesture: "wave" }, 2100);
  expect(p.playerFor(a)?.gesture).toBe("sit");
  p.input(a, { type: "visitor-gesture", gesture: "sit" }, 3000);
  expect(p.playerFor(a)?.gesture).toBeUndefined();
  p.leave(a); expect(p.snapshot()).toEqual([]);
});
