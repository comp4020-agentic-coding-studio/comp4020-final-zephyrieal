import { expect, inject, it } from "vitest";

// The crit 8 spec's actual bar: "a stranger can visit, do the core thing, and
// find their trace still there when they come back." This checks exactly
// that, over HTTP against the running app --- it holds for any stack behind
// it, not just this one.
const baseUrl = inject("baseUrl");

it("remembers a feeding after the visitor leaves and returns", async () => {
  const before = await fetch(new URL("/api/state", baseUrl)).then((r) => r.json());
  const feedCountBefore = before.guineaPig.feed_count;

  await fetch(new URL("/api/feed", baseUrl), { method: "POST" });

  // A fresh fetch with no cookie: a different visitor, or the same one
  // without a browser remembering anything --- the trace has to be the
  // sanctuary's, not the visitor's own session.
  const after = await fetch(new URL("/api/state", baseUrl)).then((r) => r.json());

  expect(after.guineaPig.feed_count).toBe(feedCountBefore + 1);
  expect(after.guineaPig.last_fed_at).not.toBeNull();
});
