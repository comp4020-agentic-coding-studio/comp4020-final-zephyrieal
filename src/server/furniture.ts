import { CROPS } from "../shared/farm.ts";
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
export const FEED_REWARD = CROPS.hay.carePoints;

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

// A piece that's `stored` has no position --- `-1` is the sentinel for "not
// currently placed" rather than `NULL`, so `tile_x`/`tile_y` can stay NOT
// NULL (see db.ts). `status` is what actually gates whether the position
// means anything; nothing should read tile_x/tile_y without checking status
// first.
export type Rotation = 0 | 90 | 180 | 270;
export type FurnitureStatus = "placed" | "stored";

export interface FurnitureRow {
  room_id: string;
  id: number;
  kind: string;
  tile_x: number;
  tile_y: number;
  width: number;
  height: number;
  rotation: Rotation;
  status: FurnitureStatus;
  version: number;
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

// The catalog's width/height is for rotation 0; rotating 90 or 270 swaps
// them. Collision math always goes through this rather than the catalog
// directly, so a rotated piece occupies the tiles it actually covers.
export function footprintFor(
  kind: FurnitureKind,
  rotation: Rotation,
): { width: number; height: number } {
  const def = FURNITURE_CATALOG[kind];
  return rotation === 90 || rotation === 270
    ? { width: def.height, height: def.width }
    : { width: def.width, height: def.height };
}

// Rotating furniture swaps in a different drawn sprite rather than spinning
// one image --- a doghouse's back wall doesn't look like its front wall
// rotated. Each kind has 3 drawn views (front/back/left); "right" reuses the
// left sprite mirrored rather than a fourth drawn asset, since a side view
// and its mirror image are the same art. 0° faces the viewer (front) and
// rotation advances clockwise from there, matching the order Rotate already
// cycles through (ROTATIONS in IndoorScene.ts).
export function viewFor(kind: FurnitureKind, rotation: Rotation): { key: string; flipX: boolean } {
  switch (rotation) {
    case 0:
      return { key: `furniture-${kind}-front`, flipX: false };
    case 180:
      return { key: `furniture-${kind}-back`, flipX: false };
    case 270:
      return { key: `furniture-${kind}-left`, flipX: false };
    case 90:
      return { key: `furniture-${kind}-left`, flipX: true };
  }
}

export type PlacementCheck = { ok: true } | { ok: false; reason: string };

export function isValidPlacement(
  kind: string,
  tileX: number,
  tileY: number,
  existing: FootprintRow[],
  rotation: Rotation = 0,
): PlacementCheck {
  const def = FURNITURE_CATALOG[kind as FurnitureKind];
  if (!def) {
    return { ok: false, reason: `unknown furniture kind "${kind}"` };
  }
  const { width, height } = footprintFor(kind as FurnitureKind, rotation);
  if (
    !Number.isInteger(tileX) ||
    !Number.isInteger(tileY) ||
    tileX < 0 ||
    tileY < 0 ||
    tileX + width > HOUSE_WIDTH ||
    tileY + height > HOUSE_HEIGHT
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
  for (let dx = 0; dx < width; dx++) {
    for (let dy = 0; dy < height; dy++) {
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

export function getFurniture(db: DatabaseSync, room = "indoor"): FurnitureRow[] {
  return db
    .prepare("SELECT * FROM furniture WHERE status = 'placed' AND room_id = ? ORDER BY id ASC")
    .all(room) as unknown as FurnitureRow[];
}

export function getStoredFurniture(db: DatabaseSync, room = "indoor"): FurnitureRow[] {
  return db
    .prepare("SELECT * FROM furniture WHERE status = 'stored' AND room_id = ? ORDER BY id ASC")
    .all(room) as unknown as FurnitureRow[];
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
  room = "indoor",
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
      .prepare("SELECT tile_x, tile_y, width, height FROM furniture WHERE status = 'placed' AND room_id = ?")
      .all(room) as unknown as FootprintRow[];
    const placement = isValidPlacement(kind, tileX, tileY, existing);
    if (!placement.ok) {
      db.exec("ROLLBACK");
      return placement;
    }

    const result = db
      .prepare(
        "INSERT INTO furniture (kind, tile_x, tile_y, width, height, placed_by, request_id, room_id) VALUES (?,?,?,?,?,?,?,?)",
      )
      .run(kind, tileX, tileY, def.width, def.height, visitorId, requestId, room);

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

export type EditResult =
  | { ok: true; furniture: FurnitureRow; replay: boolean }
  | { ok: false; reason: string; current?: FurnitureRow };

// `furniture.request_id UNIQUE` only guards the original INSERT; move/store/
// retrieve all touch the *same* row repeatedly, so each needs its own replay
// record (see docs/decisions/0002-furniture-editing-concurrency.md). Storing
// the exact response at commit time and returning it verbatim on replay ---
// rather than falling through to a fresh version check --- matters because by
// the time a retried request arrives the row's version has already moved on
// from the one the original request carried.
function checkReplay(db: DatabaseSync, requestId: string): EditResult | undefined {
  const row = db
    .prepare("SELECT result_json FROM furniture_mutations WHERE request_id = ?")
    .get(requestId) as { result_json: string } | undefined;
  return row ? (JSON.parse(row.result_json) as EditResult) : undefined;
}

function recordMutation(
  db: DatabaseSync,
  requestId: string,
  furnitureId: number,
  action: string,
  result: EditResult,
): void {
  db.prepare(
    "INSERT INTO furniture_mutations (request_id, furniture_id, action, result_json) VALUES (?, ?, ?, ?)",
  ).run(requestId, furnitureId, action, JSON.stringify(result));
}

// Moving and rotating are committed together in one Save, so they're one
// transaction here --- the two are broadcast as separate WS events by the
// route (furniture-moved / furniture-rotated), but the underlying mutation
// and its concurrency guard are the same operation. No `await` anywhere in
// this function, same discipline as placeFurniture and for the same reason:
// see docs/decisions/0001-concurrent-furniture-placement.md.
export function editFurniture(
  db: DatabaseSync,
  id: number,
  tileX: number,
  tileY: number,
  rotation: Rotation,
  expectedVersion: number,
  requestId: string,
): EditResult {
  db.exec("BEGIN IMMEDIATE");
  try {
    const replay = checkReplay(db, requestId);
    if (replay) {
      db.exec("COMMIT");
      return replay;
    }

    const current = db.prepare("SELECT * FROM furniture WHERE id = ?").get(id) as
      | FurnitureRow
      | undefined;
    if (!current) {
      db.exec("ROLLBACK");
      return { ok: false, reason: "that piece of furniture doesn't exist anymore" };
    }
    if (current.status !== "placed") {
      db.exec("ROLLBACK");
      return { ok: false, reason: "that piece is in storage, not on the floor", current };
    }
    if (current.version !== expectedVersion) {
      db.exec("ROLLBACK");
      return { ok: false, reason: "this piece changed since you last saw it", current };
    }

    const existing = db
      .prepare("SELECT tile_x, tile_y, width, height FROM furniture WHERE status = 'placed' AND id != ? AND room_id = ?")
      .all(id, current.room_id) as unknown as FootprintRow[];
    const placement = isValidPlacement(current.kind, tileX, tileY, existing, rotation);
    if (!placement.ok) {
      db.exec("ROLLBACK");
      return { ok: false, reason: placement.reason, current };
    }

    const { width, height } = footprintFor(current.kind as FurnitureKind, rotation);
    const update = db
      .prepare(
        "UPDATE furniture SET tile_x=?, tile_y=?, rotation=?, width=?, height=?, version=version+1 WHERE id=? AND version=? AND status='placed'",
      )
      .run(tileX, tileY, rotation, width, height, id, expectedVersion);
    if (update.changes !== 1) {
      db.exec("ROLLBACK");
      return { ok: false, reason: "this piece changed since you last saw it", current };
    }

    const furniture = db.prepare("SELECT * FROM furniture WHERE id = ?").get(id) as unknown as FurnitureRow;
    const result: EditResult = { ok: true, furniture, replay: false };
    recordMutation(db, requestId, id, "edit", result);
    db.exec("COMMIT");
    return result;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

// Stores a placed piece into the shared pool: it keeps existing (the row is
// never deleted), it just stops occupying a tile. rotation/width/height are
// left as they were, so a later retrieve looks the same by default.
export function storeFurniture(
  db: DatabaseSync,
  id: number,
  expectedVersion: number,
  requestId: string,
): EditResult {
  db.exec("BEGIN IMMEDIATE");
  try {
    const replay = checkReplay(db, requestId);
    if (replay) {
      db.exec("COMMIT");
      return replay;
    }

    const current = db.prepare("SELECT * FROM furniture WHERE id = ?").get(id) as
      | FurnitureRow
      | undefined;
    if (!current) {
      db.exec("ROLLBACK");
      return { ok: false, reason: "that piece of furniture doesn't exist anymore" };
    }
    if (current.status !== "placed") {
      db.exec("ROLLBACK");
      return { ok: false, reason: "that's already in storage", current };
    }
    if (current.version !== expectedVersion) {
      db.exec("ROLLBACK");
      return { ok: false, reason: "this piece changed since you last saw it", current };
    }

    const update = db
      .prepare(
        "UPDATE furniture SET status='stored', tile_x=-1, tile_y=-1, version=version+1 WHERE id=? AND version=? AND status='placed'",
      )
      .run(id, expectedVersion);
    if (update.changes !== 1) {
      db.exec("ROLLBACK");
      return { ok: false, reason: "this piece changed since you last saw it", current };
    }

    const furniture = db.prepare("SELECT * FROM furniture WHERE id = ?").get(id) as unknown as FurnitureRow;
    const result: EditResult = { ok: true, furniture, replay: false };
    recordMutation(db, requestId, id, "store", result);
    db.exec("COMMIT");
    return result;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

// Retrieving is free, for anyone --- the `status != 'stored'` check below is
// what actually prevents two visitors retrieving the same item at once (same
// single-threaded, no-`await` reasoning as placeFurniture/editFurniture,
// restated for the stored->placed transition), and the `AND status='stored'`
// in the UPDATE's own WHERE clause is defense in depth on top of that.
export function retrieveFurniture(
  db: DatabaseSync,
  id: number,
  tileX: number,
  tileY: number,
  rotation: Rotation,
  expectedVersion: number,
  requestId: string,
): EditResult {
  db.exec("BEGIN IMMEDIATE");
  try {
    const replay = checkReplay(db, requestId);
    if (replay) {
      db.exec("COMMIT");
      return replay;
    }

    const current = db.prepare("SELECT * FROM furniture WHERE id = ?").get(id) as
      | FurnitureRow
      | undefined;
    if (!current) {
      db.exec("ROLLBACK");
      return { ok: false, reason: "that piece of furniture doesn't exist anymore" };
    }
    if (current.status !== "stored") {
      db.exec("ROLLBACK");
      return { ok: false, reason: "someone already took that", current };
    }
    if (current.version !== expectedVersion) {
      db.exec("ROLLBACK");
      return { ok: false, reason: "this piece changed since you last saw it", current };
    }

    const existing = db
      .prepare("SELECT tile_x, tile_y, width, height FROM furniture WHERE status = 'placed' AND room_id = ?")
      .all(current.room_id) as unknown as FootprintRow[];
    const placement = isValidPlacement(current.kind, tileX, tileY, existing, rotation);
    if (!placement.ok) {
      db.exec("ROLLBACK");
      return { ok: false, reason: placement.reason, current };
    }

    const { width, height } = footprintFor(current.kind as FurnitureKind, rotation);
    const update = db
      .prepare(
        "UPDATE furniture SET status='placed', tile_x=?, tile_y=?, rotation=?, width=?, height=?, version=version+1 WHERE id=? AND version=? AND status='stored'",
      )
      .run(tileX, tileY, rotation, width, height, id, expectedVersion);
    if (update.changes !== 1) {
      db.exec("ROLLBACK");
      return { ok: false, reason: "someone already took that", current };
    }

    const furniture = db.prepare("SELECT * FROM furniture WHERE id = ?").get(id) as unknown as FurnitureRow;
    const result: EditResult = { ok: true, furniture, replay: false };
    recordMutation(db, requestId, id, "retrieve", result);
    db.exec("COMMIT");
    return result;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}
