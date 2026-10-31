// Ephemeral visitor presence. Coordinates are in the game's logical pixel space.
import { blockedMeadow } from "./meadow.ts";
import { MEADOW_WIDTH, MEADOW_HEIGHT } from "./interactions.ts";
import { isRoom, type Room } from "./rooms.ts";
export type { Room } from "./rooms.ts";
export type Gesture = "wave" | "sit" | "help";
export type PresenceIntent = { type: "campfire-seat"; seatId: string } | { type: "music-add-youtube"; url: string; title: string } | { type: "music-duration"; playbackId: string; seconds: number } | { type: "music-skip"; playbackId: string } | { type: "music-remove" } | MoveIntent | { type: "visitor-gesture"; gesture: Gesture };
export interface Player {
  seatId?: string;
  gesture?: Gesture;
  name?: string;
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
  outdoor: { left: 64, right: MEADOW_WIDTH - 64, top: 96, bottom: MEADOW_HEIGHT - 64 },
  indoor: { left: 200, right: 440, top: 184, bottom: 344 },
} satisfies Record<"outdoor" | "indoor", { left: number; right: number; top: number; bottom: number }>;
export function spawnIn(room: Room) {
  return room !== "outdoor" ? { x: 336, y: 336 } : { x: 640, y: 640 };
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
  const oldX=player.x,oldY=player.y;
  // Resolve each axis to slide along visible footprints; seated visitors can exit their own log.
  const ignore=player.seatId;
  if(player.room!=="outdoor" || !blockedMeadow(x,oldY,8,ignore)) player.x=x;
  if(player.room!=="outdoor" || !blockedMeadow(player.x,y,8,ignore)) player.y=y;
  player.moving = player.x !== oldX || player.y !== oldY;
  if (dx) player.facing = dx < 0 ? -1 : 1;
}
