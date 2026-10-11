import { expect, inject, it } from "vitest";
import { randomUUID } from "node:crypto";

// Solo contribution, replay safety, rate limiting, and "same visitor, two
// connections counts once" --- the parts of the cooperative construction
// minigame that don't need more than one real visitor identity at a time.
// See docs/decisions/0003-construction-concurrency.md. The multiplier,
// inactivity, real-time sync, concurrency and completion scenarios live in
// spec/construction-cooperation.test.ts, which (deliberately) runs after
// this file alphabetically --- that file's last test completes the one
// shared project for good, so nothing in *this* file can run after it.
//
// Active-builder tracking is intentionally real, shared, ambient state
// (that's the whole feature): a visitor from an *earlier* test in this same
// fast-running file can still be "active" (within the 5s window) when a
// *later* test's visitor contributes. Assertions below are written relative
// to a measured baseline rather than hardcoded absolute counts, so they hold
// regardless of how much ambient activity nearby tests left behind.
const baseUrl = inject("baseUrl");

const UNITS_BY_ACTIVE_BUILDERS = [0, 100, 150, 200, 250]; // mirrors construction.ts's own table
function unitsFor(activeBuilders: number): number {
  return UNITS_BY_ACTIVE_BUILDERS[Math.min(Math.max(activeBuilders, 1), 4)];
}

function cookieFor(visitorId: string) {
  return `visitor=${visitorId}`;
}

async function contribute(visitorId: string, requestId = randomUUID()) {
  const res = await fetch(new URL("/api/construction/contribute", baseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: cookieFor(visitorId) },
    body: JSON.stringify({ requestId }),
  });
  return { status: res.status, body: await res.json() };
}

async function stateAs(visitorId: string) {
  return fetch(new URL("/api/state", baseUrl), { headers: { cookie: cookieFor(visitorId) } }).then(
    (r) => r.json(),
  );
}

it("a contribution awards exactly the construction points its own reported active-builder count implies", async () => {
  const visitor = randomUUID();
  const before = (await stateAs(visitor)).construction;

  const { status, body } = await contribute(visitor);
  expect(status).toBe(200);
  expect(body.ok).toBe(true);
  expect(body.unitsAwarded).toBe(unitsFor(body.activeBuilders));
  expect(body.progressUnits).toBe(before.progressUnits + body.unitsAwarded);

  const after = (await stateAs(visitor)).construction;
  expect(after.progressUnits).toBe(before.progressUnits + body.unitsAwarded);
});

it("replaying the same request id is a no-op, not a double award", async () => {
  const visitor = randomUUID();
  const requestId = randomUUID();

  const first = await contribute(visitor, requestId);
  expect(first.body.ok).toBe(true);

  const second = await contribute(visitor, requestId);
  expect(second.body.ok).toBe(true);
  expect(second.body.replay).toBe(true);
  expect(second.body.progressUnits).toBe(first.body.progressUnits); // not awarded twice
});

it("rejects more than five contributions per second from the same visitor, without awarding progress for the rejected ones", async () => {
  const visitor = randomUUID();
  const before = (await stateAs(visitor)).construction;

  const attempts = await Promise.all(Array.from({ length: 7 }, () => contribute(visitor)));
  const accepted = attempts.filter((a) => a.body.ok === true);
  const rejected = attempts.filter((a) => a.body.ok === false);

  expect(accepted.length).toBe(5);
  expect(rejected.length).toBe(2);
  for (const r of rejected) expect(r.status).toBe(409);

  // Progress increased by exactly the sum of what the accepted responses
  // themselves say they were awarded --- robust to whatever multiplier tier
  // was actually in effect (see the file-level note on ambient activity).
  const awarded = accepted.reduce((sum, a) => sum + a.body.unitsAwarded, 0);
  const after = (await stateAs(visitor)).construction;
  expect(after.progressUnits).toBe(before.progressUnits + awarded);
});

it("two connections authenticated as the same visitor count as one active builder, not two", async () => {
  const visitor = randomUUID();
  const baselineActive = (await stateAs(visitor)).construction.activeBuilders; // a read never mutates activity

  // Two "tabs" for the same, brand-new visitor, firing together.
  const [a, b] = await Promise.all([contribute(visitor), contribute(visitor)]);
  expect(a.body.ok).toBe(true);
  expect(b.body.ok).toBe(true);
  // This one visitor adds exactly 1 to whoever else was already active ---
  // never 2, since activity is tracked per visitorId, not per request.
  expect(a.body.activeBuilders).toBe(baselineActive + 1);
  expect(b.body.activeBuilders).toBe(baselineActive + 1);
});
