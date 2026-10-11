import express, { type Request, type Response, type NextFunction } from "express";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { marked } from "marked";
import { db } from "./db.ts";
import { attachRealtime, broadcast, sendToVisitor } from "./realtime.ts";
import {
  earnCarePoints,
  getBalance,
  getFurniture,
  getStoredFurniture,
  placeFurniture,
  editFurniture,
  storeFurniture,
  retrieveFurniture,
  type Rotation,
  FEED_REWARD,
} from "./furniture.ts";
import { contribute, getConstructionState } from "./construction.ts";

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

const app = express();
app.use(express.json());

// Anonymous, persistent-per-browser identity: no accounts, no passwords. A
// returning visitor keeps the same id for as long as they keep the cookie;
// a stranger with no cookie gets a fresh one. See README, "A world that
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
  const cookie = req.headers.cookie ?? "";
  const existing = cookie.match(/visitor=([a-f0-9-]+)/)?.[1];
  const visitorId = existing ?? randomUUID();
  if (!existing) {
    res.setHeader("Set-Cookie", `visitor=${visitorId}; Path=/; Max-Age=31536000; SameSite=Lax`);
  }
  req.visitorId = visitorId;
  next();
});

app.use(express.static(publicDir));

interface GuineaPig {
  name: string;
  personality: string;
  feed_count: number;
  last_fed_at: string | null;
}

function getPotato(): GuineaPig {
  return db
    .prepare(
      "SELECT name, personality, feed_count, last_fed_at FROM guinea_pigs WHERE id = 'potato'",
    )
    .get() as unknown as GuineaPig;
}

interface Flower {
  id: number;
  x: number;
  y: number;
  planted_at: string;
}

function getFlowers(): Flower[] {
  return db
    .prepare("SELECT id, x, y, planted_at FROM flowers ORDER BY id ASC")
    .all() as unknown as Flower[];
}

// The core thing, for now: see Potato, feed Potato, plant a flower, and find
// the sanctuary remembers all of it. Everything else in the full design
// (other guinea pigs, gestures, construction, more than one visitor at once)
// waits for later weeks --- this is proof of life, not the finished app.
app.get("/api/state", (req: Request, res: Response) => {
  const guineaPig = getPotato();
  const flowers = getFlowers();
  const furniture = getFurniture(db);
  const storedFurniture = getStoredFurniture(db);
  const carePoints = getBalance(db, req.visitorId);
  const construction = getConstructionState(db);
  const recentVisits = db
    .prepare("SELECT action, created_at FROM visits ORDER BY id DESC LIMIT 5")
    .all();
  res.json({ guineaPig, flowers, furniture, storedFurniture, carePoints, construction, recentVisits });
});

// Feeding earns Care Points (CLAUDE.md's discussed exception) alongside the
// existing feed-count update. requestId defaults to a fresh id so the
// existing no-body call this route already supported keeps working; a client
// that wants a feed to be retry-safe can supply its own.
app.post("/api/feed", (req: Request, res: Response) => {
  const { requestId } = (req.body ?? {}) as { requestId?: unknown };
  const id = typeof requestId === "string" && requestId.length > 0 ? requestId : randomUUID();

  db.prepare(
    "UPDATE guinea_pigs SET feed_count = feed_count + 1, last_fed_at = datetime('now') WHERE id = 'potato'",
  ).run();
  db.prepare("INSERT INTO visits (visitor_id, action) VALUES (?, 'fed potato')").run(
    req.visitorId,
  );
  const { balance } = earnCarePoints(db, req.visitorId, FEED_REWARD, "fed potato", id);

  sendToVisitor(req.visitorId, { type: "balance-updated", balance });
  res.json({ guineaPig: getPotato(), balance });
});

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
    res.status(400).json({
      ok: false,
      reason: "kind (string), tileX/tileY (integers) and requestId (string) are required",
    });
    return;
  }

  const result = placeFurniture(db, req.visitorId, kind, tileX, tileY, requestId);
  if (!result.ok) {
    res.status(409).json(result);
    return;
  }

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
    res.status(400).json({
      ok: false,
      reason:
        "id, tileX, tileY, version (integers), rotation (0/90/180/270) and requestId (string) are required",
    });
    return;
  }

  const result = editFurniture(db, id, tileX, tileY, rotation, version, requestId);
  if (!result.ok) {
    res.status(409).json(result);
    return;
  }

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
    res.status(400).json({
      ok: false,
      reason: "id, version (integers) and requestId (string) are required",
    });
    return;
  }

  const result = storeFurniture(db, id, version, requestId);
  if (!result.ok) {
    res.status(409).json(result);
    return;
  }

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
    res.status(400).json({
      ok: false,
      reason:
        "id, tileX, tileY, version (integers), rotation (0/90/180/270) and requestId (string) are required",
    });
    return;
  }

  const result = retrieveFurniture(db, id, tileX, tileY, rotation, version, requestId);
  if (!result.ok) {
    res.status(409).json(result);
    return;
  }

  res.json(result);
  broadcast({ type: "furniture-retrieved", furniture: result.furniture });
});

// A flower is planted at a position in the meadow and stays there for every
// future visitor --- the server decides what actually gets stored (clamped,
// validated coordinates), never trusting the client's number outright, per
// CLAUDE.md's "the server is authoritative" rule.
app.post("/api/plant", (req: Request, res: Response) => {
  const { x, y } = req.body as { x?: unknown; y?: unknown };
  if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) {
    res.status(400).json({ error: "x and y must be numbers" });
    return;
  }
  const clampedX = Math.min(100, Math.max(0, x));
  const clampedY = Math.min(100, Math.max(0, y));

  db.prepare("INSERT INTO flowers (x, y, planted_by) VALUES (?, ?, ?)").run(
    clampedX,
    clampedY,
    req.visitorId,
  );
  db.prepare("INSERT INTO visits (visitor_id, action) VALUES (?, 'planted a flower')").run(
    req.visitorId,
  );
  res.json({ flowers: getFlowers() });
});

// A "Build!" click. No client-sent progress value is ever accepted --- the
// server alone decides how many units a click is worth, based on how many
// distinct visitors it has seen contribute in the last few seconds. See
// src/server/construction.ts and
// docs/decisions/0003-construction-concurrency.md.
app.post("/api/construction/contribute", (req: Request, res: Response) => {
  const { requestId } = req.body as { requestId?: unknown };
  if (typeof requestId !== "string" || requestId.length === 0) {
    res.status(400).json({ ok: false, reason: "requestId (string) is required" });
    return;
  }

  const result = contribute(db, req.visitorId, requestId);
  if (!result.ok) {
    res.status(409).json(result);
    return;
  }

  res.json(result);
  broadcast({
    type: "construction-progress",
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
// for --- it broadcasts only when the active-builder count actually changed
// since the last tick, not on every tick.
let lastBroadcastActiveBuilders = -1;
setInterval(() => {
  const snapshot = getConstructionState(db);
  if (snapshot.activeBuilders !== lastBroadcastActiveBuilders) {
    lastBroadcastActiveBuilders = snapshot.activeBuilders;
    broadcast({ type: "construction-progress", ...snapshot });
  }
}, 1000);
