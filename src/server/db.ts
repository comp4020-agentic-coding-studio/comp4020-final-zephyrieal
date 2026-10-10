import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

// One file on the Fly volume (mounted at /data) is the whole persistence
// story for now: no separate database server, one small machine. Locally it
// falls back to a gitignored ./data directory.
const dbPath = process.env.DB_PATH ?? "./data/sanctuary.db";
mkdirSync(dirname(dbPath), { recursive: true });

export const db = new DatabaseSync(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS guinea_pigs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    personality TEXT NOT NULL,
    feed_count INTEGER NOT NULL DEFAULT 0,
    last_fed_at TEXT
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS visits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    visitor_id TEXT NOT NULL,
    action TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Flowers are a trace left on the *sanctuary*, not on the guinea pig: unlike
// feeding, this changes the shared environment itself, and every flower
// planted stays --- nobody owns the ones they planted, and nothing here lets
// a visitor remove someone else's (see CLAUDE.md, "nobody owns anything").
db.exec(`
  CREATE TABLE IF NOT EXISTS flowers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    x REAL NOT NULL,
    y REAL NOT NULL,
    planted_by TEXT NOT NULL,
    planted_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Care Points are an append-only ledger (same "trace" philosophy as `visits`
// and `flowers`), not a mutable counter column: a visitor's balance is
// SUM(delta), which makes the request_id idempotency guard sufficient on its
// own --- there's no separate "apply the delta" step that could run twice.
// See docs/decisions/0001-concurrent-furniture-placement.md.
db.exec(`
  CREATE TABLE IF NOT EXISTS care_point_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    visitor_id TEXT NOT NULL,
    delta INTEGER NOT NULL,
    reason TEXT NOT NULL,
    request_id TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_care_point_transactions_visitor
  ON care_point_transactions (visitor_id);
`);

// Furniture lives in the one shared guinea-pig house (see
// src/server/furniture.ts for the tile grid and catalog). placed_by is
// provenance only, like flowers.planted_by --- nobody gets exclusive rights
// over a piece once it exists (CLAUDE.md, "nobody owns anything"). request_id
// is the idempotency guard that makes a retried purchase a no-op instead of a
// double charge.
db.exec(`
  CREATE TABLE IF NOT EXISTS furniture (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,
    tile_x INTEGER NOT NULL,
    tile_y INTEGER NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    placed_by TEXT NOT NULL,
    placed_at TEXT NOT NULL DEFAULT (datetime('now')),
    request_id TEXT NOT NULL UNIQUE
  );
`);
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_furniture_tile ON furniture (tile_x, tile_y);
`);

// Potato is the sanctuary's one persistent guinea pig --- a single shared
// inhabitant, not spawned per visitor or per session (see README, "Nobody
// owns the guinea pigs"). Seeded once; later visits just update this row.
const existing = db.prepare("SELECT id FROM guinea_pigs WHERE id = ?").get("potato");
if (!existing) {
  db.prepare(
    `INSERT INTO guinea_pigs (id, name, personality, feed_count, last_fed_at)
     VALUES ('potato', 'Potato', 'curious', 0, NULL)`,
  ).run();
}
