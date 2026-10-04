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
