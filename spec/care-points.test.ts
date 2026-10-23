import { interactionFetch as fetch } from "./nearby-client.ts";
import { expect, inject, it } from "vitest";
import { randomUUID } from "node:crypto";
import { FEED_REWARD } from "../src/server/furniture.ts";
import { cookieFor } from "./identity.ts";

// Scenario 1: individual Care Points. Each visitor's balance is attributed
// to the same anonymous `visitor=<uuid>.<signature>` cookie flowers/feeding
// already use (see spec/identity.ts --- the signature is what makes this a
// cookie the server's identity middleware actually accepts as that visitor,
// not just any string) --- there's no auto cookie jar on Node's fetch, so a
// fixed, explicit Cookie header per call is what makes "visitor A" and
// "visitor B" persist across requests in this test (see spec/flowers.test.ts's
// convention of a *missing* cookie standing in for "a different visitor";
// here we pin one on purpose instead, to check isolation rather than
// statelessness).
const baseUrl = inject("baseUrl");

async function stateFor(visitorId: string) {
  return fetch(new URL("/api/state", baseUrl), { headers: { cookie: cookieFor(visitorId) } }).then(
    (r) => r.json(),
  );
}

it("earns Care Points only for the visitor who fed, and keeps the balance after reconnecting", async () => {
  const visitorA = randomUUID();
  const visitorB = randomUUID();

  const beforeA = await stateFor(visitorA);
  const beforeB = await stateFor(visitorB);

  const fed = await fetch(new URL("/api/feed", baseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: cookieFor(visitorA) },
    body: JSON.stringify({ requestId: randomUUID() }),
  }).then((r) => r.json());

  expect(fed.balance).toBe(beforeA.carePoints + FEED_REWARD);

  // "After reconnecting" --- a fresh request, same cookie, no session state
  // carried in memory anywhere but the server's ledger.
  const afterA = await stateFor(visitorA);
  expect(afterA.carePoints).toBe(fed.balance);

  const afterB = await stateFor(visitorB);
  expect(afterB.carePoints).toBe(beforeB.carePoints);
});
