import { interactionFetch as fetch } from "./nearby-client.ts";
import { createHmac, randomUUID } from "node:crypto";
import { expect, inject, it } from "vitest";
import { FEED_REWARD } from "../src/server/furniture.ts";
import { cookieFor } from "./identity.ts";

// Before this, the visitor cookie was a plain, unsigned `visitor=<uuid>` ---
// any client could set it to any UUID-shaped string and the server trusted
// it outright as that visitor's identity, including their Care Points
// balance (see docs/decisions/0005-visitor-identity-and-permissions.md).
// These tests cover what that change is actually supposed to guarantee:
// distinct identities, rejection of a forged/legacy cookie, and that a
// correctly-signed cookie still behaves like "the same returning visitor"
// exactly as before.
const baseUrl = inject("baseUrl");

function parseSetCookieVisitor(setCookieHeader: string | null): string | undefined {
  return setCookieHeader?.match(/visitor=([^;]+)/)?.[1];
}

it("two fresh visitors (no cookie) are minted distinct identities", async () => {
  const resA = await fetch(new URL("/api/state", baseUrl));
  const resB = await fetch(new URL("/api/state", baseUrl));

  const cookieA = parseSetCookieVisitor(resA.headers.get("set-cookie"));
  const cookieB = parseSetCookieVisitor(resB.headers.get("set-cookie"));

  expect(cookieA).toBeTruthy();
  expect(cookieB).toBeTruthy();
  expect(cookieA).not.toBe(cookieB);
});

it("a correctly-signed cookie's identity round-trips across requests with no re-mint", async () => {
  const visitorId = randomUUID();
  const signed = cookieFor(visitorId);

  const res = await fetch(new URL("/api/state", baseUrl), { headers: { cookie: signed } });

  // No Set-Cookie means the server accepted the identity as-is, rather than
  // deciding it couldn't be trusted and minting a replacement --- this is
  // the "a returning visitor keeps their identity" guarantee the signing
  // change must not break.
  expect(res.headers.get("set-cookie")).toBeNull();
});

it("an unsigned, legacy-format cookie is rejected --- the claimed id is never trusted", async () => {
  const claimedId = randomUUID();

  const res = await fetch(new URL("/api/state", baseUrl), {
    headers: { cookie: `visitor=${claimedId}` }, // today's pre-signing format, no signature
  });

  const mintedId = parseSetCookieVisitor(res.headers.get("set-cookie"));
  expect(mintedId).toBeTruthy();
  // The server minted a *different* identity rather than adopting the one
  // the client claimed --- proving the bare id alone was never sufficient.
  expect(mintedId?.startsWith(claimedId)).toBe(false);
});

it("a tampered signature is rejected the same way as a missing one", async () => {
  const visitorId = randomUUID();
  const validCookie = cookieFor(visitorId);
  const tampered = validCookie.slice(0, -1) + (validCookie.endsWith("A") ? "B" : "A");

  const res = await fetch(new URL("/api/state", baseUrl), { headers: { cookie: tampered } });

  const mintedId = parseSetCookieVisitor(res.headers.get("set-cookie"));
  expect(mintedId).toBeTruthy();
  expect(mintedId).not.toBe(visitorId);
});

it("clients cannot award themselves arbitrary Care Points via extra request fields", async () => {
  const visitorId = randomUUID();
  const before = await fetch(new URL("/api/state", baseUrl), {
    headers: { cookie: cookieFor(visitorId) },
  }).then((r) => r.json());

  // A client that tries to smuggle its own point amount in alongside the
  // one field /api/feed actually reads (requestId) --- the server must
  // ignore it and award exactly FEED_REWARD, never the attempted value.
  const fed = await fetch(new URL("/api/feed", baseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: cookieFor(visitorId) },
    body: JSON.stringify({ requestId: randomUUID(), balance: 999999, amount: 999999, points: 999999 }),
  }).then((r) => r.json());

  expect(fed.balance).toBe(before.carePoints + FEED_REWARD);
});

it("a signature computed with the wrong secret is rejected", async () => {
  const visitorId = randomUUID();
  const wrongSecretSignature = createHmac("sha256", "not-the-real-secret").update(visitorId).digest("base64url");
  const forged = `visitor=${visitorId}.${wrongSecretSignature}`;

  const res = await fetch(new URL("/api/state", baseUrl), { headers: { cookie: forged } });

  const mintedId = parseSetCookieVisitor(res.headers.get("set-cookie"));
  expect(mintedId).toBeTruthy();
  expect(mintedId).not.toBe(visitorId);
});
