import type { DatabaseSync } from "node:sqlite";
import { earnCarePoints } from "./furniture.ts";

// One shared project, like the one shared guinea pig (CLAUDE.md, "one
// shared world") --- never a per-visitor or per-session build.
const PROJECT_ID = "guinea-pig-house";

// 100 units = 1 construction point, so the 1x/1.5x/2x/2.5x teamwork
// multiplier is always an exact integer of units, never a float. See
// docs/decisions/0003-construction-concurrency.md.
export const CONSTRUCTION_TARGET_UNITS = 10000;
export const ACTIVE_WINDOW_MS = 5000;
const UNITS_BY_BUILDER_COUNT = [0, 100, 150, 200, 250]; // index 0 unused; 4+ builders -> index 4
const MAX_CLICKS_PER_SECOND = 5;
const RATE_LIMIT_WINDOW_MS = 1000;
// How long a quiet visitor stays in the active-builder map before being
// pruned outright (well beyond ACTIVE_WINDOW_MS --- this is just garbage
// collection for a long-lived process, not the activity window itself).
const PRUNE_AFTER_MS = 5 * 60 * 1000;

// Ephemeral, in-memory, never persisted (CLAUDE.md: "never fake shared-world
// persistence," but the inverse matters too here --- presence is explicitly
// NOT shared-world state, so it belongs in memory, not the database). Keyed
// by visitorId, not by WebSocket or connection, so two tabs/devices for the
// same visitor only ever count once.
const lastContributionMs = new Map<string, number>();
const rateLimitWindows = new Map<string, { windowStartMs: number; count: number }>();

interface ProjectRow {
  id: string;
  progress_units: number;
  status: "in_progress" | "completed";
  had_cooperative_moment: number;
  completed_at: string | null;
}

interface ContributionRow {
  id: number;
  visitor_id: string;
  units_awarded: number;
  request_id: string;
  created_at: string;
}

export interface ConstructionSnapshot {
  progressUnits: number;
  targetUnits: number;
  status: "in_progress" | "completed";
  activeBuilders: number;
  multiplierUnits: number;
  hadCooperativeMoment: boolean;
}

export type ContributeResult =
  | (ConstructionSnapshot & { ok: true; replay: boolean; unitsAwarded: number; justCompleted: boolean })
  | { ok: false; reason: string };

function countActiveBuilders(now: number): number {
  let count = 0;
  for (const [visitorId, ts] of lastContributionMs) {
    if (now - ts > PRUNE_AFTER_MS) {
      lastContributionMs.delete(visitorId); // opportunistic GC, unrelated to the 5s activity window
      continue;
    }
    if (now - ts < ACTIVE_WINDOW_MS) count++;
  }
  return count;
}

function unitsPerClick(activeBuilders: number): number {
  return UNITS_BY_BUILDER_COUNT[Math.min(Math.max(activeBuilders, 1), 4)];
}

function getProject(db: DatabaseSync): ProjectRow {
  return db
    .prepare("SELECT * FROM construction_projects WHERE id = ?")
    .get(PROJECT_ID) as unknown as ProjectRow;
}

function snapshotOf(project: ProjectRow, activeBuilders: number): ConstructionSnapshot {
  return {
    progressUnits: project.progress_units,
    targetUnits: CONSTRUCTION_TARGET_UNITS,
    status: project.status,
    activeBuilders,
    multiplierUnits: unitsPerClick(activeBuilders),
    hadCooperativeMoment: Boolean(project.had_cooperative_moment),
  };
}

export function getConstructionState(db: DatabaseSync): ConstructionSnapshot {
  return snapshotOf(getProject(db), countActiveBuilders(Date.now()));
}

// Rejects, without writing anything, once a visitor exceeds 5 clicks/second
// --- checked before any database transaction opens, same "reject, don't
// queue" shape the brief asks for.
function isRateLimited(visitorId: string, now: number): boolean {
  const window = rateLimitWindows.get(visitorId);
  if (!window || now - window.windowStartMs >= RATE_LIMIT_WINDOW_MS) {
    rateLimitWindows.set(visitorId, { windowStartMs: now, count: 1 });
    return false;
  }
  window.count += 1;
  return window.count > MAX_CLICKS_PER_SECOND;
}

// Safe to call any number of times, from any number of places --- it only
// ever pays a visitor once per project, via earnCarePoints's own
// request_id uniqueness, so a repeat call is a no-op for anyone already
// paid. This is what lets the reward pass be re-entrant rather than a
// strict one-shot tied only to the single call that completed the project
// (see docs/decisions/0003-construction-concurrency.md).
export function grantConstructionRewards(db: DatabaseSync, bonus: number): void {
  const eligible = db
    .prepare(
      "SELECT visitor_id FROM construction_contributions GROUP BY visitor_id HAVING COUNT(*) >= 5",
    )
    .all() as { visitor_id: string }[];
  for (const { visitor_id } of eligible) {
    earnCarePoints(
      db,
      visitor_id,
      bonus,
      "built the guinea pig house",
      `construction-reward:${visitor_id}`,
    );
  }
}

// The whole contribution, in one synchronous transaction: check for a
// replay, check the project isn't already finished, register this visitor
// as active *then* count how many are active (so a solo first click counts
// itself), clamp-and-commit the award, record the click. No `await`
// anywhere in this function --- same discipline as every mutator in
// furniture.ts, and for the same reason: Node's single-threaded event loop,
// not the transaction wrapper, is what actually serialises concurrent
// clicks. See docs/decisions/0003-construction-concurrency.md.
export function contribute(db: DatabaseSync, visitorId: string, requestId: string): ContributeResult {
  const now = Date.now();
  if (isRateLimited(visitorId, now)) {
    return { ok: false, reason: "slow down a little" };
  }

  db.exec("BEGIN IMMEDIATE");
  try {
    const already = db
      .prepare("SELECT * FROM construction_contributions WHERE request_id = ?")
      .get(requestId) as ContributionRow | undefined;
    if (already) {
      const project = getProject(db);
      db.exec("COMMIT");
      return {
        ok: true,
        replay: true,
        unitsAwarded: already.units_awarded,
        justCompleted: false,
        ...snapshotOf(project, countActiveBuilders(now)),
      };
    }

    const project = getProject(db);
    if (project.status === "completed") {
      db.exec("ROLLBACK");
      // Defensive, idempotent re-run --- self-heals a reward pass that
      // crashed partway through after an earlier call already completed
      // the project.
      grantConstructionRewards(db, project.had_cooperative_moment ? 10 : 5);
      return { ok: false, reason: "the house is already finished" };
    }

    // Registering this visitor as active, then counting, is what makes a
    // solo first click count as 1 active builder rather than 0.
    lastContributionMs.set(visitorId, now);
    const activeBuilders = countActiveBuilders(now);
    const unitsAwarded = unitsPerClick(activeBuilders);

    const newUnits = Math.min(CONSTRUCTION_TARGET_UNITS, project.progress_units + unitsAwarded);
    const justCompleted = project.progress_units < CONSTRUCTION_TARGET_UNITS && newUnits >= CONSTRUCTION_TARGET_UNITS;
    const newHadCoop = project.had_cooperative_moment || (activeBuilders >= 2 ? 1 : 0);
    const newStatus = justCompleted ? "completed" : "in_progress";
    const newCompletedAt = justCompleted ? new Date().toISOString() : project.completed_at;

    const update = db
      .prepare(
        `UPDATE construction_projects
           SET progress_units = ?, had_cooperative_moment = ?, status = ?, completed_at = ?
         WHERE id = ? AND status = 'in_progress' AND progress_units = ?`,
      )
      .run(newUnits, newHadCoop, newStatus, newCompletedAt, PROJECT_ID, project.progress_units);
    if (update.changes !== 1) {
      // Structurally unreachable under the single-threaded/no-await
      // guarantee above --- kept as the same defense-in-depth
      // retrieveFurniture already practices for its own WHERE clause.
      db.exec("ROLLBACK");
      return { ok: false, reason: "try again" };
    }

    db.prepare(
      "INSERT INTO construction_contributions (visitor_id, units_awarded, request_id) VALUES (?, ?, ?)",
    ).run(visitorId, unitsAwarded, requestId);

    db.exec("COMMIT");

    if (justCompleted) grantConstructionRewards(db, newHadCoop ? 10 : 5);

    return {
      ok: true,
      replay: false,
      unitsAwarded,
      justCompleted,
      progressUnits: newUnits,
      targetUnits: CONSTRUCTION_TARGET_UNITS,
      status: newStatus,
      activeBuilders,
      multiplierUnits: unitsAwarded,
      hadCooperativeMoment: Boolean(newHadCoop),
    };
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}
