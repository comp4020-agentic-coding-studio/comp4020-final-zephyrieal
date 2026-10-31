import { db } from "./db.ts";

// A visitor's chosen display name, keyed by the same anonymous signed cookie
// as everything else (src/server/identity.ts) --- still no login or password.
// Optional: a visitor who never picks one keeps the "Visitor xxxx" label.
export const NAME_MAX_LENGTH = 20;

db.exec(`
  CREATE TABLE IF NOT EXISTS visitor_names (
    visitor_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Strips control characters and collapses whitespace; undefined means the
// value can't be used as a name at all.
export function cleanName(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const name = value.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();
  return name && name.length <= NAME_MAX_LENGTH ? name : undefined;
}

export function getName(visitorId: string): string | undefined {
  const row = db.prepare("SELECT name FROM visitor_names WHERE visitor_id = ?").get(visitorId) as { name: string } | undefined;
  return row?.name;
}

export function setName(visitorId: string, name: string): void {
  db.prepare(
    `INSERT INTO visitor_names (visitor_id, name) VALUES (?, ?)
     ON CONFLICT(visitor_id) DO UPDATE SET name = excluded.name, updated_at = datetime('now')`,
  ).run(visitorId, name);
}
