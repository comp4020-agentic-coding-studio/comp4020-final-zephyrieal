import { isRoom, roomBuilding, type Room } from "../shared/rooms.ts";
import { GUINEA_PIGS } from "../shared/guinea-pigs.ts";
import { createCarrot } from "./carrot.ts";
import { farmState, changeFarm } from "./farm.ts";
import { CROPS, FARM_PLOTS, FARM_REACH, isCrop } from "../shared/farm.ts";
import express, { type Request, type Response, type NextFunction } from "express";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { marked } from "marked";
import { db } from "./db.ts";
import { attachRealtime, broadcast, sendToVisitor, playerForVisitor, movePlayerRoom, renameVisitor } from "./realtime.ts";
import { cleanName, getName, setName, NAME_MAX_LENGTH } from "./names.ts";
import {
  getBalance,
  getFurniture,
  getStoredFurniture,
  placeFurniture,
  editFurniture,
  storeFurniture,
  retrieveFurniture,
  type Rotation,
} from "./furniture.ts";
import { contribute, getConstructionState, isKnownProject, PROJECTS } from "./construction.ts";
import { logAction } from "./log.ts";
import { mintVisitorCookie, verifyVisitorCookie, VISITOR_COOKIE_MAX_AGE } from "./identity.ts";
import { inhabitantPosition, tickInhabitant, visitHouse } from "./indoor-guinea-pigs.ts";

declare global {
  namespace Express {
    interface Request {
      visitorId: string;
    }
  }
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");
const publicDir = join(repoRoot, "public");

import { inReach, sitePosition, FEED_REACH, BUILD_REACH, roomDimensions } from "../shared/interactions.ts";

const app = express();
const carrot = createCarrot(db, playerForVisitor);
function requireNearby(req: Request, res: Response, x: number, y: number, reach: number, reason: string, room: Room = "outdoor"): boolean {
  const player = playerForVisitor(req.visitorId, req.get("X-Player-Id"));
  if (inReach(player, x, y, reach, room)) return true;
  logAction(req.visitorId, "interaction-denied", { action: req.path, reason });
  res.status(403).json({ ok: false, reason });
  return false;
}
app.use(express.json());

// Anonymous, persistent-per-browser identity: no accounts, no passwords. A
// returning visitor keeps the same id for as long as they keep the cookie;
// a stranger with no cookie --- or one whose signature doesn't verify, see
// src/server/identity.ts --- gets a fresh one. See README, "A world that
// remembers" --- the id exists so a trace can be attributed to *a* visitor,
// not so visitors can be told apart in any stronger sense than that.
//
// Registered before express.static (found while verifying the construction
// minigame): a visitor's very first request is normally `GET /`, which
// express.static answers directly and never reaches middleware registered
// after it --- so the first page load never minted a cookie, and the page's
// own first WebSocket upgrade (which carries whatever cookie the browser has
// at that moment) had nothing to send, got rejected by realtime.ts for
// lacking one, and only recovered once some later request (any fetch to a
// non-static route) finally minted one. Registering this first means every
// request, including the first one, gets an identity before anything else
// runs.
app.use((req: Request, res: Response, next: NextFunction) => {
  const verified = verifyVisitorCookie(req.headers.cookie);
  if (verified) {
    req.visitorId = verified;
  } else {
    const { id, cookieValue } = mintVisitorCookie();
    res.setHeader("Set-Cookie", `visitor=${cookieValue}; Path=/; Max-Age=${VISITOR_COOKIE_MAX_AGE}; SameSite=Lax`);
    req.visitorId = id;
    // A cookie that was present but failed verification is a forged or
    // stale (pre-signing) value, not just an absent one --- worth its own
    // event for the crit's "permission or validation failure" log, distinct
    // from the ordinary first-visit mint every new visitor also triggers.
    if (req.headers.cookie) {
      logAction(id, "visitor-identity-rejected", { reason: "signature invalid or missing" });
    }
  }
  next();
});

app.use(express.static(publicDir));

interface GuineaPig {
  name: string;
  personality: string;
  feed_count: number;
  last_fed_at: string | null;
}

function getHuahua(id = "potato"): GuineaPig {
  return db
    .prepare(
      "SELECT name, personality, feed_count, last_fed_at FROM guinea_pigs WHERE id = ?",
    )
    .get(id) as unknown as GuineaPig;
}

// Shared persistent sanctuary state and current movement snapshots.
app.get("/api/state", (req: Request, res: Response) => {
  const guineaPig = getHuahua();
  // Huahua's current position in the meadow --- ephemeral, in-memory state
  // kept separate from the guineaPig object above, which mirrors the
  // persistent guinea_pigs table. See src/server/guinea-pig.ts and
  // PROCESS.md's "Huahua wanders the meadow" section for why her position
  // isn't a database column.
  const guineaPigMovement = inhabitantPosition("potato");
  const farm = farmState(db);
  const room = isRoom(req.query.room) && req.query.room !== "outdoor" ? req.query.room : "indoor";
  const furniture = getFurniture(db, room);
  const storedFurniture = getStoredFurniture(db, room);
  const carePoints = getBalance(db, req.visitorId);
  const construction = Object.fromEntries(
    PROJECTS.map((p) => [p.id, getConstructionState(db, p.id)]),
  );
  const recentVisits = db
    .prepare("SELECT action, created_at FROM visits ORDER BY id DESC LIMIT 5")
    .all();
  res.json({
    guineaPig,
    guineaPigMovement,
    guineaPigs: GUINEA_PIGS.map(p => ({ id: p.id, ...getHuahua(p.id), movement: inhabitantPosition(p.id) })),
    farm,
    furniture,
    storedFurniture,
    carePoints,
    visitorName: getName(req.visitorId) ?? null,
    construction,
    recentVisits,
    carrot: carrot.state(),
  });
});

// The name shown above this visitor's avatar. Only ever the caller's own
// name --- the cookie decides whose, never a client-supplied id.
app.post("/api/name", (req: Request, res: Response) => {
  const name = cleanName(req.body?.name);
  if (!name) { res.status(400).json({ ok: false, reason: `Choose a name of 1–${NAME_MAX_LENGTH} characters.` }); return; }
  setName(req.visitorId, name);
  renameVisitor(req.visitorId, name);
  logAction(req.visitorId, "chose-name", { name });
  res.json({ ok: true, name });
});

// Feeding earns Care Points (CLAUDE.md's discussed exception) alongside the
// existing feed-count update. requestId defaults to a fresh id so the
// existing no-body call this route already supported keeps working; a client
// that wants a feed to be retry-safe can supply its own.
app.post("/api/feed", (req: Request, res: Response) => {
  const guineaPigId = req.body?.guineaPigId ?? "potato";
  const inhabitant = GUINEA_PIGS.find(p => p.id === guineaPigId);
  if (!inhabitant) { res.status(400).json({ ok: false, reason: "Choose a known guinea pig." }); return; }
  const potato = inhabitantPosition(guineaPigId);
  const {width,height}=roomDimensions(potato.room);
  if (!requireNearby(req, res, potato.x * width / 100, potato.y * height / 100,
      FEED_REACH, `Walk closer to ${inhabitant.name} to feed them.`, potato.room)) return;
  const { requestId = randomUUID(), crop = "hay" } = req.body ?? {};
  if (typeof requestId !== "string" || !requestId || !isCrop(crop)) {
    res.status(400).json({ ok: false, reason: "Choose a valid food and request id." }); return;
  }
  db.exec("BEGIN IMMEDIATE");
  try {
    const previous = db.prepare("SELECT crop, guinea_pig_id FROM feed_requests WHERE visitor_id = ? AND request_id = ?").get(req.visitorId, requestId) as { crop: string; guinea_pig_id: string } | undefined;
    if (previous && (previous.crop !== crop || previous.guinea_pig_id !== guineaPigId)) {
      db.exec("ROLLBACK"); res.status(409).json({ ok: false, reason: "That request was used for another food." }); return;
    }
    if (!previous) {
      const stock = db.prepare("SELECT quantity FROM farm_food WHERE crop = ?").get(crop) as { quantity: number };
      // Basic hay remains available while the shared garden grows; harvested
      // vegetables are extra choices, not a requirement for the first feeding.
      if (crop !== "hay" && stock.quantity < 1) {
        db.exec("ROLLBACK"); res.status(409).json({ ok: false, reason: "Harvest this food from the farm first." }); return;
      }
      if (stock.quantity > 0) db.prepare("UPDATE farm_food SET quantity = quantity - 1 WHERE crop = ?").run(crop);
      db.prepare("UPDATE guinea_pigs SET feed_count = feed_count + 1, last_fed_at = datetime('now') WHERE id = ?").run(guineaPigId);
      db.prepare("INSERT INTO visits (visitor_id, action) VALUES (?, ?)").run(req.visitorId, `fed ${guineaPigId} ${crop}`);
      db.prepare("INSERT INTO care_point_transactions (visitor_id, delta, reason, request_id) VALUES (?, ?, ?, ?)").run(req.visitorId, CROPS[crop].carePoints, `fed ${guineaPigId}`, `${req.visitorId}:${requestId}`);
      db.prepare("INSERT INTO feed_requests (visitor_id, request_id, crop, guinea_pig_id) VALUES (?, ?, ?, ?)").run(req.visitorId, requestId, crop, guineaPigId);
    }
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
    const balance = getBalance(db, req.visitorId);
    logAction(req.visitorId, "fed-guinea-pig", { guineaPigId, crop, balance });
    sendToVisitor(req.visitorId, { type: "balance-updated", balance });
    broadcast({ type: "guinea-pig-fed", guineaPigId, guineaPig: getHuahua(guineaPigId) });
    broadcast({ type: "farm-updated", farm: farmState(db) });
    res.json({ ok: true, guineaPigId, guineaPig: getHuahua(guineaPigId), balance });
});

// Enter only finished buildings from their nearby doorway. Interiors are public.
app.post("/api/room", (req: Request, res: Response) => {
  const player = playerForVisitor(req.visitorId, req.get("X-Player-Id"));
  const room = req.body?.room;
  if (!player || !isRoom(room)) { res.status(403).json({ ok: false, reason: "Reconnect before changing rooms." }); return; }
  let position: {x: number; y: number} | undefined;
  if (room !== "outdoor") {
    const id = roomBuilding(room)!;
    const site = sitePosition(id);
    if (player.room !== "outdoor" || getConstructionState(db, id).status !== "completed" || !site || !inReach(player, site.x, site.y, BUILD_REACH)) {
      res.status(403).json({ ok: false, reason: "Walk up to a completed building to enter it." }); return;
    }
  } else if (player.room !== "outdoor") {
    const site = sitePosition(roomBuilding(player.room)!);
    if (site) position = { x: site.x, y: site.y + 40 };
  }
  movePlayerRoom(player.id, room, position);
  const visitor = visitHouse(room, room === "outdoor" ? [] : getFurniture(db, room));
  if (visitor) broadcast({ type: "guinea-pig-walking", ...visitor });
  logAction(req.visitorId, "room-changed", { room });
  res.json({ ok: true, room });
});

// Legacy clients without an avatar can decorate the original shelter only.
// A supplied avatar must be authenticated and physically inside its room.
function furnitureRoom(req: Request, res: Response, itemId?: number): string | undefined {
  const supplied = req.get("X-Player-Id");
  const player = playerForVisitor(req.visitorId, supplied);
  const room = supplied ? player?.room : "indoor";
  if (!room || room === "outdoor") { res.status(403).json({ ok: false, reason: "Walk into a building to decorate it." }); return; }
  if (itemId !== undefined) {
    const item = db.prepare("SELECT room_id FROM furniture WHERE id = ?").get(itemId) as {room_id: string} | undefined;
    if (item && item.room_id !== room) { res.status(403).json({ ok: false, reason: "That furniture belongs in another shared room." }); return; }
  }
  return room;
}

// Places a piece of furniture in the shared house, spending Care Points. The
// whole check (balance, tile validity) and commit happens inside
// placeFurniture as one atomic, synchronous transaction --- see
// src/server/furniture.ts and docs/decisions/0001-concurrent-furniture-placement.md
// for why that's what actually makes concurrent placement safe.
app.post("/api/furniture/place", (req: Request, res: Response) => {
  const { kind, tileX, tileY, requestId } = req.body as {
    kind?: unknown;
    tileX?: unknown;
    tileY?: unknown;
    requestId?: unknown;
  };
  if (
    typeof kind !== "string" ||
    typeof tileX !== "number" ||
    typeof tileY !== "number" ||
    !Number.isInteger(tileX) ||
    !Number.isInteger(tileY) ||
    typeof requestId !== "string" ||
    requestId.length === 0
  ) {
    const reason = "kind (string), tileX/tileY (integers) and requestId (string) are required";
    logAction(req.visitorId, "furniture-place-rejected", { reason });
    res.status(400).json({ ok: false, reason });
    return;
  }

  const room = furnitureRoom(req, res); if (!room) return;
  const result = placeFurniture(db, req.visitorId, kind, tileX, tileY, requestId, room);
  if (!result.ok) {
    logAction(req.visitorId, "furniture-place-denied", { kind, tileX, tileY, reason: result.reason });
    res.status(409).json(result);
    return;
  }
  logAction(req.visitorId, result.replay ? "furniture-place-replay" : "furniture-placed", {
    furnitureId: result.furniture.id,
    kind,
    tileX,
    tileY,
  });

  res.json(result);
  broadcast({ type: "furniture-placed", furniture: result.furniture });
  sendToVisitor(req.visitorId, { type: "balance-updated", balance: result.balance });
});

function isRotation(value: unknown): value is Rotation {
  return value === 0 || value === 90 || value === 180 || value === 270;
}

// Moves and/or rotates an existing piece --- free, and never touches Care
// Points. The visitor's menu commits both together in one Save, so this is
// one call; the route still broadcasts the two events the brief asks for
// since other clients handle them identically anyway (merge the row in).
app.post("/api/furniture/edit", (req: Request, res: Response) => {
  const { id, tileX, tileY, rotation, version, requestId } = req.body as {
    id?: unknown;
    tileX?: unknown;
    tileY?: unknown;
    rotation?: unknown;
    version?: unknown;
    requestId?: unknown;
  };
  if (
    typeof id !== "number" ||
    !Number.isInteger(id) ||
    typeof tileX !== "number" ||
    !Number.isInteger(tileX) ||
    typeof tileY !== "number" ||
    !Number.isInteger(tileY) ||
    !isRotation(rotation) ||
    typeof version !== "number" ||
    !Number.isInteger(version) ||
    typeof requestId !== "string" ||
    requestId.length === 0
  ) {
    const reason = "id, tileX, tileY, version (integers), rotation (0/90/180/270) and requestId (string) are required";
    logAction(req.visitorId, "furniture-edit-rejected", { reason });
    res.status(400).json({ ok: false, reason });
    return;
  }

  if (!furnitureRoom(req, res, id)) return;
  const result = editFurniture(db, id, tileX, tileY, rotation, version, requestId);
  if (!result.ok) {
    logAction(req.visitorId, "furniture-edit-denied", { id, tileX, tileY, rotation, reason: result.reason });
    res.status(409).json(result);
    return;
  }
  logAction(req.visitorId, result.replay ? "furniture-edit-replay" : "furniture-edited", {
    id,
    tileX,
    tileY,
    rotation,
  });

  res.json(result);
  broadcast({ type: "furniture-moved", furniture: result.furniture });
  broadcast({ type: "furniture-rotated", furniture: result.furniture });
});

// Stores a placed piece into the shared pool --- it stays in the database,
// it just stops occupying a tile. Never refunds, never costs anything.
app.post("/api/furniture/store", (req: Request, res: Response) => {
  const { id, version, requestId } = req.body as {
    id?: unknown;
    version?: unknown;
    requestId?: unknown;
  };
  if (
    typeof id !== "number" ||
    !Number.isInteger(id) ||
    typeof version !== "number" ||
    !Number.isInteger(version) ||
    typeof requestId !== "string" ||
    requestId.length === 0
  ) {
    const reason = "id, version (integers) and requestId (string) are required";
    logAction(req.visitorId, "furniture-store-rejected", { reason });
    res.status(400).json({ ok: false, reason });
    return;
  }

  if (!furnitureRoom(req, res, id)) return;
  const result = storeFurniture(db, id, version, requestId);
  if (!result.ok) {
    logAction(req.visitorId, "furniture-store-denied", { id, reason: result.reason });
    res.status(409).json(result);
    return;
  }
  logAction(req.visitorId, result.replay ? "furniture-store-replay" : "furniture-stored", { id });

  res.json(result);
  broadcast({ type: "furniture-stored", furniture: result.furniture });
});

// Retrieves a stored piece back onto the floor --- free for whoever retrieves
// it, same placement validation as a fresh purchase minus the cost check.
app.post("/api/furniture/retrieve", (req: Request, res: Response) => {
  const { id, tileX, tileY, rotation, version, requestId } = req.body as {
    id?: unknown;
    tileX?: unknown;
    tileY?: unknown;
    rotation?: unknown;
    version?: unknown;
    requestId?: unknown;
  };
  if (
    typeof id !== "number" ||
    !Number.isInteger(id) ||
    typeof tileX !== "number" ||
    !Number.isInteger(tileX) ||
    typeof tileY !== "number" ||
    !Number.isInteger(tileY) ||
    !isRotation(rotation) ||
    typeof version !== "number" ||
    !Number.isInteger(version) ||
    typeof requestId !== "string" ||
    requestId.length === 0
  ) {
    const reason = "id, tileX, tileY, version (integers), rotation (0/90/180/270) and requestId (string) are required";
    logAction(req.visitorId, "furniture-retrieve-rejected", { reason });
    res.status(400).json({ ok: false, reason });
    return;
  }

  if (!furnitureRoom(req, res, id)) return;
  const result = retrieveFurniture(db, id, tileX, tileY, rotation, version, requestId);
  if (!result.ok) {
    logAction(req.visitorId, "furniture-retrieve-denied", { id, tileX, tileY, reason: result.reason });
    res.status(409).json(result);
    return;
  }
  logAction(req.visitorId, result.replay ? "furniture-retrieve-replay" : "furniture-retrieved", {
    id,
    tileX,
    tileY,
  });

  res.json(result);
  broadcast({ type: "furniture-retrieved", furniture: result.furniture });
});

// Farm actions require this tab's authenticated nearby avatar. Versioning and
// request ids protect shared plots against double planting or harvesting.
for (const action of ["plant", "harvest"] as const) {
  app.post(`/api/farm/${action}`, (req: Request, res: Response) => {
    const { plotId, crop, version, requestId } = req.body ?? {};
    const plot = FARM_PLOTS.find(p => p.id === plotId);
    if (!plot || !Number.isInteger(version) || typeof requestId !== "string" || !requestId || (action === "plant" && !isCrop(crop))) {
      res.status(400).json({ ok: false, reason: "Choose a valid plot and crop." }); return;
    }
    if (!requireNearby(req, res, plot.x, plot.y, FARM_REACH, "Walk closer to this farm plot.")) return;
    const result = changeFarm(db, req.visitorId, action, plotId, action === "plant" ? crop : undefined, version, requestId);
    if (!result.ok) { res.status(409).json({ ...result, farm: farmState(db) }); return; }
    logAction(req.visitorId, `farm-${action}`, { plotId, crop, replay: result.replay });
    broadcast({ type: "farm-updated", farm: result.farm });
    res.json(result);
  });
}

app.post("/api/carrot", (req: Request, res: Response) => {
  const { action, round } = req.body ?? {};
  if ((action !== "join" && action !== "leave") || !Number.isSafeInteger(round)) {
    res.status(400).json({ ok: false, reason: "Choose a valid carrot action." }); return;
  }
  const playerId = req.get("X-Player-Id") ?? "";
  const result = carrot.act(req.visitorId, playerId, round, action);
  if (!result.ok) { res.status(409).json(result); return; }
  broadcast({ type: "carrot-updated", carrot: result.carrot });
  logAction(req.visitorId, `carrot-${action}`, { round });
  res.json(result);
});
let previousCarrot = "";
const carrotTimer = setInterval(() => {
  const result = carrot.tick();
  const { serverNow, ...visible } = result.carrot;
  const key = JSON.stringify({ ...visible, ready: serverNow >= visible.readyAt });
  if (key !== previousCarrot) {
    previousCarrot = key;
    broadcast({ type: "carrot-updated", carrot: result.carrot });
  }
  if (result.harvested) {
    broadcast({ type: "farm-updated", farm: farmState(db) });
    logAction("sanctuary", "carrot-harvested", { harvests: result.carrot.harvests, portions: 3 });
  }
}, 100);
carrotTimer.unref();

// A "Build!" click. No client-sent progress value is ever accepted --- the
// server alone decides how many units a click is worth, based on how many
// distinct visitors it has seen contribute in the last few seconds. See
// src/server/construction.ts and
// docs/decisions/0003-construction-concurrency.md.
app.post("/api/construction/contribute", (req: Request, res: Response) => {
  const { projectId, requestId } = req.body as { projectId?: unknown; requestId?: unknown };
  if (typeof projectId !== "string" || projectId.length === 0 || !isKnownProject(projectId)) {
    const reason = "projectId (string, a known construction project) is required";
    logAction(req.visitorId, "construction-contribute-rejected", { reason });
    res.status(400).json({ ok: false, reason });
    return;
  }
  if (typeof requestId !== "string" || requestId.length === 0) {
    const reason = "requestId (string) is required";
    logAction(req.visitorId, "construction-contribute-rejected", { projectId, reason });
    res.status(400).json({ ok: false, reason });
    return;
  }

  const site = sitePosition(projectId);
  if (!site || !requireNearby(req, res, site.x, site.y, BUILD_REACH,
      "Walk up to this building to help build it.")) return;
  const result = contribute(db, req.visitorId, projectId, requestId);
  if (!result.ok) {
    logAction(req.visitorId, "construction-contribute-denied", { projectId, reason: result.reason });
    res.status(409).json(result);
    return;
  }
  logAction(req.visitorId, result.replay ? "construction-contribute-replay" : "construction-contributed", {
    projectId,
    unitsAwarded: result.unitsAwarded,
    progressUnits: result.progressUnits,
    activeBuilders: result.activeBuilders,
    justCompleted: result.justCompleted,
  });
  // A named event of its own, not just the justCompleted flag buried in the
  // line above --- "construction completed" is one of the crit's required
  // events to be able to point at directly while narrating logs live.
  if (result.justCompleted) {
    logAction(req.visitorId, "construction-completed", { projectId, progressUnits: result.progressUnits });
  }

  res.json(result);
  if (!result.replay) broadcast({ type: "construction-dust", projectId });
  broadcast({
    type: "construction-progress",
    projectId,
    progressUnits: result.progressUnits,
    targetUnits: result.targetUnits,
    status: result.status,
    activeBuilders: result.activeBuilders,
    multiplierUnits: result.multiplierUnits,
    hadCooperativeMoment: result.hadCooperativeMoment,
  });
});

// Publishes README.md in full at /readme/, rendered rather than escaped
// verbatim --- replaces the placeholder's <pre> dump. spec/invariants.test.ts
// checks the README's headings show up here, in order.
app.get("/readme/", (_req: Request, res: Response) => {
  const markdown = readFileSync(join(repoRoot, "README.md"), "utf8");
  const html = marked.parse(markdown, { async: false });
  res.set("Content-Type", "text/html; charset=utf-8").send(`<!doctype html>
<html lang="en-AU">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Guinea Pig Sanctuary — README</title>
    <link rel="stylesheet" href="/readme.css" />
  </head>
  <body>
    <main class="readme">${html}</main>
  </body>
</html>`);
});

const port = Number(process.env.PORT ?? 8080);
const httpServer = app.listen(port, "0.0.0.0", () => {
  console.log(`Guinea Pig Sanctuary listening on :${port}`);
});
attachRealtime(httpServer);

// Progress increasing already broadcasts immediately (a contribution
// triggers its own push); a builder going quiet for 5s has no contribution
// event of its own to push on, so nothing else would ever tell other
// visitors the multiplier just dropped. This is the only thing this tick is
// for --- it broadcasts only when a given project's active-builder count
// actually changed since that project's own last tick, not on every tick,
// and tracks each project independently. Huahua's own walking decisions
// (src/server/guinea-pig.ts) share this same one-second tick rather than
// running a second timer --- there's no behavioral reason for her movement
// to poll on a different cadence than construction's own "has anything
// actually changed" check right above it.
const lastBroadcastActiveBuilders = new Map<string, number>();
setInterval(() => {
  for (const { id: projectId } of PROJECTS) {
    const snapshot = getConstructionState(db, projectId);
    if (snapshot.activeBuilders !== lastBroadcastActiveBuilders.get(projectId)) {
      lastBroadcastActiveBuilders.set(projectId, snapshot.activeBuilders);
      broadcast({ type: "construction-progress", projectId, ...snapshot });
    }
  }

  for (const pig of GUINEA_PIGS) {
    const movement = tickInhabitant(pig.id, room => getFurniture(db, room));
    if (movement) broadcast({ type: "guinea-pig-walking", guineaPigId: pig.id, ...movement });
  }
}, 1000);
