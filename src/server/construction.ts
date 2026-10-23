import type { DatabaseSync } from "node:sqlite";
import { earnCarePoints } from "./furniture.ts";
import { logAction } from "./log.ts";

// Every cooperative build project, like the one shared guinea pig (CLAUDE.md,
// "one shared world") --- never a per-visitor or per-session build. Adding a
// project here is the whole change: db.ts seeds a row per entry, index.ts
// serves/broadcasts one snapshot per entry, OutdoorScene draws one site per
// entry. targetUnits is deliberately large for the newer projects --- see
// docs/decisions/0004-multiple-construction-projects.md for the solo/group
// click-count arithmetic behind "huge, not literally a million."
export interface ProjectConfig {
  id: string;
  name: string;
  targetUnits: number;
}

export const PROJECTS: ProjectConfig[] = [
  { id: "guinea-pig-house", name: "Huahua's house", targetUnits: 10_000 },
  { id: "toolshed", name: "The toolshed", targetUnits: 50_000 },
  { id: "greenhouse", name: "The greenhouse", targetUnits: 200_000 },
  { id: "bridge", name: "The meadow bridge", targetUnits: 500_000 },
  { id: "great-hall", name: "The great hall", targetUnits: 2_000_000 },
];

const PROJECTS_BY_ID = new Map(PROJECTS.map((p) => [p.id, p]));

export function isKnownProject(projectId: string): boolean {
  return PROJECTS_BY_ID.has(projectId);
}

// 100 units = 1 construction point, so the 1x/1.5x/2x/2.5x teamwork
// multiplier is always an exact integer of units, never a float. See
// docs/decisions/0003-construction-concurrency.md.
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
// by `${projectId}:${visitorId}`, not by WebSocket or connection, so two
// tabs/devices for the same visitor on the same project only ever count
// once, and the same visitor building on two different projects at once is
// tracked --- and rate-limited --- independently per project.
const lastContributionMs = new Map<string, number>();
const rateLimitWindows = new Map<string, { windowStartMs: number; count: number }>();

function activityKey(projectId: string, visitorId: string): string {
  return `${projectId}:${visitorId}`;
}

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

function countActiveBuilders(now: number, projectId: string): number {
  const prefix = `${projectId}:`;
  let count = 0;
  for (const [key, ts] of lastContributionMs) {
    if (!key.startsWith(prefix)) continue;
    if (now - ts > PRUNE_AFTER_MS) {
      lastContributionMs.delete(key); // opportunistic GC, unrelated to the 5s activity window
      continue;
    }
    if (now - ts < ACTIVE_WINDOW_MS) count++;
  }
  return count;
}

function unitsPerClick(activeBuilders: number): number {
  return UNITS_BY_BUILDER_COUNT[Math.min(Math.max(activeBuilders, 1), 4)];
}

function getProject(db: DatabaseSync, projectId: string): ProjectRow {
  return db
    .prepare("SELECT * FROM construction_projects WHERE id = ?")
    .get(projectId) as unknown as ProjectRow;
}

function snapshotOf(project: ProjectRow, config: ProjectConfig, activeBuilders: number): ConstructionSnapshot {
  return {
    progressUnits: project.progress_units,
    targetUnits: config.targetUnits,
    status: project.status,
    activeBuilders,
    multiplierUnits: unitsPerClick(activeBuilders),
    hadCooperativeMoment: Boolean(project.had_cooperative_moment),
  };
}

export function getConstructionState(db: DatabaseSync, projectId: string): ConstructionSnapshot {
  const config = PROJECTS_BY_ID.get(projectId);
  if (!config) throw new Error(`unknown construction project "${projectId}"`);
  return snapshotOf(getProject(db, projectId), config, countActiveBuilders(Date.now(), projectId));
}

// Rejects, without writing anything, once a visitor exceeds 5 clicks/second
// on this project --- checked before any database transaction opens, same
// "reject, don't queue" shape the brief asks for.
function isRateLimited(projectId: string, visitorId: string, now: number): boolean {
  const key = activityKey(projectId, visitorId);
  const window = rateLimitWindows.get(key);
  if (!window || now - window.windowStartMs >= RATE_LIMIT_WINDOW_MS) {
    rateLimitWindows.set(key, { windowStartMs: now, count: 1 });
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
// (see docs/decisions/0003-construction-concurrency.md). The idempotency
// key and reason string are both namespaced by projectId so completing one
// project pays its own reward independently of any other project's.
export function grantConstructionRewards(db: DatabaseSync, projectId: string, bonus: number): void {
  const config = PROJECTS_BY_ID.get(projectId);
  if (!config) throw new Error(`unknown construction project "${projectId}"`);
  const eligible = db
    .prepare(
      "SELECT visitor_id FROM construction_contributions WHERE project_id = ? GROUP BY visitor_id HAVING COUNT(*) >= 5",
    )
    .all(projectId) as { visitor_id: string }[];
  for (const { visitor_id } of eligible) {
    const { replay } = earnCarePoints(
      db,
      visitor_id,
      bonus,
      `built ${config.name}`,
      `construction-reward:${projectId}:${visitor_id}`,
    );
    // Only the first (non-replay) grant is a real event worth logging ---
    // this function is deliberately re-entrant (see the comment above), so
    // every later call for an already-paid visitor would otherwise log the
    // same reward over and over.
    if (!replay) {
      logAction(visitor_id, "care-points-awarded", { reason: `built ${config.name}`, bonus, projectId });
    }
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
export function contribute(
  db: DatabaseSync,
  visitorId: string,
  projectId: string,
  requestId: string,
): ContributeResult {
  const config = PROJECTS_BY_ID.get(projectId);
  if (!config) return { ok: false, reason: `unknown construction project "${projectId}"` };

  const now = Date.now();
  if (isRateLimited(projectId, visitorId, now)) {
    return { ok: false, reason: "slow down a little" };
  }

  db.exec("BEGIN IMMEDIATE");
  try {
    const already = db
      .prepare("SELECT * FROM construction_contributions WHERE request_id = ?")
      .get(requestId) as ContributionRow | undefined;
    if (already) {
      const project = getProject(db, projectId);
      db.exec("COMMIT");
      return {
        ok: true,
        replay: true,
        unitsAwarded: already.units_awarded,
        justCompleted: false,
        ...snapshotOf(project, config, countActiveBuilders(now, projectId)),
      };
    }

    const project = getProject(db, projectId);
    if (project.status === "completed") {
      db.exec("ROLLBACK");
      // Defensive, idempotent re-run --- self-heals a reward pass that
      // crashed partway through after an earlier call already completed
      // the project.
      grantConstructionRewards(db, projectId, project.had_cooperative_moment ? 10 : 5);
      return { ok: false, reason: "this project is already finished" };
    }

    // Registering this visitor as active, then counting, is what makes a
    // solo first click count as 1 active builder rather than 0.
    lastContributionMs.set(activityKey(projectId, visitorId), now);
    const activeBuilders = countActiveBuilders(now, projectId);
    const unitsAwarded = unitsPerClick(activeBuilders);

    const newUnits = Math.min(config.targetUnits, project.progress_units + unitsAwarded);
    const justCompleted = project.progress_units < config.targetUnits && newUnits >= config.targetUnits;
    const newHadCoop = project.had_cooperative_moment || (activeBuilders >= 2 ? 1 : 0);
    const newStatus = justCompleted ? "completed" : "in_progress";
    const newCompletedAt = justCompleted ? new Date().toISOString() : project.completed_at;

    const update = db
      .prepare(
        `UPDATE construction_projects
           SET progress_units = ?, had_cooperative_moment = ?, status = ?, completed_at = ?
         WHERE id = ? AND status = 'in_progress' AND progress_units = ?`,
      )
      .run(newUnits, newHadCoop, newStatus, newCompletedAt, projectId, project.progress_units);
    if (update.changes !== 1) {
      // Structurally unreachable under the single-threaded/no-await
      // guarantee above --- kept as the same defense-in-depth
      // retrieveFurniture already practices for its own WHERE clause.
      db.exec("ROLLBACK");
      return { ok: false, reason: "try again" };
    }

    db.prepare(
      "INSERT INTO construction_contributions (project_id, visitor_id, units_awarded, request_id) VALUES (?, ?, ?, ?)",
    ).run(projectId, visitorId, unitsAwarded, requestId);

    db.exec("COMMIT");

    if (justCompleted) grantConstructionRewards(db, projectId, newHadCoop ? 10 : 5);

    return {
      ok: true,
      replay: false,
      unitsAwarded,
      justCompleted,
      progressUnits: newUnits,
      targetUnits: config.targetUnits,
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
