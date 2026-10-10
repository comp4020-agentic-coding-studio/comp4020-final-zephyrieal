import { expect, inject, it } from "vitest";
import { randomUUID } from "node:crypto";
import { FURNITURE_CATALOG } from "../src/server/furniture.ts";
import { connectAs, nextMessage } from "./ws-client.ts";
import { findFreeTile } from "./tile-finder.ts";

// Scenarios 2 and 3. Tile coordinates are found dynamically against whatever
// the house currently looks like (see tile-finder.ts) rather than hardcoded,
// so these stay correct whether this is a fresh database (CI) or a local dev
// database that already has furniture in it from earlier runs.
const baseUrl = inject("baseUrl");

function cookieFor(visitorId: string) {
  return `visitor=${visitorId}`;
}

async function currentFurniture() {
  return fetch(new URL("/api/state", baseUrl))
    .then((r) => r.json())
    .then((s) => s.furniture);
}

async function feedUntil(visitorId: string, minBalance: number): Promise<number> {
  let balance = 0;
  while (balance < minBalance) {
    const res = await fetch(new URL("/api/feed", baseUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: cookieFor(visitorId) },
      body: JSON.stringify({ requestId: randomUUID() }),
    }).then((r) => r.json());
    balance = res.balance;
  }
  return balance;
}

async function place(visitorId: string, kind: string, tileX: number, tileY: number) {
  const res = await fetch(new URL("/api/furniture/place", baseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: cookieFor(visitorId) },
    body: JSON.stringify({ kind, tileX, tileY, requestId: randomUUID() }),
  });
  return { status: res.status, body: await res.json() };
}

it("places furniture, broadcasts it to another visitor within ~1s, and charges only the buyer", async () => {
  const visitorA = randomUUID();
  const visitorB = randomUUID();
  const cost = FURNITURE_CATALOG.hay_bed.cost;
  const balanceBeforePurchase = await feedUntil(visitorA, cost);
  const { tileX, tileY } = findFreeTile(await currentFurniture(), "hay_bed");

  const beforeB = await fetch(new URL("/api/state", baseUrl), {
    headers: { cookie: cookieFor(visitorB) },
  }).then((r) => r.json());

  const wsB = await connectAs(baseUrl, visitorB);
  try {
    const broadcastArrives = nextMessage(wsB, (msg) => msg.type === "furniture-placed");

    const { status, body } = await place(visitorA, "hay_bed", tileX, tileY);

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.balance).toBe(balanceBeforePurchase - cost);

    const broadcast = await broadcastArrives; // rejects after 2s if it never arrives
    expect(broadcast.furniture.kind).toBe("hay_bed");
    expect(broadcast.furniture.tile_x).toBe(tileX);
    expect(broadcast.furniture.tile_y).toBe(tileY);

    const afterB = await fetch(new URL("/api/state", baseUrl), {
      headers: { cookie: cookieFor(visitorB) },
    }).then((r) => r.json());
    expect(afterB.carePoints).toBe(beforeB.carePoints); // watching someone else buy costs nothing
  } finally {
    wsB.close();
  }
});

it("rejects placement on an occupied tile without creating furniture or deducting points", async () => {
  const visitorA = randomUUID();
  await feedUntil(visitorA, FURNITURE_CATALOG.hay_bed.cost + FURNITURE_CATALOG.tunnel.cost);
  const { tileX, tileY } = findFreeTile(await currentFurniture(), "hay_bed");

  const first = await place(visitorA, "hay_bed", tileX, tileY);
  expect(first.body.ok).toBe(true);

  const stateBefore = await fetch(new URL("/api/state", baseUrl), {
    headers: { cookie: cookieFor(visitorA) },
  }).then((r) => r.json());

  // Same origin tile as the hay_bed just placed --- whatever the tunnel's
  // footprint turns out to be from there, it overlaps the hay_bed's own
  // first cell at minimum.
  const { status, body } = await place(visitorA, "tunnel", tileX, tileY);

  expect(status).toBe(409);
  expect(body.ok).toBe(false);
  expect(typeof body.reason).toBe("string");
  expect(body.reason.length).toBeGreaterThan(0);

  const stateAfter = await fetch(new URL("/api/state", baseUrl), {
    headers: { cookie: cookieFor(visitorA) },
  }).then((r) => r.json());
  expect(stateAfter.furniture.length).toBe(stateBefore.furniture.length);
  expect(stateAfter.carePoints).toBe(stateBefore.carePoints);
});
