import { expect, inject, it } from "vitest";

// Planting a flower is a trace on the *sanctuary*, not on any one visitor's
// session --- so, like trace.test.ts, this checks it over HTTP and re-reads
// with no cookie to stand in for a different (or forgetful) visitor.
const baseUrl = inject("baseUrl");

it("remembers a planted flower after the visitor leaves and returns", async () => {
  const before = await fetch(new URL("/api/state", baseUrl)).then((r) => r.json());
  const countBefore = before.flowers.length;

  const planted = await fetch(new URL("/api/plant", baseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ x: 42, y: 17 }),
  }).then((r) => r.json());

  expect(planted.flowers.length).toBe(countBefore + 1);

  const after = await fetch(new URL("/api/state", baseUrl)).then((r) => r.json());
  expect(after.flowers.length).toBe(countBefore + 1);
  expect(after.flowers.at(-1)).toMatchObject({ x: 42, y: 17 });
});

// The server owns what actually gets stored --- it must not trust whatever
// position the client happens to send (CLAUDE.md: "the server is
// authoritative"). Coordinates outside the meadow get clamped, not rejected
// outright and not stored as-is.
it("clamps an out-of-range position instead of trusting the client", async () => {
  const planted = await fetch(new URL("/api/plant", baseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ x: 9001, y: -50 }),
  }).then((r) => r.json());

  const flower = planted.flowers.at(-1);
  expect(flower.x).toBeLessThanOrEqual(100);
  expect(flower.y).toBeGreaterThanOrEqual(0);
});
