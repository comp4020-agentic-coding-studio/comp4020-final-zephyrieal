# ADR 005: Visitor Identity and Permissions

## Status

Accepted

## Context

Every visitor is identified by an anonymous `visitor=<uuid>` cookie (no
accounts, no passwords, no login screen --- see `src/server/index.ts`'s own
framing and CLAUDE.md's ban on "mandatory accounts"). The cookie value was,
until this change, a plain string: the Express middleware in `index.ts` and
the WebSocket upgrade handler in `realtime.ts` each independently regex-
matched `visitor=([a-f0-9-]+)` out of the raw `Cookie` header and trusted
whatever matched, with no verification that the value was one the server
itself had issued.

That meant any client --- a browser console, a crafted HTTP request, a
tampered cookie jar --- could set `visitor=<any-uuid-shaped-string>` and the
server would treat it as that visitor's real, continuous identity: their
Care Points balance, their construction activity, their place in the
`connections` map for real-time delivery. This was a known, named limitation
before this change (see ADR 003's Costs section, which calls out that
"nothing stops one person from opening a second browser... and appearing as
a second 'distinct' builder") but had never been closed.

This ADR documents what state is individual versus shared, confirms the
permission model that already existed was correct given a trustworthy
identity, and describes the minimal change made to make that identity
trustworthy.

## What's individual, what's shared, and how it's enforced

**Individual**: a visitor's own Care Points balance
(`care_point_transactions`, summed by `visitor_id` in `getBalance`). Every
route that earns or spends points (`/api/feed`, `placeFurniture`, the
construction completion reward) calls `earnCarePoints`/`getBalance` with
`req.visitorId` --- the server-derived identity from the request's own
cookie, never a client-supplied field in the request body. No route accepts
a body field naming an amount of points to award; `/api/feed` always awards
exactly `FEED_REWARD`, regardless of what else a request body contains (see
`spec/identity-security.test.ts`'s regression test posting extra
`balance`/`amount`/`points` fields and confirming they're ignored).

**Shared, no ownership**: flowers, furniture, and construction progress.
Per CLAUDE.md's "Nobody owns anything" --- "Visitors leave traces; they
don't claim territory" --- any visitor may plant a flower, place furniture
they can afford, move or rotate *any* placed piece, store *any* placed
piece, retrieve *any* stored piece for free, and contribute to *any* known
construction project. `editFurniture`, `storeFurniture`, and
`retrieveFurniture` in `src/server/furniture.ts` don't even take a
`visitorId` parameter --- there is no per-piece ownership check anywhere in
this codebase, by design, and this ADR does not add one. `placed_by` and
`planted_by` columns are provenance only (who to credit in a trace), never
an access-control gate.

This means the permission model for *shared* state was already correct
before this change: "anyone may act, the server validates game rules (can
you afford it, does it fit, is the version current), and attributes the
result." The only gap was that attribution itself --- "who is 'anyone' in
this specific request" --- was forgeable.

## Options Considered

### Option A: Leave the Cookie Unsigned, Add Ownership Checks Instead

Gate furniture edits/stores/retrievals by `placed_by`, so only whoever
placed a piece could move it.

Rejected outright: this contradicts CLAUDE.md's explicit "Nobody owns
anything" rule and the project's own stated definition of good ("Visitors
can leave a trace without needing to claim part of the world as theirs").
It would also solve a different problem than the one asked --- the spec asks
for identity to be verifiable, not for shared objects to become owned.

### Option B: A Full Account System

Real accounts with login, so a visitor's identity is tied to credentials
only they know.

Rejected: "mandatory accounts" is explicitly banned in CLAUDE.md's "Never
add without stopping to discuss it first" list. This would also be a much
larger change than "minimal," adding a login flow, password storage (or a
third-party auth dependency), and a very different visitor experience than
the anonymous, walk-up-and-play sanctuary the README describes.

### Option C: A Server-Side Session Store

Mint an opaque session token, store the real visitor id server-side (in
memory or a new table) keyed by that token, and have the cookie carry only
the meaningless token.

Rejected: this adds a second source of truth (the session store) that has
to be kept consistent with the database and would need its own persistence
story to survive a restart (CLAUDE.md's Persistence section: "If an
interaction is presented to the visitor as permanent, it must actually
survive... an app restart"). An HMAC-signed id gets the same tamper-evidence
with no additional state to persist at all --- the id is still visible in
the cookie (this was never trying to hide it, only to stop it being forged),
just no longer forgeable without the server's own secret.

### Option D: HMAC-Sign the Existing Anonymous Cookie

Keep the cookie anonymous and stateless; make it tamper-evident.

## Decision

Choose Option D.

New module `src/server/identity.ts` is the one place both `index.ts` and
`realtime.ts` now verify a visitor cookie (previously each had its own,
independent, unsigned regex). A cookie is now `visitor=<uuid>.<signature>`,
where `<signature>` is `HMAC-SHA256(uuid, SESSION_SECRET)` encoded as
base64url. `verifyVisitorCookie()` returns the id only if the signature
matches via a timing-safe comparison (`node:crypto`'s `timingSafeEqual`);
any cookie that's missing, malformed, or has a wrong/tampered/foreign-secret
signature is treated identically to having no cookie at all --- the server
mints a fresh, properly signed identity rather than ever adopting a claimed
value it can't verify.

`SESSION_SECRET` is read from an environment variable, set as a Fly secret
in production (`flyctl secrets set`, never committed --- `fly.toml`'s `[env]`
block is for non-secret config only) so it survives restarts and redeploys
consistently, per CLAUDE.md's Persistence principle. A fixed, publicly-known
fallback is used when the variable is unset (local dev, the test suite)
specifically so `pnpm dev`/`pnpm check` need no extra setup --- that fallback
is not meant to resist anyone who can read this file, only to make the
*production* identity tamper-evident.

`node:crypto` (built into Node, no new dependency) provides `createHmac`,
`timingSafeEqual`, and the existing `randomUUID`. CLAUDE.md's Scope
principle ("Don't add a dependency unless it clearly removes more
complexity than it adds") rules out `cookie-signature`/`express-session`
for a need the standard library already covers completely.

`realtime.ts`'s WebSocket upgrade handler now calls the same
`verifyVisitorCookie`, deleting its own previously-separate `parseVisitorId`
regex. A WebSocket upgrade can't itself set a cookie, so a missing or
forged one at that point means the page's own HTTP load hasn't happened yet
or the cookie was tampered with between the page load and the socket
connecting --- the existing "reject the upgrade" behavior is unchanged,
it's just now backed by real verification instead of a second unverified
regex that could silently drift out of sync with the HTTP side.

## Rollout

Every visitor's current (unsigned) cookie fails verification the moment
this deploys, and they're silently issued a new, properly signed identity
on their next request --- which means every visitor's Care Points balance
resets to zero. This was a deliberate choice, confirmed rather than
discovered after the fact: grandfathering old unsigned cookies in as valid
for a transition period would simply reopen the exact forgery window this
change exists to close, for as long as the grace period lasted. A one-time
reset is the honest cost of actually closing the gap, not a side effect to
work around.

## Limitations

This does not add any guarantee stronger than "this specific browser's
cookie wasn't hand-edited or forged by a script that doesn't know
`SESSION_SECRET`." Specifically, it does **not** protect against:

- A leaked or guessed `SESSION_SECRET` --- whoever holds it can forge any
  identity. This is a shared-secret HMAC, not a cryptographic proof tied to
  the visitor's browser or device.
- One person opening a second browser, an incognito window, or clearing
  cookies to appear as a second, distinct "visitor." Each of those still
  gets its own legitimately-signed identity --- the system has no way to
  know, and isn't trying to know, whether two signed identities belong to
  the same human. This exact limitation was already named in ADR 003's
  Costs section and remains true; this change does not solve it, only the
  narrower problem of a client claiming an identity it was never issued.
- XSS or any other means of reading a visitor's own cookie out of their own
  browser --- if an attacker can execute script in a visitor's page, they
  already have everything that visitor's cookie grants.

The identity model is, and remains, anonymous: the server never learns who
a person is, only that a given signed id is the same one it issued earlier.

## Verification

Covered in `spec/identity-security.test.ts` (new): two fresh requests are
minted distinct identities; a correctly-signed cookie's id round-trips
across requests with no re-mint (the "returning visitor" guarantee still
holds); an unsigned legacy-format cookie, a tampered-signature cookie, and a
cookie signed with the wrong secret are each rejected and replaced with a
fresh identity rather than trusted; a client cannot award itself arbitrary
Care Points via extra request-body fields. The full existing `spec/*.test.ts`
suite (34 tests across 11 files, all of which authenticate "visitor A"/
"visitor B" via a cookie) was run against this change and passes unchanged
--- `spec/identity.ts` (new, test-only) signs cookies the same way the
server does, using the same `SESSION_SECRET` fallback, so every existing
test's `cookieFor`/`connectAs` helper needed only to import that shared
signer instead of building its own unsigned header.

Log correctness (the crit's "can narrate who did what from the logs alone"
requirement) is verified manually, not asserted in `spec/*.test.ts` ---
nothing in this suite today captures server stdout, and this harness is
HTTP+WS against a long-lived instance with no existing hook for it (see
`spec/MANUAL.md`'s own precedent for deferring what this harness
structurally can't assert to a recorded manual check). See
`spec/MANUAL.md`'s new "Two-visitor crit walkthrough" scenario and
PROCESS.md's recorded result.
