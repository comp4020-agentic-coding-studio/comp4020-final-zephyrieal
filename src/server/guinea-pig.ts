import type { Room } from "../shared/rooms.ts";
import { GUINEA_PIGS } from "../shared/guinea-pigs.ts";
// Huahua wanders the outdoor meadow on her own --- CLAUDE.md: "Never
// implement direct player control of a guinea pig... the guinea pig decides
// what it does." Her position is ephemeral, in-memory state, like
// construction's active-builder tracking (ADR 003: "who's actively
// building right now is intentionally NOT in this table --- that's
// ephemeral, in-memory, reconstructed... never permanent world state").
// CLAUDE.md's Persistence principle ("if an interaction is presented to the
// visitor as permanent, it must survive a restart") doesn't apply here ---
// nobody is promised Huahua will be in a specific spot; a restart simply
// resets her to the meadow's center, same as it always has, and that's not
// a broken trace the way losing a planted flower would be.
//
// Every function here is pure and takes `now`/`random` as parameters rather
// than reading Date.now()/Math.random() internally, so tests can advance
// time and control randomness directly --- no real wall-clock wait, no fake
// timer library, unlike spec/construction.test.ts's real setTimeout waits
// for its own (genuinely real-time) active-builder dropout behavior.

export interface GuineaPigMovement {
  activity?: "resting" | "hiding" | "exploring";
  room?: Room;
  x: number; // 0-100 percent-of-meadow, the same space flowers already use
  y: number;
  targetX: number;
  targetY: number;
  startedAt: number; // Date.now() epoch ms when the current walk/pause began
  durationMs: number; // how long the walk to (targetX, targetY) takes; 0 while paused
}

const MEADOW_MARGIN = 15; // stay off the very edge, clear of the outdoor border
const WALK_SPEED_PERCENT_PER_SEC = 8; // a believable amble, not a dash
const MIN_PAUSE_MS = 3000;
const MAX_PAUSE_MS = 8000;
// A random nearby target can land very close to (or, rarely, exactly on)
// the starting point, which would otherwise produce a near-zero walk
// duration --- and `tick`'s "arrived" check treats `durationMs <= 0` as
// "already arrived," so a walk that's effectively instant would never
// register as a real walk at all. A floor keeps every walk a real,
// observable event.
const MIN_WALK_DURATION_MS = 800;

function clampToMeadow(value: number): number {
  return Math.min(100 - MEADOW_MARGIN, Math.max(MEADOW_MARGIN, value));
}

// Picks a new nearby point to walk to and how long that walk should take,
// given where Huahua currently is. Nearby, not anywhere in the meadow, so
// she ambles rather than teleporting across the whole space in one go.
export function pickNextTarget(
  fromX: number,
  fromY: number,
  random: () => number = Math.random,
): { targetX: number; targetY: number; durationMs: number } {
  const maxStep = (100 - 2 * MEADOW_MARGIN) / 2;
  const targetX = clampToMeadow(fromX + (random() * 2 - 1) * maxStep);
  const targetY = clampToMeadow(fromY + (random() * 2 - 1) * maxStep);
  const distance = Math.hypot(targetX - fromX, targetY - fromY);
  const durationMs = Math.max(MIN_WALK_DURATION_MS, Math.round((distance / WALK_SPEED_PERCENT_PER_SEC) * 1000));
  return { targetX, targetY, durationMs };
}

function createWanderer(x: number, y: number) {
let state: GuineaPigMovement = {
  x, y, targetX: x, targetY: y,
  startedAt: Date.now(),
  durationMs: 0,
};
// Set once a walk arrives, holding her still until this pause elapses ---
// kept separate from `state.durationMs` (which describes the walk itself)
// so `currentPosition` can tell "mid-walk" from "arrived, resting" without
// a third state field on the broadcast payload.
let pauseUntil = state.startedAt + MIN_PAUSE_MS;

// Returns Huahua's actual position at `now`, interpolated along the current
// walk --- never mutates anything, so /api/state and a freshly-connecting
// client can read it as often as they like without disturbing the tick.
function currentPosition(now: number = Date.now()): GuineaPigMovement {
  if (state.durationMs <= 0) return state;
  const elapsed = now - state.startedAt;
  if (elapsed >= state.durationMs) {
    return { ...state, x: state.targetX, y: state.targetY };
  }
  const t = elapsed / state.durationMs;
  return { ...state, x: state.x + (state.targetX - state.x) * t, y: state.y + (state.targetY - state.y) * t };
}

// Advances the simulation by exactly one decision, if one is due: either
// starting a new walk (just arrived, pause elapsed) or doing nothing (still
// walking, or still pausing). Returns the new state only when a real
// decision was made, so the caller --- a setInterval in index.ts --- only
// broadcasts on actual change, the same "diff before broadcast" discipline
// the construction active-builder poller already uses.
function tick(now: number = Date.now(), random: () => number = Math.random): GuineaPigMovement | undefined {
  const arrived = state.durationMs <= 0 || now - state.startedAt >= state.durationMs;
  if (!arrived) return undefined;

  const arrivedX = state.durationMs > 0 ? state.targetX : state.x;
  const arrivedY = state.durationMs > 0 ? state.targetY : state.y;

  if (state.durationMs > 0) {
    // Just this instant arrived at a walk's target: settle there, start
    // resting, and set when the next walk may begin.
    state = { x: arrivedX, y: arrivedY, targetX: arrivedX, targetY: arrivedY, startedAt: now, durationMs: 0 };
    pauseUntil = now + MIN_PAUSE_MS + random() * (MAX_PAUSE_MS - MIN_PAUSE_MS);
    return state;
  }

  if (now < pauseUntil) return undefined; // still resting

  const { targetX, targetY, durationMs } = pickNextTarget(arrivedX, arrivedY, random);
  state = { x: arrivedX, y: arrivedY, targetX, targetY, startedAt: now, durationMs };
  return state;
}

return { currentPosition, tick };
}
const wanderers = new Map(GUINEA_PIGS.map(p => [p.id as string, createWanderer(p.x, p.y)]));
export function currentPosition(now = Date.now(), id = "potato") { return wanderers.get(id)!.currentPosition(now); }
export function tick(now = Date.now(), random = Math.random, id = "potato") { return wanderers.get(id)!.tick(now, random); }
