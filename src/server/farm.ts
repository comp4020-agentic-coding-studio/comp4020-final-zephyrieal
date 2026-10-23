import type { DatabaseSync } from "node:sqlite";
import { CROPS, CROP_KEYS, type Crop, type FarmState, type FarmPlot } from "../shared/farm.ts";
export function farmState(db: DatabaseSync, now = Date.now()): FarmState {
  const plots = db.prepare("SELECT id, crop, planted_at AS plantedAt, ready_at AS readyAt, version FROM farm_plots WHERE id = 0 ORDER BY id").all() as unknown as FarmPlot[];
  const food = Object.fromEntries(CROP_KEYS.map(crop => [crop, 0])) as Record<Crop, number>;
  for (const row of db.prepare("SELECT crop, quantity FROM farm_food").all() as { crop: Crop; quantity: number }[]) food[row.crop] = row.quantity;
  return { plots, food, serverNow: now };
}
export function changeFarm(db: DatabaseSync, visitorId: string, action: "plant" | "harvest", plotId: number,
  crop: Crop | undefined, version: number, requestId: string, now = Date.now()) {
  if (action === "plant" && crop === "carrot") return { ok: false as const, reason: "Pull the giant carrot with another visitor instead." };
  db.exec("BEGIN IMMEDIATE");
  try {
    const fingerprint = JSON.stringify({ action, plotId, crop, version });
    const previous = db.prepare("SELECT fingerprint FROM farm_requests WHERE visitor_id = ? AND request_id = ?").get(visitorId, requestId) as { fingerprint: string } | undefined;
    if (previous) {
      db.exec("COMMIT");
      return previous.fingerprint === fingerprint ? { ok: true as const, replay: true, farm: farmState(db, now) }
        : { ok: false as const, reason: "This request was already used for another action." };
    }
    const plot = db.prepare("SELECT crop, ready_at, version FROM farm_plots WHERE id = ?").get(plotId) as { crop: Crop | null; ready_at: number | null; version: number } | undefined;
    let reason: string | undefined;
    if (!plot || plot.version !== version) reason = "Someone tended this plot already. Try again.";
    else if (action === "plant" && plot.crop) reason = "Something is already growing here.";
    else if (action === "harvest" && (!plot.crop || plot.ready_at === null || plot.ready_at > now)) reason = "This crop is not ready yet.";
    if (reason) { db.exec("ROLLBACK"); return { ok: false as const, reason }; }
    if (action === "plant" && crop) {
      db.prepare("UPDATE farm_plots SET crop = ?, planted_at = ?, ready_at = ?, version = version + 1 WHERE id = ?")
        .run(crop, now, now + CROPS[crop].growMs, plotId);
    } else {
      db.prepare("UPDATE farm_food SET quantity = quantity + 3 WHERE crop = ?").run(plot!.crop);
      db.prepare("UPDATE farm_plots SET crop = NULL, planted_at = NULL, ready_at = NULL, version = version + 1 WHERE id = ?").run(plotId);
    }
    db.prepare("INSERT INTO farm_requests (visitor_id, request_id, fingerprint) VALUES (?, ?, ?)").run(visitorId, requestId, fingerprint);
    db.exec("COMMIT");
    return { ok: true as const, replay: false, farm: farmState(db, now) };
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}
