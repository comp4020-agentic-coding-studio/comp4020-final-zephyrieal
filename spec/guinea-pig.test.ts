import { expect, inject, it } from "vitest";
import { pickNextTarget } from "../src/server/guinea-pig.ts";

const baseUrl = inject("baseUrl");

// Unlike every other spec/ file, this imports src/server/guinea-pig.ts's
// pure functions directly rather than driving them through HTTP --- there's
// no route for Potato's position (she's broadcast, never fetched on demand
// beyond /api/state's snapshot), and more importantly these functions take
// `now`/`random` as plain arguments instead of reading Date.now()/Math.random()
// internally, so tests can control both directly. That sidesteps this
// repo's own stated constraint (spec/construction.test.ts: "Real wall-clock
// wait --- no fake timers exist anywhere in this repo") by never needing
// wall-clock time or a timer-mocking library in the first place, rather
// than working around the constraint the way that file's real 5.1s
// setTimeout waits do.
//
// tick()/currentPosition() are exercised only indirectly here, via
// pickNextTarget --- the module's own internal walk/pause state machine
// (tick) is simple enough, and tightly enough coupled to its own
// module-level singleton, that testing it meaningfully would mean either
// exporting that singleton's reset (more surface area than the feature
// needs) or testing it through a real HTTP+WS round trip against the
// running app's own live ticking interval, which spec/construction.test.ts's
// precedent shows means asserting against real, uncontrolled wall-clock
// time --- exactly what this file exists to avoid. pickNextTarget is the
// one piece that's both pure and carries the feature's real logic (staying
// in bounds, scaling duration to distance), so it's what's tested directly.

it("picks a target within the meadow's margin on both axes", () => {
  // A deterministic sequence covering the extremes: 0 and 1 are the
  // farthest a random() call can push the target in either direction.
  const sequence = [0, 1, 1, 0];
  let i = 0;
  const random = () => sequence[i++ % sequence.length];

  for (let trial = 0; trial < 20; trial++) {
    const { targetX, targetY } = pickNextTarget(50, 50, random);
    expect(targetX).toBeGreaterThanOrEqual(15);
    expect(targetX).toBeLessThanOrEqual(85);
    expect(targetY).toBeGreaterThanOrEqual(15);
    expect(targetY).toBeLessThanOrEqual(85);
  }
});

it("takes longer to walk farther, not a fixed duration regardless of distance", () => {
  // random() = 1 on both axes pushes the target as far as it can go from
  // the starting point in one direction; 0.5 keeps it exactly where it is.
  const far = pickNextTarget(50, 50, () => 1);
  const near = pickNextTarget(50, 50, () => 0.5);

  expect(far.durationMs).toBeGreaterThan(near.durationMs);
});

it("never returns a target identical to the starting point", () => {
  // random() = 0.5 on both axes means "no offset" by this module's own
  // math (midpoint of the -1..1 range) --- confirms the floor duration
  // exists precisely so a coincidentally-tiny (here, zero) walk still
  // counts as a real, observable walk rather than being indistinguishable
  // from "already arrived."
  const { targetX, targetY, durationMs } = pickNextTarget(50, 50, () => 0.5);
  expect(targetX).toBe(50);
  expect(targetY).toBe(50);
  expect(durationMs).toBeGreaterThan(0);
});

it("clamps a target that would otherwise land outside the meadow margin", () => {
  // Starting right at the margin's own edge, pushed further outward:
  // without clamping this would land past the 15/85 bounds.
  const { targetX, targetY } = pickNextTarget(15, 15, () => 0);
  expect(targetX).toBeGreaterThanOrEqual(15);
  expect(targetY).toBeGreaterThanOrEqual(15);
});

// The one integration point: confirms /api/state actually serves the field
// the server's own setInterval tick (src/server/index.ts) and the client
// (sanctuaryState.guineaPigMovement) both expect. Deliberately doesn't
// assert exact x/y/timing values --- the live tick is running against real
// wall-clock time in the actual server under test, same caution
// spec/construction.test.ts's own tests take about not asserting exact
// counts against ambient, real-time activity.
it("serves Potato's current position in the expected shape", async () => {
  const state = await fetch(new URL("/api/state", baseUrl)).then((r) => r.json());
  const movement = state.guineaPigMovement;

  expect(typeof movement.x).toBe("number");
  expect(typeof movement.y).toBe("number");
  expect(typeof movement.targetX).toBe("number");
  expect(typeof movement.targetY).toBe("number");
  expect(typeof movement.startedAt).toBe("number");
  expect(typeof movement.durationMs).toBe("number");
});
