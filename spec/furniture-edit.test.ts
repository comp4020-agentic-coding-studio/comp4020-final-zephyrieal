import { expect, inject, it } from "vitest";
import { randomUUID } from "node:crypto";
import { FURNITURE_CATALOG } from "../src/server/furniture.ts";
import { connectAs, nextMessage } from "./ws-client.ts";
import { findFreeTile } from "./tile-finder.ts";

// Moving and rotating an existing piece: free, excludes the piece's own
// current tiles from collision checks, and is guarded by a `version` field
// rather than a lock --- see docs/decisions/0002-furniture-editing-concurrency.md.
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

async function edit(
  visitorId: string,
  id: number,
  tileX: number,
  tileY: number,
  rotation: number,
  version: number,
) {
  const res = await fetch(new URL("/api/furniture/edit", baseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: cookieFor(visitorId) },
    body: JSON.stringify({ id, tileX, tileY, rotation, version, requestId: randomUUID() }),
  });
  return { status: res.status, body: await res.json() };
}

// The house is a small, fixed grid --- every test below stores whatever it
// placed once it's done asserting, so a single run of this file leaves the
// house exactly as full as it found it (see spec/README.md's note on the
// house eventually filling up otherwise).
async function store(visitorId: string, id: number, version: number) {
  await fetch(new URL("/api/furniture/store", baseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: cookieFor(visitorId) },
    body: JSON.stringify({ id, version, requestId: randomUUID() }),
  });
}

it("moves a placed piece to a free tile for free and bumps its version", async () => {
  const visitor = randomUUID();
  await feedUntil(visitor, FURNITURE_CATALOG.hay_bed.cost);
  const first = findFreeTile((await stateAs(visitor)).furniture, "hay_bed");
  const placed = await place(visitor, "hay_bed", first.tileX, first.tileY);
  const row = placed.body.furniture;
  expect(row.version).toBe(1);

  const stateAfterBuy = await stateAs(visitor);
  const second = findFreeTile(stateAfterBuy.furniture, "hay_bed");

  const { status, body } = await edit(visitor, row.id, second.tileX, second.tileY, 0, row.version);
  expect(status).toBe(200);
  expect(body.ok).toBe(true);
  expect(body.furniture.tile_x).toBe(second.tileX);
  expect(body.furniture.tile_y).toBe(second.tileY);
  expect(body.furniture.version).toBe(2);

  const after = await stateAs(visitor);
  expect(after.carePoints).toBe(stateAfterBuy.carePoints); // moving is free

  await store(visitor, body.furniture.id, body.furniture.version);
});

it("rejects a move onto an occupied tile and leaves the piece where it was", async () => {
  const visitor = randomUUID();
  await feedUntil(visitor, FURNITURE_CATALOG.hay_bed.cost + FURNITURE_CATALOG.tunnel.cost);

  const tileA = findFreeTile((await stateAs(visitor)).furniture, "hay_bed");
  const rowA = (await place(visitor, "hay_bed", tileA.tileX, tileA.tileY)).body.furniture;

  const tileB = findFreeTile((await stateAs(visitor)).furniture, "tunnel");
  const rowB = (await place(visitor, "tunnel", tileB.tileX, tileB.tileY)).body.furniture;

  // B's own origin tile --- whatever hay_bed's footprint covers from there,
  // it overlaps B's first cell at minimum.
  const { status, body } = await edit(visitor, rowA.id, rowB.tile_x, rowB.tile_y, 0, rowA.version);
  expect(status).toBe(409);
  expect(body.ok).toBe(false);

  const after = await stateAs(visitor);
  const stillA = after.furniture.find((f: { id: number }) => f.id === rowA.id);
  expect(stillA.tile_x).toBe(rowA.tile_x);
  expect(stillA.tile_y).toBe(rowA.tile_y);
  expect(stillA.version).toBe(rowA.version);

  await store(visitor, rowA.id, rowA.version);
  await store(visitor, rowB.id, rowB.version);
});

it("rotating the tunnel swaps its footprint to occupy the rotated tiles", async () => {
  const visitor = randomUUID();
  await feedUntil(visitor, FURNITURE_CATALOG.tunnel.cost);
  const tile = findFreeTile((await stateAs(visitor)).furniture, "tunnel");
  const row = (await place(visitor, "tunnel", tile.tileX, tile.tileY)).body.furniture;
  expect(row.width).toBe(FURNITURE_CATALOG.tunnel.width);
  expect(row.height).toBe(FURNITURE_CATALOG.tunnel.height);

  const { status, body } = await edit(visitor, row.id, row.tile_x, row.tile_y, 90, row.version);
  expect(status).toBe(200);
  expect(body.ok).toBe(true);
  expect(body.furniture.rotation).toBe(90);
  expect(body.furniture.width).toBe(FURNITURE_CATALOG.tunnel.height);
  expect(body.furniture.height).toBe(FURNITURE_CATALOG.tunnel.width);

  await store(visitor, body.furniture.id, body.furniture.version);
});

it("rejects an edit with a stale version and returns the current row unchanged", async () => {
  const visitor = randomUUID();
  await feedUntil(visitor, FURNITURE_CATALOG.hay_bed.cost);
  const tile = findFreeTile((await stateAs(visitor)).furniture, "hay_bed");
  const row = (await place(visitor, "hay_bed", tile.tileX, tile.tileY)).body.furniture;

  const otherTile = findFreeTile((await stateAs(visitor)).furniture, "hay_bed");
  const { status, body } = await edit(
    visitor,
    row.id,
    otherTile.tileX,
    otherTile.tileY,
    0,
    row.version + 1, // stale on purpose
  );
  expect(status).toBe(409);
  expect(body.ok).toBe(false);
  expect(body.current.id).toBe(row.id);
  expect(body.current.tile_x).toBe(row.tile_x);
  expect(body.current.tile_y).toBe(row.tile_y);
  expect(body.current.version).toBe(row.version);

  await store(visitor, row.id, row.version);
});

it("broadcasts both furniture-moved and furniture-rotated to another connected visitor", async () => {
  const visitorA = randomUUID();
  const visitorB = randomUUID();
  await feedUntil(visitorA, FURNITURE_CATALOG.hay_bed.cost);
  const tile = findFreeTile((await stateAs(visitorA)).furniture, "hay_bed");
  const row = (await place(visitorA, "hay_bed", tile.tileX, tile.tileY)).body.furniture;
  const target = findFreeTile((await stateAs(visitorA)).furniture, "hay_bed");

  const wsB = await connectAs(baseUrl, visitorB);
  try {
    const movedArrives = nextMessage(wsB, (msg) => msg.type === "furniture-moved");
    const rotatedArrives = nextMessage(wsB, (msg) => msg.type === "furniture-rotated");

    const { body } = await edit(visitorA, row.id, target.tileX, target.tileY, 90, row.version);
    expect(body.ok).toBe(true);

    const moved = await movedArrives; // rejects after 2s if it never arrives
    const rotated = await rotatedArrives;
    expect(moved.furniture.id).toBe(row.id);
    expect(rotated.furniture.id).toBe(row.id);

    await store(visitorA, moved.furniture.id, moved.furniture.version);
  } finally {
    wsB.close();
  }
});
