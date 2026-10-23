import type { DatabaseSync } from "node:sqlite";
import type { Player } from "../shared/presence.ts";
import { inReach } from "../shared/interactions.ts";
import { GIANT_CARROT as C, type CarrotState } from "../shared/carrot.ts";

type Row = { round: number; ready_at: number; harvests: number };
// Readiness is temporary; each completed harvest and its pantry reward commit together.
export function createCarrot(db: DatabaseSync, playerFor: (visitor: string, playerId: string) => Player | undefined) {
  db.exec(`CREATE TABLE IF NOT EXISTS giant_carrot (
    id INTEGER PRIMARY KEY CHECK(id = 1), round INTEGER NOT NULL, ready_at INTEGER NOT NULL, harvests INTEGER NOT NULL);
    INSERT OR IGNORE INTO giant_carrot VALUES (1, 1, 0, 0);`);
  const participants = new Map<string, { playerId: string; expires: number }>();
  let progress = 0, previousTime: number | undefined;
  function prune(now: number) {
    for (const [visitor, participant] of participants) {
      if (participant.expires <= now || !inReach(playerFor(visitor, participant.playerId), C.x, C.y, C.reach)) participants.delete(visitor);
    }
    if (participants.size < 2) { progress = 0; previousTime = undefined; }
  }
  function state(now = Date.now()): CarrotState {
    prune(now);
    const row = db.prepare("SELECT round, ready_at, harvests FROM giant_carrot WHERE id = 1").get() as unknown as Row;
    return { round: row.round, readyAt: row.ready_at, harvests: row.harvests,
      pullers: [...participants.values()].map(p => p.playerId), progressMs: progress, serverNow: now };
  }
  return {
    state,
    act(visitor: string, playerId: string, round: number, action: "join" | "leave", now = Date.now()) {
      prune(now);
      const before = state(now);
      if (!inReach(playerFor(visitor, playerId), C.x, C.y, C.reach)) return { ok: false as const, reason: "Walk closer to the giant carrot.", carrot: before };
      if (round !== before.round) return { ok: false as const, reason: "That carrot was already pulled. Wait for the next one.", carrot: before };
      if (action === "leave") {
        participants.delete(visitor); prune(now);
      } else {
        if (now < before.readyAt) return { ok: false as const, reason: "The next carrot is still growing.", carrot: before };
        participants.set(visitor, { playerId, expires: now + C.leaseMs });
        // Starting the clock here prevents credit for time before the second visitor joined.
        if (participants.size >= 2 && previousTime === undefined) previousTime = now;
      }
      return { ok: true as const, carrot: state(now) };
    },
    tick(now = Date.now()) {
      prune(now);
      let harvested = false;
      if (participants.size >= 2) {
        progress += previousTime === undefined ? 0 : Math.max(0, Math.min(now - previousTime, 250));
        previousTime = now;
        if (progress >= C.pullMs) {
          const before = state(now);
          db.exec("BEGIN IMMEDIATE");
          try {
            const result = db.prepare("UPDATE giant_carrot SET round = round + 1, ready_at = ?, harvests = harvests + 1 WHERE id = 1 AND round = ? AND ready_at <= ?")
              .run(now + C.regrowMs, before.round, now);
            if (result.changes === 1) {
              db.prepare("INSERT INTO farm_food(crop, quantity) VALUES ('carrot', 3) ON CONFLICT(crop) DO UPDATE SET quantity = quantity + 3").run();
              harvested = true;
            }
            db.exec("COMMIT");
          } catch (error) { db.exec("ROLLBACK"); throw error; }
          participants.clear(); progress = 0; previousTime = undefined;
        }
      }
      return { carrot: state(now), harvested };
    },
  };
}
