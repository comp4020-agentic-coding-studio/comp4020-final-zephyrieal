import { expect, inject, it } from "vitest";
import { randomUUID } from "node:crypto";
import { FURNITURE_CATALOG } from "../src/server/furniture.ts";
import { connectAs, nextMessage } from "./ws-client.ts";
import { findFreeTile } from "./tile-finder.ts";

// Storing a placed piece moves it into a shared pool instead of deleting it;
// retrieving it back is free for whoever does it, for anyone. See
// docs/decisions/0002-furniture-editing-concurrency.md for why a concurrent
// retrieve race has exactly one winner.
const baseUrl = inject("baseUrl");

function cookieFor(visitorId: string) {
  return `visitor=${visitorId}`;
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

async function stateAs(visitorId: string) {
  return fetch(new URL("/api/state", baseUrl), { headers: { cookie: cookieFor(visitorId) } }).then(
    (r) => r.json(),
  );
}

async function place(visitorId: string, kind: string, tileX: number, tileY: number) {
  const res = await fetch(new URL("/api/furniture/place", baseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: cookieFor(visitorId) },
    body: JSON.stringify({ kind, tileX, tileY, requestId: randomUUID() }),
  });
  return { status: res.status, body: await res.json() };
}

async function store(visitorId: string, id: number, version: number) {
  const res = await fetch(new URL("/api/furniture/store", baseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: cookieFor(visitorId) },
    body: JSON.stringify({ id, version, requestId: randomUUID() }),
  });
  return { status: res.status, body: await res.json() };
}

async function retrieve(
  visitorId: string,
  id: number,
  tileX: number,
  tileY: number,
  rotation: number,
  version: number,
) {
  const res = await fetch(new URL("/api/furniture/retrieve", baseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: cookieFor(visitorId) },
    body: JSON.stringify({ id, tileX, tileY, rotation, version, requestId: randomUUID() }),
  });
  return { status: res.status, body: await res.json() };
}

it("storing a placed item removes it from the house, adds it to shared storage, and never refunds", async () => {
  const visitor = randomUUID();
  await feedUntil(visitor, FURNITURE_CATALOG.hay_bed.cost);
  const tile = findFreeTile((await stateAs(visitor)).furniture, "hay_bed");
  const placed = await place(visitor, "hay_bed", tile.tileX, tile.tileY);
  const row = placed.body.furniture;
  const balanceAfterBuy = placed.body.balance;

  const { status, body } = await store(visitor, row.id, row.version);
  expect(status).toBe(200);
  expect(body.ok).toBe(true);
  expect(body.furniture.status).toBe("stored");

  const after = await stateAs(visitor);
  expect(after.furniture.find((f: { id: number }) => f.id === row.id)).toBeUndefined();
  // Still exists --- never deleted, just no longer occupying a tile.
  expect(after.storedFurniture.find((f: { id: number }) => f.id === row.id)).toBeTruthy();
  expect(after.carePoints).toBe(balanceAfterBuy);
});

it("retrieving a stored item is free and places it back in the house", async () => {
  const visitor = randomUUID();
  await feedUntil(visitor, FURNITURE_CATALOG.hay_bed.cost);
  const tile = findFreeTile((await stateAs(visitor)).furniture, "hay_bed");
  const row = (await place(visitor, "hay_bed", tile.tileX, tile.tileY)).body.furniture;
  const stored = (await store(visitor, row.id, row.version)).body.furniture;
  const balanceAfterStore = (await stateAs(visitor)).carePoints;

  const target = findFreeTile((await stateAs(visitor)).furniture, "hay_bed");
  const { status, body } = await retrieve(visitor, row.id, target.tileX, target.tileY, 0, stored.version);
  expect(status).toBe(200);
  expect(body.ok).toBe(true);
  expect(body.furniture.status).toBe("placed");
  expect(body.furniture.tile_x).toBe(target.tileX);
  expect(body.furniture.tile_y).toBe(target.tileY);

  const after = await stateAs(visitor);
  expect(after.storedFurniture.find((f: { id: number }) => f.id === row.id)).toBeUndefined();
  expect(after.furniture.find((f: { id: number }) => f.id === row.id)).toBeTruthy();
  expect(after.carePoints).toBe(balanceAfterStore); // retrieving is free

  // The house is a small, fixed grid --- put it back in storage so this test
  // leaves the house exactly as full as it found it.
  await store(visitor, body.furniture.id, body.furniture.version);
});

it("lets at most one of two simultaneous retrievals of the same stored item succeed", async () => {
  const owner = randomUUID();
  const visitorA = randomUUID();
  const visitorB = randomUUID();
  await feedUntil(owner, FURNITURE_CATALOG.hay_bed.cost);
  const tile = findFreeTile((await stateAs(owner)).furniture, "hay_bed");
  const row = (await place(owner, "hay_bed", tile.tileX, tile.tileY)).body.furniture;
  const storedRow = (await store(owner, row.id, row.version)).body.furniture;

  const target = findFreeTile((await stateAs(owner)).furniture, "hay_bed");
  const [balanceA0, balanceB0] = await Promise.all([
    stateAs(visitorA).then((s) => s.carePoints),
    stateAs(visitorB).then((s) => s.carePoints),
  ]);

  // Both aim at the exact same stored item and tile, fired together so their
  // HTTP requests race to reach the server.
  const [resA, resB] = await Promise.all([
    retrieve(visitorA, storedRow.id, target.tileX, target.tileY, 0, storedRow.version),
    retrieve(visitorB, storedRow.id, target.tileX, target.tileY, 0, storedRow.version),
  ]);

  const succeeded = [resA.body, resB.body].filter((b) => b.ok === true);
  const rejected = [resA.body, resB.body].filter((b) => b.ok === false);
  expect(succeeded.length).toBe(1);
  expect(rejected.length).toBe(1);

  const [afterA, afterB] = await Promise.all([stateAs(visitorA), stateAs(visitorB)]);
  const placedCopies = afterA.furniture.filter((f: { id: number }) => f.id === storedRow.id);
  expect(placedCopies.length).toBe(1); // never duplicated
  expect(afterA.carePoints).toBe(balanceA0); // retrieving never costs anything, win or lose
  expect(afterB.carePoints).toBe(balanceB0);

  await store(owner, placedCopies[0].id, placedCopies[0].version);
});

it("broadcasts furniture-stored and furniture-retrieved to another connected visitor", async () => {
  const owner = randomUUID();
  const observer = randomUUID();
  await feedUntil(owner, FURNITURE_CATALOG.hay_bed.cost);
  const tile = findFreeTile((await stateAs(owner)).furniture, "hay_bed");
  const row = (await place(owner, "hay_bed", tile.tileX, tile.tileY)).body.furniture;

  const wsObserver = await connectAs(baseUrl, observer);
  try {
    const storedArrives = nextMessage(wsObserver, (msg) => msg.type === "furniture-stored");
    const storeRes = await store(owner, row.id, row.version);
    expect(storeRes.body.ok).toBe(true);
    const storedMsg = await storedArrives; // rejects after 2s if it never arrives
    expect(storedMsg.furniture.id).toBe(row.id);

    const target = findFreeTile((await stateAs(owner)).furniture, "hay_bed");
    const retrievedArrives = nextMessage(wsObserver, (msg) => msg.type === "furniture-retrieved");
    const retrieveRes = await retrieve(
      owner,
      row.id,
      target.tileX,
      target.tileY,
      0,
      storeRes.body.furniture.version,
    );
    expect(retrieveRes.body.ok).toBe(true);
    const retrievedMsg = await retrievedArrives;
    expect(retrievedMsg.furniture.id).toBe(row.id);

    await store(owner, retrieveRes.body.furniture.id, retrieveRes.body.furniture.version);
  } finally {
    wsObserver.close();
  }
});
