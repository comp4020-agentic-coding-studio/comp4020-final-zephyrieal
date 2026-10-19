import { expect, inject, it } from "vitest";
import { randomUUID } from "node:crypto";
import { FURNITURE_CATALOG } from "../src/server/furniture.ts";
import { findFreeTile } from "./tile-finder.ts";
import { cookieFor } from "./identity.ts";

// Scenario 4: two visitors attempt overlapping furniture at the same
// moment. The shared target tile is found dynamically (see tile-finder.ts)
// so this is safe to rerun against an already-populated house.
const baseUrl = inject("baseUrl");

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

it("lets at most one of two simultaneous overlapping placements succeed", async () => {
  const visitorA = randomUUID();
  const visitorB = randomUUID();
  const cost = FURNITURE_CATALOG.tunnel.cost;
  const [fedA, fedB] = await Promise.all([feedUntil(visitorA, cost), feedUntil(visitorB, cost)]);
  const fedBalance = { [visitorA]: fedA, [visitorB]: fedB } as Record<string, number>;

  const existing = await fetch(new URL("/api/state", baseUrl))
    .then((r) => r.json())
    .then((s) => s.furniture);
  const { tileX, tileY } = findFreeTile(existing, "tunnel");

  // Both aim at the exact same tile, fired together so their HTTP requests
  // race to reach the server.
  const [resA, resB] = await Promise.all([
    fetch(new URL("/api/furniture/place", baseUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: cookieFor(visitorA) },
      body: JSON.stringify({ kind: "tunnel", tileX, tileY, requestId: randomUUID() }),
    }),
    fetch(new URL("/api/furniture/place", baseUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: cookieFor(visitorB) },
      body: JSON.stringify({ kind: "tunnel", tileX, tileY, requestId: randomUUID() }),
    }),
  ]);
  const [bodyA, bodyB] = await Promise.all([resA.json(), resB.json()]);

  const succeeded = [bodyA, bodyB].filter((b) => b.ok === true);
  const rejected = [bodyA, bodyB].filter((b) => b.ok === false);
  expect(succeeded.length).toBe(1);
  expect(rejected.length).toBe(1);

  // Both visitors converge on the same final layout.
  const [stateA, stateB] = await Promise.all([
    fetch(new URL("/api/state", baseUrl), { headers: { cookie: cookieFor(visitorA) } }).then((r) => r.json()),
    fetch(new URL("/api/state", baseUrl), { headers: { cookie: cookieFor(visitorB) } }).then((r) => r.json()),
  ]);
  const inRegion = (row: { tile_x: number; tile_y: number }) => row.tile_x === tileX && row.tile_y === tileY;
  expect(stateA.furniture.filter(inRegion).length).toBe(1);
  expect(stateB.furniture.filter(inRegion).length).toBe(1);

  // Only the winner paid; the loser's balance is untouched.
  const winnerVisitor = succeeded[0] === bodyA ? visitorA : visitorB;
  const loserVisitor = winnerVisitor === visitorA ? visitorB : visitorA;
  const [winnerState, loserState] = await Promise.all([
    fetch(new URL("/api/state", baseUrl), { headers: { cookie: cookieFor(winnerVisitor) } }).then((r) => r.json()),
    fetch(new URL("/api/state", baseUrl), { headers: { cookie: cookieFor(loserVisitor) } }).then((r) => r.json()),
  ]);
  expect(winnerState.carePoints).toBe(fedBalance[winnerVisitor] - cost);
  expect(loserState.carePoints).toBe(fedBalance[loserVisitor]); // never spent
});
