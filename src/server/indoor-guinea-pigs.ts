import type { Room } from "../shared/rooms.ts";
import { GUINEA_PIGS } from "../shared/guinea-pigs.ts";
import { BLOCKED_TILES, TILE_SIZE, type FurnitureRow } from "./furniture.ts";
import { currentPosition, tick, type GuineaPigMovement } from "./guinea-pig.ts";

type Piece = Pick<FurnitureRow, "tile_x" | "tile_y" | "width" | "height"> & Partial<Pick<FurnitureRow, "id" | "kind" | "rotation" | "version">>;
type Visit = { room: Room; movement: GuineaPigMovement; leaveAt: number; pauseUntil: number; using?: { key: string; phase: "approach" | "using" | "leaving"; activity: NonNullable<GuineaPigMovement["activity"]> }; cooldownUntil?: number };
const visits = new Map<string, Visit>();
const pieceKey = (p: Piece) => JSON.stringify([p.id, p.kind, p.tile_x, p.tile_y, p.width, p.height, p.rotation, p.version]);
const activityFor = (kind?: string): GuineaPigMovement["activity"] =>
  kind === "hay_bed" ? "resting" : kind === "hideout" ? "hiding" : kind === "tunnel" ? "exploring" : undefined;

const world = (m: GuineaPigMovement, now: number) => {
  const t = m.durationMs ? Math.max(0, Math.min(1, (now - m.startedAt) / m.durationMs)) : 1;
  return { x: (m.x + (m.targetX - m.x) * t) * 6.4, y: (m.y + (m.targetY - m.y) * t) * 5.12 };
};
const movement = (x: number, y: number, now: number, room: Room): GuineaPigMovement =>
  ({ x: x / 6.4, y: y / 5.12, targetX: x / 6.4, targetY: y / 5.12, startedAt: now, durationMs: 0, room });

// Leave room for the pig's body, not just its centre, around walls and furniture.
export function clearIndoorPoint(x: number, y: number, pieces: Piece[]) {
  return x >= 207 && x <= 433 && y >= 175 && y <= 337 && !pieces.some(p =>
    x > 160 + p.tile_x * TILE_SIZE - 14 && x < 160 + (p.tile_x + p.width) * TILE_SIZE + 14 &&
    y > 128 + p.tile_y * TILE_SIZE - 9 && y < 128 + (p.tile_y + p.height) * TILE_SIZE + 9);
}
export function clearIndoorPath(a: {x: number; y: number}, b: {x: number; y: number}, pieces: Piece[]) {
  const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 4));
  for (let i = 0; i <= steps; i++) {
    if (!clearIndoorPoint(a.x + (b.x - a.x) * i / steps, a.y + (b.y - a.y) * i / steps, pieces)) return false;
  }
  return true;
}
function freePoints(pieces: Piece[]) {
  const points = [];
  for (let y = 1; y < 7; y++) for (let x = 1; x < 9; x++) {
    const point = { x: 160 + x * 32 + 16, y: 128 + y * 32 + 16 };
    if (!BLOCKED_TILES.has(`${x},${y}`) && clearIndoorPoint(point.x, point.y, pieces)) points.push(point);
  }
  return points;
}
export function inhabitantPosition(id: string, now = Date.now()): GuineaPigMovement {
  const visit = visits.get(id);
  if (!visit) return { ...currentPosition(now, id), room: "outdoor" };
  const p = world(visit.movement, now);
  return { ...visit.movement, x: p.x / 6.4, y: p.y / 5.12 };
}

// Visitors attract one available meadow inhabitant into the shared room.
// This changes one canonical animal's location; it never creates a room clone.
export function visitHouse(room: Room, pieces: Piece[], now = Date.now()) {
  if (room === "outdoor" || [...visits.values()].some(v => v.room === room)) return;
  const pig = [...GUINEA_PIGS.slice(1), GUINEA_PIGS[0]].find(p => !visits.has(p.id));
  const start = freePoints(pieces).sort((a, b) => Math.hypot(a.x - 336, a.y - 336) - Math.hypot(b.x - 336, b.y - 336))[0];
  if (!pig || !start) return;
  const m = movement(start.x, start.y, now, room);
  visits.set(pig.id, { room, movement: m, leaveAt: now + 90000, pauseUntil: now + 1000 });
  return { guineaPigId: pig.id, ...m };
}
export function tickInhabitant(id: string, piecesFor: (room: Room) => Piece[], now = Date.now(), random = Math.random): GuineaPigMovement | undefined {
  const visit = visits.get(id);
  if (!visit) { const m = tick(now, random, id); return m && { ...m, room: "outdoor" }; }
  if (now >= visit.leaveAt) { visits.delete(id); return inhabitantPosition(id, now); }
  const pieces = piecesFor(visit.room);
  const p = world(visit.movement, now);
  const free = freePoints(pieces);
  // Only the selected furnishing is traversable. Moving/storing/rotating it
  // cancels the visit immediately; all other furniture remains an obstacle.
  const selected = visit.using && pieces.find(piece => pieceKey(piece) === visit.using!.key);
  if (visit.using && !selected) {
    visit.using = undefined;
    visit.movement = movement(p.x, p.y, now, visit.room);
    visit.pauseUntil = now;
    if (clearIndoorPoint(p.x, p.y, pieces)) return visit.movement;
  }
  if (visit.using && selected) {
    const obstacles = pieces.filter(piece => piece !== selected);
    const destination = world(visit.movement, visit.movement.startedAt + visit.movement.durationMs);
    if (!clearIndoorPath(p, destination, obstacles)) {
      visit.using = undefined;
      visit.movement = movement(p.x, p.y, now, visit.room);
      visit.pauseUntil = now;
    } else if (now < visit.movement.startedAt + visit.movement.durationMs || now < visit.pauseUntil) {
      return;
    } else if (visit.using.phase === "approach") {
      visit.using.phase = "using";
      visit.movement = { ...movement(p.x, p.y, now, visit.room), activity: visit.using.activity };
      visit.pauseUntil = now + 6000;
      return visit.movement;
    } else if (visit.using.phase === "using") {
      const exit = free.filter(target => clearIndoorPath(p, target, obstacles))
        .sort((a, b) => Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y))[0];
      if (!exit) return;
      visit.using.phase = "leaving";
      visit.pauseUntil = now;
      visit.movement = { ...movement(p.x, p.y, now, visit.room), targetX: exit.x/6.4, targetY: exit.y/5.12,
        durationMs: Math.max(800, Math.round(Math.hypot(exit.x-p.x,exit.y-p.y)/28*1000)) };
      return visit.movement;
    } else {
      visit.using = undefined;
      visit.cooldownUntil = now + 8000;
      visit.movement = movement(p.x, p.y, now, visit.room);
      visit.pauseUntil = now + 1000;
      return visit.movement;
    }
  }
  if (!clearIndoorPoint(p.x, p.y, pieces)) {
    const nearest = free.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
    if (!nearest) { visits.delete(id); return inhabitantPosition(id, now); }
    visit.movement = movement(nearest.x, nearest.y, now, visit.room);
    visit.pauseUntil = now + 1000;
    return visit.movement;
  }
  const destination = world(visit.movement, visit.movement.startedAt + visit.movement.durationMs);
  if (!clearIndoorPath(p, destination, pieces)) {
    visit.movement = movement(p.x, p.y, now, visit.room);
    visit.pauseUntil = now + 1000;
    return visit.movement;
  }
  if (now < visit.movement.startedAt + visit.movement.durationMs || now < visit.pauseUntil) return;
  if (visit.movement.durationMs) {
    visit.movement = movement(p.x, p.y, now, visit.room);
    visit.pauseUntil = now + 1000 + random() * 2500;
    return visit.movement;
  }
  if (now >= (visit.cooldownUntil ?? 0) && random() < 0.65) {
    const choices = pieces.flatMap(piece => {
      const activity = activityFor(piece.kind);
      if (!activity) return [];
      const target = { x: 160 + (piece.tile_x + piece.width/2)*TILE_SIZE,
        y: 128 + (piece.tile_y + piece.height/2)*TILE_SIZE };
      const obstacles = pieces.filter(other => other !== piece);
      // Require an unobstructed approach and a way back to ordinary floor.
      if (!clearIndoorPath(p, target, obstacles) || !free.some(exit => clearIndoorPath(target, exit, obstacles))) return [];
      return [{ piece, activity, target }];
    });
    const choice = choices[Math.min(choices.length-1, Math.floor(random()*choices.length))];
    if (choice) {
      visit.using = { key: pieceKey(choice.piece), phase: "approach", activity: choice.activity };
      visit.movement = { ...movement(p.x,p.y,now,visit.room), targetX: choice.target.x/6.4, targetY: choice.target.y/5.12,
        durationMs: Math.max(800,Math.round(Math.hypot(choice.target.x-p.x,choice.target.y-p.y)/28*1000)) };
      return visit.movement;
    }
  }
  const reachable = free.filter(target => Math.hypot(target.x - p.x, target.y - p.y) > 12 && clearIndoorPath(p, target, pieces));
  const target = reachable[Math.min(reachable.length - 1, Math.floor(random() * reachable.length))];
  if (!target) return;
  visit.movement = { ...movement(p.x, p.y, now, visit.room), targetX: target.x / 6.4, targetY: target.y / 5.12,
    durationMs: Math.max(800, Math.round(Math.hypot(target.x - p.x, target.y - p.y) / 28 * 1000)) };
  return visit.movement;
}
