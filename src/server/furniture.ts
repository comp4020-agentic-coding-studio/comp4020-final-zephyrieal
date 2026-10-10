import type { DatabaseSync } from "node:sqlite";

// One shared guinea-pig house, one fixed tile grid. Tile coordinates are
// integers; everything outdoors (flowers) stays in the separate 0-100
// percent-of-box space used by /api/plant --- the two placement systems are
// deliberately not unified. See docs/decisions/0001-concurrent-furniture-placement.md.
export const TILE_SIZE = 32;
export const HOUSE_WIDTH = 10;
export const HOUSE_HEIGHT = 8;

export const FURNITURE_CATALOG = {
  hay_bed: { width: 2, height: 2, cost: 30 },
  tunnel: { width: 3, height: 1, cost: 25 },
  hideout: { width: 2, height: 2, cost: 40 },
} as const;
export type FurnitureKind = keyof typeof FURNITURE_CATALOG;

// How many Care Points one feeding earns. Feeding is the only way to earn
// points right now --- see CLAUDE.md's Care Points exception.
export const FEED_REWARD = 10;

// A border wall ring with a one-tile entrance gap at the bottom-centre.
// Expressed as "x,y" string keys so it composes with the overlap check below.
export const BLOCKED_TILES: Set<string> = (() => {
  const blocked = new Set<string>();
  for (let x = 0; x < HOUSE_WIDTH; x++) {
    blocked.add(`${x},0`);
    blocked.add(`${x},${HOUSE_HEIGHT - 1}`);
  }
  for (let y = 0; y < HOUSE_HEIGHT; y++) {
    blocked.add(`0,${y}`);
    blocked.add(`${HOUSE_WIDTH - 1},${y}`);
  }
  blocked.delete(`${Math.floor(HOUSE_WIDTH / 2)},${HOUSE_HEIGHT - 1}`); // entrance
  return blocked;
})();

export interface FurnitureRow {
  id: number;
  kind: string;
  tile_x: number;
  tile_y: number;
  width: number;
  height: number;
  placed_by: string;
  placed_at: string;
  request_id: string;
}

interface FootprintRow {
  tile_x: number;
  tile_y: number;
  width: number;
  height: number;
}

export type PlacementCheck = { ok: true } | { ok: false; reason: string };

export function isValidPlacement(
  kind: string,
  tileX: number,
  tileY: number,
  existing: FootprintRow[],
): PlacementCheck {
  const def = FURNITURE_CATALOG[kind as FurnitureKind];
  if (!def) {
    return { ok: false, reason: `unknown furniture kind "${kind}"` };
  }
  if (
    !Number.isInteger(tileX) ||
    !Number.isInteger(tileY) ||
    tileX < 0 ||
    tileY < 0 ||
    tileX + def.width > HOUSE_WIDTH ||
    tileY + def.height > HOUSE_HEIGHT
  ) {
    return { ok: false, reason: "that doesn't fit inside the house" };
  }

  const occupied = new Set<string>();
  for (const f of existing) {
    for (let dx = 0; dx < f.width; dx++) {
      for (let dy = 0; dy < f.height; dy++) {
        occupied.add(`${f.tile_x + dx},${f.tile_y + dy}`);
      }
    }
  }
  for (let dx = 0; dx < def.width; dx++) {
    for (let dy = 0; dy < def.height; dy++) {
      const key = `${tileX + dx},${tileY + dy}`;
      if (BLOCKED_TILES.has(key)) {
        return { ok: false, reason: "that tile is a wall or the entrance" };
      }
      if (occupied.has(key)) {
        return { ok: false, reason: "something is already there" };
      }
    }
  }
  return { ok: true };
}

export function getBalance(db: DatabaseSync, visitorId: string): number {
  const row = db
    .prepare(
      "SELECT COALESCE(SUM(delta), 0) AS balance FROM care_point_transactions WHERE visitor_id = ?",
    )
    .get(visitorId) as { balance: number };
  return row.balance;
}

export function getFurniture(db: DatabaseSync): FurnitureRow[] {
  return db
    .prepare("SELECT * FROM furniture ORDER BY id ASC")
    .all() as unknown as FurnitureRow[];
}

export interface EarnResult {
  balance: number;
  replay: boolean;
}

// Earns `amount` Care Points for `visitorId`, attributed to `reason`, guarded
// by `requestId` so a retried request can't double-award. There is no
// `await` anywhere in this function --- see placeFurniture below for why that
// matters for concurrency correctness.
export function earnCarePoints(
  db: DatabaseSync,
  visitorId: string,
  amount: number,
  reason: string,
  requestId: string,
): EarnResult {
  db.exec("BEGIN IMMEDIATE");
  try {
    const already = db
      .prepare("SELECT id FROM care_point_transactions WHERE request_id = ?")
      .get(requestId);
    if (!already) {
      db.prepare(
        "INSERT INTO care_point_transactions (visitor_id, delta, reason, request_id) VALUES (?, ?, ?, ?)",
      ).run(visitorId, amount, reason, requestId);
    }
    db.exec("COMMIT");
    return { balance: getBalance(db, visitorId), replay: Boolean(already) };
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export type PlaceResult =
  | { ok: true; furniture: FurnitureRow; balance: number; replay: boolean }
  | { ok: false; reason: string };

// The whole purchase-and-placement transaction, in one synchronous function:
// check request_id for a replay, check the catalog, check the balance, check
// the tile placement against current furniture, then commit both the
// furniture row and the matching negative ledger row together. No `await`
// appears anywhere between the first read and the final COMMIT, and
// node:sqlite's DatabaseSync API is fully synchronous, so --- because Node is
// single-threaded --- no other request's handler can run a single line of JS
// while this function is mid-transaction. That is what actually prevents two
// concurrent placements from both succeeding on overlapping tiles: ordering
// is resolved by which request's handler the event loop invokes first, not
// by the BEGIN/COMMIT/ROLLBACK wrapper (that wrapper exists only for
// all-or-nothing atomicity against a thrown exception mid-transaction). See
// docs/decisions/0001-concurrent-furniture-placement.md.
export function placeFurniture(
  db: DatabaseSync,
  visitorId: string,
  kind: string,
  tileX: number,
  tileY: number,
  requestId: string,
): PlaceResult {
  db.exec("BEGIN IMMEDIATE");
  try {
    const already = db
      .prepare("SELECT * FROM furniture WHERE request_id = ?")
      .get(requestId) as FurnitureRow | undefined;
    if (already) {
      db.exec("COMMIT");
      return { ok: true, furniture: already, balance: getBalance(db, visitorId), replay: true };
    }

    const def = FURNITURE_CATALOG[kind as FurnitureKind];
    if (!def) {
      db.exec("ROLLBACK");
      return { ok: false, reason: `unknown furniture kind "${kind}"` };
    }

    const balance = getBalance(db, visitorId);
    if (balance < def.cost) {
      db.exec("ROLLBACK");
      return { ok: false, reason: `not enough care points (need ${def.cost}, have ${balance})` };
    }

    const existing = db
      .prepare("SELECT tile_x, tile_y, width, height FROM furniture")
      .all() as unknown as FootprintRow[];
    const placement = isValidPlacement(kind, tileX, tileY, existing);
    if (!placement.ok) {
      db.exec("ROLLBACK");
      return placement;
    }

    const result = db
      .prepare(
        "INSERT INTO furniture (kind, tile_x, tile_y, width, height, placed_by, request_id) VALUES (?,?,?,?,?,?,?)",
      )
      .run(kind, tileX, tileY, def.width, def.height, visitorId, requestId);

    db.prepare(
      "INSERT INTO care_point_transactions (visitor_id, delta, reason, request_id) VALUES (?, ?, ?, ?)",
    ).run(visitorId, -def.cost, `placed ${kind}`, requestId);

    db.exec("COMMIT");

    const furniture = db
      .prepare("SELECT * FROM furniture WHERE id = ?")
      .get(result.lastInsertRowid) as unknown as FurnitureRow;
    return { ok: true, furniture, balance: balance - def.cost, replay: false };
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}
