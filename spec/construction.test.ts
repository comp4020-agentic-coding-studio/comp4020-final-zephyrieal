import { expect, inject, it } from "vitest";
import { randomUUID } from "node:crypto";
import { connectAs, nextMessage } from "./ws-client.ts";

// The cooperative house-construction minigame: solo contribution, replay
// safety, rate limiting, the teamwork multiplier, a builder dropping out
// after 5 real seconds of inactivity, real-time sync, concurrent
// contributions, and completion + the one-time reward. See
// docs/decisions/0003-construction-concurrency.md.
//
// All of this lives in ONE file, in this exact order, on purpose: tests
// within a file run top-to-bottom, deterministically, but the order Vitest
// runs separate *files* in is not alphabetical (confirmed empirically ---
// don't rely on filename sort order across files for this kind of
// sequencing). The LAST test here drives the one shared project to
// completion, which is permanent (a finished house doesn't un-finish), so
// nothing above it in this file --- or in any file that runs after it ---
// can assume the project is still in_progress. Running `pnpm check` again
// locally without clearing data/sanctuary.db will find it already
// complete; delete the database for a clean slate, same as the existing
// furniture-grid note in spec/README.md.
//
// Active-builder tracking is real, shared, ambient state (that's the whole
// feature): a visitor from an earlier test can still be "active" (within
// the 5s window) when a later test's visitor contributes. Most assertions
// below are written relative to a measured baseline rather than hardcoded
// absolute counts, so they hold regardless of how much ambient activity
// nearby tests left behind.
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

it(
  "a second simultaneous builder raises the per-click rate, and dropping out after 5s lowers it again",
  async () => {
    const a = randomUUID();
    const b = randomUUID();

    const baseline = (await stateAs(a)).construction.activeBuilders;
    const respA1 = await contribute(a);
    expect(respA1.body.activeBuilders).toBe(baseline + 1);
    expect(respA1.body.unitsAwarded).toBe(unitsFor(baseline + 1));

    const respB1 = await contribute(b);
    expect(respB1.body.activeBuilders).toBe(baseline + 2);
    expect(respB1.body.unitsAwarded).toBe(unitsFor(baseline + 2));
    expect(respB1.body.unitsAwarded).toBeGreaterThanOrEqual(respA1.body.unitsAwarded); // cooperating is never worse

    // Real wall-clock wait --- no fake timers exist anywhere in this repo.
    // This also clears out whatever `baseline` was: by the time it elapses,
    // every contribution above (and anything from earlier tests) is more
    // than 5s old, so what follows can assert an absolute count again.
    await new Promise((resolve) => setTimeout(resolve, 5100));

    const respA2 = await contribute(a);
    expect(respA2.body.activeBuilders).toBe(1); // B (and the old baseline) aged out
    expect(respA2.body.unitsAwarded).toBe(100);
  },
  15000, // exceeds Vitest's default 5000ms per-test timeout, which the 5.1s wait alone would hit
);

it("broadcasts progress to another connected visitor", async () => {
  const visitor = randomUUID();
  const observer = randomUUID();

  const wsObserver = await connectAs(baseUrl, observer);
  try {
    const progressArrives = nextMessage(wsObserver, (msg) => msg.type === "construction-progress");
    const { body } = await contribute(visitor);
    expect(body.ok).toBe(true);

    const msg = await progressArrives; // rejects after 2s if it never arrives
    expect(msg.progressUnits).toBe(body.progressUnits);
    expect(msg.status).toBe(body.status);
  } finally {
    wsObserver.close();
  }
});

it("concurrent contributions from several visitors are all accounted for, with no lost updates", async () => {
  const visitors = Array.from({ length: 5 }, () => randomUUID());
  const before = (await stateAs(visitors[0])).construction;

  const results = await Promise.all(visitors.map((v) => contribute(v)));
  expect(results.every((r) => r.body.ok === true)).toBe(true);

  const awarded = results.reduce((sum, r) => sum + r.body.unitsAwarded, 0);
  const after = (await stateAs(visitors[0])).construction;
  expect(after.progressUnits).toBe(before.progressUnits + awarded); // every accepted click counted, none overwritten
});

it(
  "completes exactly once and pays the one-time cooperative reward to every eligible visitor",
  async () => {
    const a = randomUUID();
    const b = randomUUID();
    const balanceBeforeA = (await stateAs(a)).carePoints;
    const balanceBeforeB = (await stateAs(b)).carePoints;

    let completions = 0;
    let acceptedA = 0;
    let acceptedB = 0;
    let sawCooperativeMoment = false;
    let finished = false;

    for (let round = 0; round < 150 && !finished; round++) {
      const [resA, resB] = await Promise.all([contribute(a), contribute(b)]);
      for (const res of [resA, resB]) {
        if (!res.body.ok) continue;
        if (res.body.activeBuilders >= 2) sawCooperativeMoment = true;
        if (res.body.justCompleted) completions++;
        if (res.body.status === "completed") finished = true;
      }
      if (resA.body.ok) acceptedA++;
      if (resB.body.ok) acceptedB++;
      if (!finished) await new Promise((resolve) => setTimeout(resolve, 220)); // stay under 5 clicks/sec per visitor
    }

    const finalState = await stateAs(a);
    expect(finalState.construction.status).toBe("completed");
    expect(finalState.construction.progressUnits).toBe(10000); // clamped exactly at the target, never over
    expect(completions).toBe(1); // fires exactly once, even with both visitors still clicking
    expect(sawCooperativeMoment).toBe(true);
    expect(acceptedA).toBeGreaterThanOrEqual(5);
    expect(acceptedB).toBeGreaterThanOrEqual(5);

    const balanceAfterA = (await stateAs(a)).carePoints;
    const balanceAfterB = (await stateAs(b)).carePoints;
    expect(balanceAfterA).toBe(balanceBeforeA + 10); // the cooperative (not solo) reward
    expect(balanceAfterB).toBe(balanceBeforeB + 10);

    // Further contributions are rejected outright, not silently accepted.
    const after = await contribute(a);
    expect(after.status).toBe(409);
    expect(after.body.ok).toBe(false);
  },
  35000,
);
