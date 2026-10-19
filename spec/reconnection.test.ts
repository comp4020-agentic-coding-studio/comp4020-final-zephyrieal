import { expect, inject, it } from "vitest";
import { randomUUID } from "node:crypto";
import { FURNITURE_CATALOG } from "../src/server/furniture.ts";
import { connectAs } from "./ws-client.ts";
import { findFreeTile } from "./tile-finder.ts";
import { cookieFor } from "./identity.ts";

// Scenario 6: a visitor who disconnects while someone else changes the house
// gets the latest layout on reconnect, without manually reloading. The real
// mechanism (src/client/state/useSanctuary.ts) is "re-fetch /api/state on
// every socket open, including reconnects" --- this test exercises exactly
// that: a fresh connection followed by the same state-hydration request the
// client always makes right after opening.
const baseUrl = inject("baseUrl");

async function feedUntil(visitorId: string, minBalance: number): Promise<void> {
  let balance = 0;
  while (balance < minBalance) {
    const res = await fetch(new URL("/api/feed", baseUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: cookieFor(visitorId) },
      body: JSON.stringify({ requestId: randomUUID() }),
    }).then((r) => r.json());
    balance = res.balance;
  }
}

it("gives a reconnecting visitor the layout changes that happened while they were away", async () => {
  const visitorA = randomUUID();
  const visitorB = randomUUID();

  const wsA = await connectAs(baseUrl, visitorA);
  wsA.close();
  await new Promise((resolve) => setTimeout(resolve, 50)); // let the server's close handler run

  await feedUntil(visitorB, FURNITURE_CATALOG.hideout.cost);
  const existing = await fetch(new URL("/api/state", baseUrl))
    .then((r) => r.json())
    .then((s) => s.furniture);
  const { tileX, tileY } = findFreeTile(existing, "hideout");
  const placed = await fetch(new URL("/api/furniture/place", baseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: cookieFor(visitorB) },
    body: JSON.stringify({ kind: "hideout", tileX, tileY, requestId: randomUUID() }),
  }).then((r) => r.json());
  expect(placed.ok).toBe(true);

  const wsAReconnected = await connectAs(baseUrl, visitorA);
  try {
    const stateAfterReconnect = await fetch(new URL("/api/state", baseUrl), {
      headers: { cookie: cookieFor(visitorA) },
    }).then((r) => r.json());

    expect(
      stateAfterReconnect.furniture.some(
        (f: { kind: string; tile_x: number; tile_y: number }) =>
          f.kind === "hideout" && f.tile_x === tileX && f.tile_y === tileY,
      ),
    ).toBe(true);
  } finally {
    wsAReconnected.close();
  }
});
