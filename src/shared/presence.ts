// Ephemeral visitor presence. Coordinates are in the game's logical pixel space.
import { isRoom, type Room } from "./rooms.ts";
export type { Room } from "./rooms.ts";
export type Gesture = "wave" | "sit" | "help";
export type PresenceIntent = MoveIntent | { type: "visitor-gesture"; gesture: Gesture };
export interface Player {
  gesture?: Gesture;
  id: string;
  room: Room;
  x: number;
  y: number;
  facing: -1 | 1;
  moving: boolean;
  color: number;
}
export type PresenceMessage =
  | { type: "presence-welcome"; selfId: string; players: Player[] }
  | { type: "presence-state"; players: Player[] };
export interface MoveIntent { type: "visitor-input"; room: Room; dx: number; dy: number }
export const WALK_SPEED = 120;
export const INPUT_LEASE_MS = 350;
export const ROOM_BOUNDS = {
  outdoor: { left: 16, right: 624, top: 72, bottom: 496 },
  indoor: { left: 200, right: 440, top: 184, bottom: 344 },
} satisfies Record<"outdoor" | "indoor", { left: number; right: number; top: number; bottom: number }>;
export function spawnIn(room: Room) {
  return room !== "outdoor" ? { x: 336, y: 336 } : { x: 320, y: 320 };
}
export function isMoveIntent(value: unknown): value is MoveIntent {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return v.type === "visitor-input" && isRoom(v.room) &&
    typeof v.dx === "number" && Number.isFinite(v.dx) && Math.abs(v.dx) <= 1 &&
    typeof v.dy === "number" && Number.isFinite(v.dy) && Math.abs(v.dy) <= 1;
}
export function stepPlayer(player: Player, dx: number, dy: number, seconds: number): void {
  const length = Math.max(1, Math.hypot(dx, dy));
  const distance = WALK_SPEED * Math.max(0, Math.min(seconds, 0.1));
  const bounds = ROOM_BOUNDS[player.room === "outdoor" ? "outdoor" : "indoor"];
  const x = Math.min(bounds.right, Math.max(bounds.left, player.x + dx / length * distance));
  const y = Math.min(bounds.bottom, Math.max(bounds.top, player.y + dy / length * distance));
  player.moving = x !== player.x || y !== player.y;
  player.x = x;
  player.y = y;
  if (dx) player.facing = dx < 0 ? -1 : 1;
}
