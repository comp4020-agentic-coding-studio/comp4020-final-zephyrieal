import { SEATS } from "../shared/campfire.ts";
import { inReach } from "../shared/interactions.ts";
import { randomUUID } from "node:crypto";
import type { WebSocket } from "ws";
import { INPUT_LEASE_MS, isMoveIntent, spawnIn, stepPlayer, type Player, type Room } from "../shared/presence.ts";

// One avatar per connected browser tab, with a public id unrelated to its cookie.
// Positions are deliberately not persisted: leaving removes your presence.
export function createPresence() {
  const sessions = new Map<WebSocket, {
    player: Player; dx: number; dy: number; lastInput: number;
    windowStart: number; messages: number; gestureUntil?: number; lastGesture?: number;
  }>();
  const palette = [0x5179a8, 0xb76d78, 0x9071b0, 0xc48b42, 0x4d9184, 0xa16f4e];
  let nextColor = 0;
  let dirty = false;
  const snapshot = () => Array.from(sessions.values(), ({ player }) => ({ ...player }));
  return {
    snapshot,
    playerFor(ws: WebSocket) { return sessions.get(ws)?.player; },
    join(ws: WebSocket, name?: string) {
      const player: Player = {
        id: randomUUID(), room: "outdoor", ...spawnIn("outdoor"),
        facing: 1, moving: false, color: palette[nextColor++ % palette.length],
        ...(name ? { name } : {}),
      };
      // Spread arrivals out so newcomers can see one another immediately.
      player.x += ((sessions.size % 5) - 2) * 64;
      sessions.set(ws, { player, dx: 0, dy: 0, lastInput: 0, windowStart: 0, messages: 0 });
      dirty = true;
      return player.id;
    },
    moveRoom(playerId: string, room: Room, position?: { x: number; y: number }) {
      const session = Array.from(sessions.values()).find(s => s.player.id === playerId);
      if (!session) return;
      delete session.player.seatId;
      delete session.player.gesture;
      session.gestureUntil = undefined;
      session.player.room = room;
      Object.assign(session.player, position ?? spawnIn(room));
      session.player.moving = false;
      session.dx = 0; session.dy = 0; dirty = true;
      return session.player;
    },
    rename(ws: WebSocket, name: string) {
      const session = sessions.get(ws);
      if (session) { session.player.name = name; dirty = true; }
    },
    leave(ws: WebSocket) { dirty = sessions.delete(ws) || dirty; },
    input(ws: WebSocket, value: unknown, now: number) {
      const session = sessions.get(ws);
      if (!session) return;
      if (now - session.windowStart >= 1000) {
        session.windowStart = now;
        session.messages = 0;
      }
      if (++session.messages > 60) return;
      if (value && typeof value === "object" && "type" in value && value.type === "campfire-seat") {
        const seat = SEATS.find(s => s.id === (value as { seatId?: unknown }).seatId);
        if (!seat || !inReach(session.player, seat.x, seat.y, 64) ||
          Array.from(sessions.values()).some(s => s.player.id !== session.player.id && s.player.seatId === seat.id)) return;
        session.player.seatId = seat.id;
        Object.assign(session.player, { x: seat.x, y: seat.y, gesture: "sit", moving: false });
        session.gestureUntil = undefined; session.dx = 0; session.dy = 0; dirty = true; return;
      }
      if (value && typeof value === "object" && "type" in value && value.type === "visitor-gesture") {
        const gesture = "gesture" in value ? value.gesture : undefined;
        if (gesture !== "wave" && gesture !== "sit" && gesture !== "help") return;
        if (session.lastGesture !== undefined && now - session.lastGesture < 800 && !(gesture === "sit" && session.player.gesture === "sit")) return;
        session.lastGesture = now;
        if(session.player.seatId) session.player.y += 22;
        delete session.player.seatId;
        if (gesture === "sit" && session.player.gesture === "sit") {
          delete session.player.gesture;
          session.gestureUntil = undefined;
        } else {
          session.player.gesture = gesture;
          session.gestureUntil = gesture === "sit" ? undefined : now + 3000;
          if (gesture === "sit") { session.dx = 0; session.dy = 0; session.player.moving = false; }
        }
        dirty = true;
        return;
      }
      if (!isMoveIntent(value)) return;
      if (value.dx || value.dy || session.player.room !== value.room) {
        if(session.player.seatId) session.player.y += 22;
        delete session.player.seatId;
        if (session.player.gesture) { delete session.player.gesture; session.gestureUntil = undefined; dirty = true; }
      }
      // Rooms change only through /api/room, which checks the building doorway.
      if (session.player.room !== value.room) return;
      // Ignore client positions, identities, speed and time. Only direction is accepted.
      session.dx = value.dx;
      session.dy = value.dy;
      session.lastInput = now;
    },
    tick(now: number, seconds: number) {
      for (const session of sessions.values()) {
        const { player } = session;
        if (session.gestureUntil !== undefined && now >= session.gestureUntil) {
          delete player.gesture; session.gestureUntil = undefined; dirty = true;
        }
        const oldX = player.x, oldY = player.y, oldMoving = player.moving;
        const active = now - session.lastInput <= INPUT_LEASE_MS;
        stepPlayer(player, active ? session.dx : 0, active ? session.dy : 0, seconds);
        dirty ||= player.x !== oldX || player.y !== oldY || player.moving !== oldMoving;
      }
      if (!dirty) return undefined;
      dirty = false;
      return { type: "presence-state" as const, players: snapshot() };
    },
  };
}
