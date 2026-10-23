import { DatabaseSync } from "node:sqlite";
import { afterEach, expect, it, inject } from "vitest";
import { randomUUID } from "node:crypto";
import { changeFarm, farmState } from "../src/server/farm.ts";
import { CROPS } from "../src/shared/farm.ts";
import { approach } from "./nearby-client.ts";
import { cookieFor } from "./identity.ts";
const databases: DatabaseSync[] = [];
afterEach(() => { for (const db of databases) db.close(); databases.length = 0; });
function fixture() {
  const db = new DatabaseSync(":memory:"); databases.push(db);
  db.exec(`CREATE TABLE farm_plots(id INTEGER PRIMARY KEY, crop TEXT, planted_at INTEGER, ready_at INTEGER, version INTEGER DEFAULT 1);
    CREATE TABLE farm_food(crop TEXT PRIMARY KEY, quantity INTEGER DEFAULT 0);
    CREATE TABLE farm_requests(visitor_id TEXT, request_id TEXT, fingerprint TEXT, PRIMARY KEY(visitor_id,request_id));
    INSERT INTO farm_plots(id) VALUES (0);
    INSERT INTO farm_food(crop) VALUES ('hay'),('lettuce'),('pepper'),('cucumber');`);
  return db;
}
it("grows on persisted timestamps and lets another visitor harvest the communal crop", () => {
  const db = fixture();
  const planted = changeFarm(db, "alice", "plant", 0, "lettuce", 1, "plant", 1000);
  expect(planted.ok).toBe(true);
  expect(farmState(db).plots[0].readyAt).toBe(1000 + CROPS.lettuce.growMs);
  expect(changeFarm(db, "bob", "harvest", 0, undefined, 2, "early", 2000).ok).toBe(false);
  expect(changeFarm(db, "bob", "harvest", 0, undefined, 2, "harvest", 1000 + CROPS.lettuce.growMs).ok).toBe(true);
  expect(farmState(db).food.lettuce).toBe(3);
  expect(farmState(db).plots[0].crop).toBeNull();
});
it("rejects stale competing plants and harvests, and replays without duplicating food", () => {
  const db = fixture();
  expect(changeFarm(db, "a", "plant", 0, "hay", 1, "a", 0).ok).toBe(true);
  expect(changeFarm(db, "b", "plant", 0, "pepper", 1, "b", 0).ok).toBe(false);
  expect(changeFarm(db, "b", "harvest", 0, undefined, 2, "h", 30000).ok).toBe(true);
  expect(changeFarm(db, "a", "harvest", 0, undefined, 2, "other", 30000).ok).toBe(false);
  expect(changeFarm(db, "b", "harvest", 0, undefined, 2, "h", 30000)).toMatchObject({ ok: true, replay: true });
  expect(farmState(db).food.hay).toBe(3);
  expect(changeFarm(db, "b", "plant", 0, "hay", 3, "h", 30000).ok).toBe(false);
});
it("requires nearby authenticated presence, rejecting another visitor's avatar and indoor access", async () => {
  const base = inject("baseUrl"), owner = randomUUID(), stranger = randomUUID();
  const a = await approach(base, owner, "farm");
  const before = await fetch(new URL("/api/state", base)).then(r => r.json());
  const body = JSON.stringify({ plotId: 0, crop: "hay", version: before.farm.plots[0].version, requestId: randomUUID() });
  for (const headers of [
    { cookie: cookieFor(owner) },
    { cookie: cookieFor(stranger), "X-Player-Id": a.id },
  ] as Record<string, string>[]) {
    const response = await fetch(new URL("/api/farm/plant", base), { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body });
    expect(response.status).toBe(403);
  }
  a.ws.send(JSON.stringify({ type: "visitor-input", room: "indoor", dx: 0, dy: 0 }));
  await new Promise(resolve => setTimeout(resolve, 100));
  const indoor = await fetch(new URL("/api/farm/plant", base), { method: "POST", headers: { "Content-Type": "application/json", cookie: cookieFor(owner), "X-Player-Id": a.id }, body });
  expect(indoor.status).toBe(403);
  const after = await fetch(new URL("/api/state", base)).then(r => r.json());
  expect(after.farm.plots).toEqual(before.farm.plots);
});
it("rejects remote feeding and building without changing persistent state", async () => {
  const base = inject("baseUrl"), visitor = randomUUID();
  const before = await fetch(new URL("/api/state", base)).then(r => r.json());
  for (const [path, payload] of [["/api/feed", {}], ["/api/construction/contribute", { projectId: "toolshed" }]] as const) {
    const response = await fetch(new URL(path, base), { method: "POST", headers: { "Content-Type": "application/json", cookie: cookieFor(visitor) }, body: JSON.stringify({ ...payload, requestId: randomUUID() }) });
    expect(response.status).toBe(403);
  }
  const after = await fetch(new URL("/api/state", base)).then(r => r.json());
  expect(after.guineaPig.feed_count).toBe(before.guineaPig.feed_count);
  expect(after.construction.toolshed.progressUnits).toBe(before.construction.toolshed.progressUnits);
});
