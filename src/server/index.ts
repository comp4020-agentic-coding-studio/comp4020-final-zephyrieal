import express, { type Request, type Response, type NextFunction } from "express";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { marked } from "marked";
import { db } from "./db.ts";

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
app.use(express.static(publicDir));

// Anonymous, persistent-per-browser identity: no accounts, no passwords. A
// returning visitor keeps the same id for as long as they keep the cookie;
// a stranger with no cookie gets a fresh one. See README, "A world that
// remembers" --- the id exists so a trace can be attributed to *a* visitor,
// not so visitors can be told apart in any stronger sense than that.
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

// The core thing, for now: see Potato, feed Potato, and find the sanctuary
// remembers it. Everything else in the full design (other guinea pigs,
// gestures, construction, more than one visitor at once) waits for later
// weeks --- this is proof of life, not the finished app.
app.get("/api/state", (_req: Request, res: Response) => {
  const guineaPig = getPotato();
  const recentVisits = db
    .prepare("SELECT action, created_at FROM visits ORDER BY id DESC LIMIT 5")
    .all();
  res.json({ guineaPig, recentVisits });
});

app.post("/api/feed", (req: Request, res: Response) => {
  db.prepare(
    "UPDATE guinea_pigs SET feed_count = feed_count + 1, last_fed_at = datetime('now') WHERE id = 'potato'",
  ).run();
  db.prepare("INSERT INTO visits (visitor_id, action) VALUES (?, 'fed potato')").run(
    req.visitorId,
  );
  res.json({ guineaPig: getPotato() });
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
    <link rel="stylesheet" href="/style.css" />
  </head>
  <body>
    <main class="readme">${html}</main>
  </body>
</html>`);
});

const port = Number(process.env.PORT ?? 8080);
app.listen(port, "0.0.0.0", () => {
  console.log(`Guinea Pig Sanctuary listening on :${port}`);
});
