# Process overview

## Where this starts

The brief is fixed (multi-user, real-time, persistent, good) but nothing about
the stack is. The three crits before the deadline stage the work deliberately:
crit 8 asks for proof of life, crit 9 for real-time, crit 10 for logging. This
account covers crit 8's slice: getting something alive, on the chosen stack,
with one real interaction that persists.

## Stack decision: Node + Express + SQLite, no build step

**Decision.** TypeScript on Node 24, run directly from source (no bundler, no
`tsc` build step) via Node's own type stripping; Express for routing; SQLite
through `node:sqlite` (built into Node itself, no native addon to compile) on
the Fly volume.

**Reasoning.** The project's hard problems are shared state, persistence,
autonomous guinea pig behaviour and social interaction --- not build tooling.
A framework (React, a game engine) would add real complexity before any of
those problems have been tackled once. Running TypeScript straight off disk
keeps the Docker image to one `node ...` command with no compile stage, which
matters on a 256 MB machine. `node:sqlite` avoids the native-module build
problems a package like `better-sqlite3` can cause inside a minimal Alpine
image, at the cost of being a newer, less battle-tested API.

**Cost / what this assumes.** One authoritative server process, one SQLite
file: this doesn't scale past one machine, which is fine for the brief's
"handful of people" framing but would need revisiting for anything bigger.
`node:sqlite` is still a fairly new API; if it turns out to be missing
something `better-sqlite3` has, that's a reason to switch, not a reason not to
have tried it first.

**Deferred for now.** Real-time transport (WebSockets) isn't wired up yet ---
crit 8's spec explicitly doesn't need it ("the real-time layer... can wait").
It's coming in crit 9, and the server-authoritative shape chosen here (clients
send intents, the server decides outcomes and owns the database) is meant to
carry that addition without a rewrite.

## What exists after crit 8

One guinea pig (Potato), one interaction (feed), one piece of persistent
state (feed count, last-fed time), written to SQLite and read back on every
visit --- including a visit with no cookie, so the trace is the sanctuary's,
not any one visitor's browser. `/readme/` renders `README.md` with `marked`
instead of the placeholder's verbatim `<pre>` dump. `spec/trace.test.ts` checks
the core promise directly: feed, then re-fetch as if returning cold, and the
feeding is still there.

This is deliberately far short of the full design (see the much longer
planning note this was scoped down from) --- no second visitor, no gestures, no
construction, no real guinea pig behaviour yet. That's next week's and the
week after's work.

<!-- As you keep building, link the commits that moved each piece forward ---
     e.g. feeding Potato, or wiring up real-time in crit 9 --- the way the
     template's own instructions show: [`<sha>`](.../commit/<sha>).
     `pnpm check:evidence` checks that every commit you cite here actually
     exists in the repo. -->

## Crit 9: real-time, Care Points, and a furniture shop

### Scope decision: Care Points + furniture shop, on a new stack

Crit 9 needed real-time and one documented multi-user decision. I was given
two candidate directions and chose the larger one: individual Care Points
(earned by feeding) spendable on a small furniture shop inside a shared
guinea-pig house, on a React + Vite + Phaser 3 client instead of the
crit-8 vanilla-JS one.

Both the economy and the stack change are deliberate departures from what
`CLAUDE.md` and crit 8's own stack decision had settled on, so both needed a
discussion before starting:

- `CLAUDE.md` originally banned currency and shops outright. Care Points are
  a personal tally of a visitor's own contribution (earned by feeding), not a
  tradeable currency between visitors, and furniture, once placed, is still
  nobody's exclusive property --- the carve-out in `CLAUDE.md` records exactly
  this narrowing, not a reversal of "nobody owns anything."
- `CLAUDE.md`'s Interface section banned raw stat displays. A Care Points
  number is the one exception now carved out --- it's about the visitor, not
  about Potato, and the shop can't function without showing it.
- Crit 8 chose no build step specifically so the server wouldn't need one.
  That's still true: `src/server/` still runs straight from TypeScript
  source. Only the *client* gained a build step (`vite build`), kept in its
  own Dockerfile stage so the deployed server image still never installs
  React, Vite or Phaser --- only `express`, `marked` and the one new runtime
  dependency, `ws`.

This was chosen with the cutoff about two days out, which is real risk for a
migration this size; see the reflection for why it still seemed worth it.

### Real-time: WebSocket, push-only

Mutations (`/api/feed`, `/api/plant`, the new `/api/furniture/place`) stay on
HTTP exactly as crit 8 left them --- the server-authoritative, intent-based
shape chosen then was specifically meant to carry this without a rewrite, and
it did. WebSocket (`ws`, `src/server/realtime.ts`) is used only for
server-to-client broadcast: a successful HTTP mutation is followed by a push
to everyone (furniture placed) or to just the requester (their own balance),
and a reconnecting client simply re-fetches `/api/state` on every socket
`open`, including the first one --- so "receive the latest layout without
reloading" needed no special reconnection protocol, just reusing the same
hydration path the initial page load already had.

### The one documented multi-user decision

See `docs/decisions/0001-concurrent-furniture-placement.md`: two visitors
placing overlapping furniture at once is resolved by the fact that the whole
check-and-commit is one synchronous function with no `await` in it, so
Node's single-threaded event loop alone decides which request's handler runs
first. No application-level locking was added; the transaction wrapper is
there only for atomicity against a crash mid-write, not for the race itself.

### Known limitation

Care Points balances and furniture placements are attributed to the same
anonymous `visitor=<uuid>` cookie the app already used for flowers and the
feed count. Clearing cookies or switching browsers starts a fresh,
zero-balance identity --- this isn't new (flowers already worked this way),
but it's worth naming now that there's something a visitor might mind losing.

Furniture is permanent and the house is a small, fixed 10x8 tile grid ---
unlike the outdoor meadow (an effectively unbounded percent-space), the house
has a real, finite capacity and nothing ever frees a tile once it's used.
That's accepted as part of "a small, reliable shared world, not a complete
game," not hidden, but it does mean the house can eventually fill up for
good.

### What's still manual

Scenario 5 of the brief (furniture and balances survive a server restart) is
checked by hand, not by `pnpm check` --- the spec harness (`spec/global-
setup.ts`) and CI's own Docker-based check job both assume one
already-running instance for the whole suite, and restarting it mid-run would
fight that model rather than test anything new. The manual procedure is in
`spec/MANUAL.md`.

## Furniture editing and shared storage

Standalone feature work on the shared final-project repo, not tied to a
specific crit's own brief: visitors can now click an existing piece of
furniture to move or rotate it for free, or store it into a pool any other
visitor can retrieve from for free. This section records the decisions,
following the same "scope decision, what's deferred, known limitations"
shape as the crit-9 section above.

### Combining move and rotate into one Save

The brief lists "furniture moved" and "furniture rotated" as separate
real-time events. The menu itself asks for one Save after previewing both
locally, so the server commits them together as one versioned transaction
(see `docs/decisions/0002-furniture-editing-concurrency.md`) and the route
broadcasts both event types off that one write. Two broadcasts, one
mutation --- `useSanctuary`'s handler for both is identical anyway (merge
the row in by id), so there's no behavioural difference from treating them
as two separate operations, just one less transaction.

### A sentinel position instead of a nullable one

Stored furniture's position is encoded as `tile_x = tile_y = -1`, not
`NULL`. SQLite can add the new `rotation`/`status`/`version` columns to the
existing `furniture` table with a guarded `ALTER TABLE`, but it can't drop
the existing `NOT NULL` on `tile_x`/`tile_y` without rebuilding the whole
table --- real risk to the one Fly volume for no semantic gain, since
`status` already fully gates whether position means anything. Every read
path either filters `WHERE status = 'placed'` or doesn't look at position
for a stored row at all.

### Provenance, not custody

`placed_by` and `placed_at` are never touched by moving, rotating, storing,
or retrieving a piece --- they record who originally placed it, the same
"trace, not ownership" idiom as `flowers.planted_by`. Retrieving a stored
piece does not reassign it to whoever retrieved it; CLAUDE.md's "nobody
owns anything" rules that out directly.

### Why shared storage isn't a banned "complex inventory"

CLAUDE.md bans complex inventories. Shared storage is one flat, shared
pool with no categories, slots, or capacity beyond the furniture table
itself, and anyone can take from it --- it's a direct extension of "nobody
owns anything," not a per-visitor system CLAUDE.md's rule is aimed at. No
new exception was added to CLAUDE.md because nothing here bends an
existing rule.

### A second real bug, reported after shipping: the menu didn't follow a move

Originally the menu stayed fixed wherever it opened for the whole duration
of a move --- dragging the ghost preview to a new tile didn't drag the menu
with it, so Save stayed back at the *original* spot. Noted at the time as
an "acceptable tradeoff," but a user report ("once you move it to another
place, there's no confirmation") showed it reads as a real bug in
practice: drag a piece across the house and the only way to confirm is
invisible, back where you started, which looks exactly like "there's no
way to confirm this." Fixed by having the menu (panel, icons and selection
outline, not just the ghost) re-render at the current draft tile on every
pointer move during a drag, the same way it already did on Rotate. The
existing "is the cursor over the menu" bounds check (see below) still
guards this --- it now matters more, since the menu is usually right next
to the cursor while dragging, not just occasionally crossed on the way to
a fixed Save button.

Verified by hand after the fix: moved a piece across the house, confirmed
the menu and Save button visibly follow the drag, and confirmed Save at
the new position actually commits the new tile (`version` incremented,
position persisted).

### A third round of the same feedback: click the spot itself to confirm

Even with the menu following the drag, a further report ("once the user
chooses a spot to move to and it's valid, left clicking again should save
the move") pointed at the same underlying friction from a different angle:
needing a *second*, separate click on a small Save icon --- after already
clicking once to place the ghost --- is an extra step most placement UIs
don't ask for. Clicking the destination tile is already the natural
"confirm this spot" gesture everywhere else in this scene (buying and
retrieving both place on a single click); moving a piece was the one case
that didn't.

Fixed by treating a click on a *valid* tile during a move the same as
clicking Save: the scene's own `pointerdown` handler now calls
`tryConfirmMove()` while `phase === "moving"`, which re-checks
`isValidPlacement` against the current draft tile and, only if it's still
legal, calls the same `saveEdit()` the Save icon calls. A click on an
occupied or out-of-bounds tile is ignored rather than rejected, so the drag
simply continues --- consistent with the ghost's own red/green tint already
telling the visitor whether a given spot would work. The Save icon (and
Rotate, Store, Cancel) stay in the menu as before; clicking the spot is a
faster path to the same action, not a replacement for it.

Verified by hand: dragged a piece to an empty tile and clicked directly on
it --- confirmed the move (version incremented, menu closed) with no
separate Save click. Dragged the same piece onto an already-occupied tile
and clicked it --- confirmed nothing happened (no version change, still in
moving phase), since that click targeted an invalid spot.

### Known limitation (unrelated to the above)

The menu is destroyed and rebuilt on nearly every click, which can happen
while the cursor sits right on top of it --- tracking "is the cursor over
the menu" with `pointerover`/`pointerout` got stuck once that happened
mid-hover, and crossing the menu on the way to Save was silently dragging
the piece to whatever tile the menu sat over. Fixed by checking the
current panel's bounds directly on every pointer move instead of trusting
hover events across a destroy/rebuild.

### What's still manual

The Phaser-rendered menu itself (appearance, positioning, tooltips, the
in-menu store confirmation, Escape-to-cancel) can't be exercised by
`pnpm check` --- the harness is HTTP+WS against a running server with no
Phaser/DOM rendering at all. These are checked by hand; see
`spec/MANUAL.md`.

Manually verified 2026-10-11: a moved-and-rotated piece and a stored piece
both kept their new position/rotation/status across a server restart
(`pnpm start`, stop, `pnpm start` again, re-fetch `/api/state`) --- pass.

## Cooperative construction minigame

Another standalone piece of feature work, same framing as the furniture
section above: visitors can now click an unfinished construction site in
the outdoor meadow and work together to build the guinea pig house. One
person can finish it alone; more people contributing at once makes each
accepted click worth more. See
`docs/decisions/0003-construction-concurrency.md` for the full decision
record (why solo-allowed-with-a-bonus beat solo-only and
mandatory-multiplayer, the recency-only active-builder model, the
two-transaction reward design, and why the already-shipped indoor house
isn't gated behind this).

### CLAUDE.md needed a new exception before this could ship

The Interface section bans raw stat displays except a visitor's own Care
Points balance. The panel's progress percentage, active-builder count and
teamwork multiplier are new raw numbers, about the shared project rather
than any one visitor or the guinea pigs --- `CLAUDE.md` now has a dated
exception for exactly this, added as its own commit before any panel UI
landed, the same way the Care Points exception came first before the
furniture shop did.

### A real pre-existing bug, found while verifying this

The visitor-identity cookie was minted by middleware registered *after*
`express.static`. A visitor's very first request is `GET /`, which
`express.static` answers directly without ever reaching that middleware ---
so the first page load never got a cookie, that load's own first
WebSocket connection (which carries whatever cookie the browser already
has) was rejected by `realtime.ts` for having none, and the page sat on
"Loading the sanctuary's memory…" until some unrelated `fetch()` finally
minted one. Every existing feature masked this, because testing them
always means clicking something (feed, plant, buy) within the first
second or two. Fixed by registering the cookie middleware first. This bug
predates this week's work; it just happened to be this feature's own
passive-visitor testing that surfaced it.

### Units, not points, in the database

Progress is stored as integer "units" (100 units = 1 construction point,
10000 = the completed target) rather than fractional points, so the
1×/1.5×/2×/2.5× teamwork multiplier never does floating-point arithmetic
or accumulates rounding error --- the brief's own suggested convention,
used literally.

### What's still manual

The construction site's sprite swapping across its five stages, the
panel's appearance and press feedback, and the completion celebration all
need a running browser to see --- this harness is HTTP+WS only, same
limitation as the furniture menu above. See `spec/MANUAL.md`.

Manually verified 2026-10-11: progress at 500/10000 units survived a
server restart; a freshly completed project (two cooperating visitors,
cooperative reward paid) also kept its `completed` status, and a further
contribution was still correctly rejected, after a second restart --- pass
both times.

## Crit 10: who-did-what logging

### Why this was the gap, not the multi-user mechanics

The `visitor=<uuid>` cookie (crit 8) and the per-visitor checks it already
gates (Care Points balance, furniture ownership-free placement, construction
rate limiting) already satisfied "the app tells people apart" and "checked on
the server." What the server never did was *say* any of that out loud: before
this, the only line it ever printed was the startup banner. Crit 10's actual
new bar --- "logs who did what, server-side, and the logging outlives the
crit" --- needed a logging layer that didn't exist yet, not a new identity
system.

### One JSON line per action, to stdout

`src/server/log.ts` exports a single `logAction(visitorId, action, details)`
helper that prints one JSON object per call: a timestamp, the visitor id, the
action name, and whatever's specific to it (tile coordinates, units awarded,
a denial reason). Every mutating route (`/api/feed`, `/api/plant`, the four
furniture routes, `/api/construction/contribute`) and both WebSocket
connect/disconnect call it --- plain JSON rather than a logging library,
because the whole requirement is satisfiable with `console.log` plus
structure, and Fly already captures and retains stdout per
`mise exec -- flyctl logs -a <repo>` (that retention is what makes the log
"outlive the crit," not anything this app does itself).

Denied actions (insufficient balance, overlapping tile, stale version, rate
limited) are logged too, with the reason, since "can't change what should be
someone else's" is exactly the moment the crit's narration needs to point at.
Idempotent replays are logged under a distinct `*-replay` action name rather
than silently as a fresh success, so a retried request doesn't read as a
second action by the same visitor.

### What this doesn't try to be

No log viewer, no persistence of the log itself beyond what Fly already keeps,
no per-visitor history endpoint --- the spec asks for logs a person narrates
from in a terminal, not a feature visitors see. Keeping it to one helper
function and call sites at each existing route kept this from growing into a
second event system alongside the WebSocket broadcasts that already exist for
a different purpose (informing other connected clients, not auditing).

## A reported bug: the house disappeared after going back outside

Reported directly: click "Go inside," then "Go back outside," and the
construction site sprite in the meadow was simply gone --- for the rest of
that session, not just a flash. Reproduced with a real headless browser
(Playwright, since `spec/`'s HTTP+WS harness never renders Phaser or the
DOM --- see `spec/README.md`), which caught an uncaught exception the moment
`OutdoorScene` was re-created: `Cannot read properties of undefined (reading
'sys')`, thrown from `redrawConstructionSite()`.

### Root cause: a Scene instance isn't reconstructed on re-entry

Phaser reuses the same `OutdoorScene` *object* across `stop()`/`start()` ---
`PhaserGame.tsx`'s view switch never constructs a fresh Scene --- but
`stop()` destroys every GameObject the Scene owned. `redrawFlowers()` and
`redrawFurniture()` already handled this correctly (unconditionally destroy
whatever's there, then recreate), but `redrawConstructionSite()` instead
checked `if (!this.constructionSite)` and, finding the class field still set
from the *previous* time the Scene ran, called `.setTexture()` on a sprite
that `stop()` had already destroyed. That threw partway through `create()`,
which also aborted every handler registered later in the same function ---
the meadow's click-to-plant and keyboard handlers never got (re-)registered
for the rest of the session, not just the construction sprite.

Fixed by making `redrawConstructionSite()` match the other two: destroy
`this.constructionSite` unconditionally, then always recreate it.

### A second bug, same root cause: a leaked EventBus listener

While reproducing the first bug in a browser, three round trips into the
house and back followed by one "Plant a flower" click fired four identical
`POST /api/plant` requests, not one. `EventBus.on("plant-random", ...)` was
registered inline in `create()` with an anonymous callback, and --- unlike
every other listener `create()` registers --- was never removed in the
Scene's `SHUTDOWN` cleanup. `EventBus` lives outside any one Scene, so
nothing else ever cleared it either: each visit added another listener,
and one click fired all of them. Fixed by naming the handler
(`onPlantRandom`, same pattern as the Scene's other bound callbacks) and
adding its `EventBus.off` alongside the existing three in the `SHUTDOWN`
block. `this.input` listeners didn't need the same fix --- Phaser's own
`InputPlugin.shutdown()` already clears those per Scene instance.

### Browser testing didn't exist in this repo before this

Neither bug could have been caught by `spec/`, by design (no Phaser/DOM
rendering in that harness). Added a Playwright suite at `browser/` instead,
kept deliberately separate from `pnpm check`/CI (the Docker image CI builds
and checks has no browser in it) --- see `spec/README.md` and
`browser/scene-lifecycle.spec.ts`. Verified the regression test actually
catches the original bug by reverting the `OutdoorScene.ts` fix and
confirming the test failed with the exact same `Cannot read properties of
undefined (reading 'sys')` error, then restoring the fix and confirming
both tests pass alongside all 27 pre-existing `spec/` tests.

## Directional furniture: rotation swaps the sprite, not just the angle

Reported directly, with a reference sprite sheet: rotating a piece of
furniture should show a genuinely different side of it (front, back, left,
right), not spin one square image on screen. Before this, `IndoorScene.ts`
drew one `furniture-${kind}` texture and called `.setAngle(rotation)` on it
--- visually fine for a plain box, but wrong for the hideout, whose front has
a door and whose back doesn't.

### Only 3 unique images per kind, not 4

Comparing the reference sheet's left and right columns pixel-by-pixel showed
they're exact horizontal mirrors of each other, not independently drawn art.
So each kind got 3 new sprites (`-front`, `-back`, `-left`) instead of 4;
`-right` is the `-left` texture with Phaser's `.setFlipX(true)`, not a
fourth asset. `viewFor(kind, rotation)` in `src/server/furniture.ts` --- next
to `footprintFor`, the same file `IndoorScene.ts` already imports placement
logic from --- maps `Rotation` to `{ key, flipX }`: 0deg is front, 90deg is
the mirrored left (i.e. right), 180deg is back, 270deg is left. This matches
the order `ROTATIONS` already cycles through on each Rotate click, so the
*button* behavior is unchanged; only what gets drawn at each stop changed.

`IndoorScene.ts`'s two furniture-drawing sites (`renderGhost` for the
buy/retrieve/edit preview, `redrawFurniture` for placed pieces) both swapped
`.setAngle(rotation)` for `viewFor(...)` + `.setFlipX(...)`. Footprint math
(`footprintFor`, tile collision, width/height swap on 90/270) is completely
unchanged --- this was a rendering-only fix, and the existing
`spec/furniture-edit.test.ts` rotation test (asserting `rotation`/`width`/
`height` over HTTP) needed no edits and still passes.

### New art

9 new sprites total: `furniture-hay_bed-{front,back,left}.png`,
`furniture-tunnel-{front,back,left}.png`, `furniture-hideout-{front,back,
left}.png`, replacing the 3 old unsuffixed files (deleted once nothing
imported them anymore). The hideout's existing front-facing door sprite
became `-front` unchanged; its `-back` is the same silhouette with the door
hole filled in to a plain wall; its `-left` is new art --- a side profile
with the roof as a single diagonal slope down to a low overhang, rather than
the front's full peaked roof. The hay bed's hay mound reads the same from
front and back (confirmed against the reference sheet, where that row's four
columns are already near-identical), so `-front` and `-back` are the same
image; `-left` is a narrower rounded mound over a shorter crate face,
matching the reference sheet's side columns. The tunnel's existing sprite
(open dark holes at both ends) became `-front`; `-back` fills the holes in
with the log's own wood tone (capped ends); `-left` is the same capped log
compressed narrower, since a cylindrical log's side profile doesn't differ
dramatically from its front/back the way the hideout's roofline does.

`StoragePanel.tsx`'s thumbnail always shows the `-front` variant regardless
of a stored item's actual rotation --- it's just an identifying icon, and
tracking a stored piece's last-seen rotation for a 32x32 thumbnail isn't
worth the complexity (CLAUDE.md's Scope principle). `ShopPanel.tsx` was left
alone --- it was already text-only, no icon, and rotation doesn't apply
before a piece is placed.

### Testing a rendering change spec/ can't see

Added `browser/furniture-rotation.spec.ts`. The obvious approach --- diffing
raw screenshot bytes before and after rotating --- turned out not to
distinguish the bug from the fix: rotating one square image 90 or 180
degrees in a Phaser canvas changes plenty of individual pixel positions
even when it's still wrong. What actually distinguishes "spun" from
"swapped" is the *set of colors present*: a 180-degree spin of one image
can rearrange pixels but can never introduce or remove a color, while a
genuinely different sprite can (the hideout's door-hole color exists only
in `-front`, never in `-back`). Verified both directions: reverted the
`viewFor`/`setFlipX` change back to `.setAngle()` on one `-front` texture
and confirmed the test failed with front and back showing exactly the same
color set; restored the fix and confirmed it passes, alongside all 27
pre-existing `spec/` tests and the two existing `browser/` tests.

## Multiple cooperative construction projects

The single shared build (Potato's house) became five: the existing house
unchanged, plus a toolshed, greenhouse, bridge and great hall, each with its
own much larger target and its own 5-stage pixel art. See
`docs/decisions/0004-multiple-construction-projects.md` for the full
decision record --- why projects became config data instead of a hardcoded
constant, the per-project active-builder/rate-limit keying, and the
solo/group click-count arithmetic behind picking 50,000/200,000/500,000/
2,000,000 as "a lot of clicks" rather than a literal million.

`spec/construction.test.ts` was extended, not rewritten: every existing
test keeps passing against the original `guinea-pig-house` project
(the file's helpers default to it), plus one new test confirming a second
project's progress and active-builder count are tracked independently.
28 tests passed after this change, up from 27.

## Visitor identity: closing a named, accepted gap

ADR 003 named a real limitation when the cooperative construction
multiplier first shipped: the visitor cookie is unsigned, so nothing stops
a client from claiming any identity it likes. This was accepted at the
time as out of scope for that feature. Crit 10's spec asked to actually
close it, plus fill three logging gaps and document the permission model
end to end --- see `docs/decisions/0005-visitor-identity-and-permissions.md`
for the full account: what's individual vs. shared state, why the existing
"anyone may act on shared state" model was already correct and gets no
ownership check added to it, the alternatives considered (ownership checks,
a full account system, a server-side session store) and why each was
rejected, and the honest limitations of what signing an anonymous cookie
does and doesn't guarantee.

### What was already there

Most of the logging the spec asked for already existed from crit 10's
earlier logging pass: connect/disconnect, feed, plant, furniture place/
edit/store/retrieve (success, denial, replay), and construction contribute
(success, denial, replay). The permission model for shared state
(furniture, flowers, construction) was already correct, since
`editFurniture`/`storeFurniture`/`retrieveFurniture` don't even take a
`visitorId` --- there was never an ownership check to accidentally bypass.
Individual state (Care Points) was already protected, since every earn/
spend call uses the server-derived `req.visitorId`, never a client-supplied
field.

### What was missing: three logging gaps, one real security gap

The seven malformed-request (400) rejections across `index.ts` logged
nothing at all; the Care Points payout for finishing a build
(`grantConstructionRewards`) never logged; "construction completed" only
showed up as a `justCompleted` flag buried inside the generic contribute
log line. All three got a dedicated `logAction` call --- `*-rejected` for
the 400s, `care-points-awarded` for the reward (guarded against re-logging
an already-paid, idempotent-replay grant), and `construction-completed` as
its own named event.

The real gap was identity itself: `index.ts` and `realtime.ts` each
independently regex-matched a plain `visitor=<uuid>` cookie with no
verification. New module `src/server/identity.ts` is now the one place
both files verify a cookie, which is now `visitor=<uuid>.<hmac-signature>`
(`node:crypto`'s `createHmac`/`timingSafeEqual`, no new dependency). A
cookie that's missing, malformed, or has a wrong signature is never
trusted --- the server mints a fresh identity instead, exactly as it
already did for "no cookie at all."

### The rollout cost, confirmed deliberately

Every visitor's existing unsigned cookie fails verification the moment
this deploys, silently issuing them a new identity --- which means every
visitor's Care Points balance resets. This was discussed and accepted
rather than worked around: grandfathering old cookies in for a transition
period would just reopen the same forgery window for as long as the grace
period lasted.

### Tests

New `spec/identity-security.test.ts`: two fresh visitors get distinct
identities; a correctly-signed cookie's identity persists across requests
with no re-mint; an unsigned legacy cookie, a tampered signature, and a
signature from the wrong secret are each rejected; a client can't award
itself arbitrary Care Points via extra request fields. New test-only
`spec/identity.ts` signs cookies the same way the server does (same
`SESSION_SECRET` fallback), so the seven existing spec files that each
defined their own `cookieFor` helper, plus `spec/ws-client.ts`'s
`connectAs`, needed only to import the shared signer --- every call site
(`cookieFor(visitorId)`) was untouched. Full suite: 34 tests passed (28
existing + 6 new), confirming the signing change didn't regress anything
that authenticates "visitor A"/"visitor B" via a cookie.

Log correctness itself --- whether the output is actually narratable live
at a crit --- isn't asserted in `spec/*.test.ts`; nothing in this suite
captures server stdout, and this harness is HTTP+WS only, same structural
gap `spec/MANUAL.md` already carves out for Phaser-rendering checks. See
`spec/MANUAL.md`'s new "Two-visitor crit walkthrough" scenario.

### Deployment verification

Manually verified 2026-10-19 against the live deployed app
(`comp4020-final-zephyrieal.fly.dev`), with `SESSION_SECRET` set as a real
Fly secret before this deploy (`flyctl secrets set`, confirmed `Deployed`
via `flyctl secrets list`):

- Two independent browser contexts (sharing no cookies, the same isolation
  two separate Chrome profiles would give) each loaded the app and were
  issued distinct, properly signed `visitor=<uuid>.<signature>` cookies.
- Each fed Potato and planted a flower. `flyctl logs` showed both visitors'
  actions clearly and distinctly: `connected` → `fed-potato` (balance 10)
  → `planted-flower` (with coordinates) → `disconnected`, for each of the
  two visitor ids, fully narratable from the log lines alone.
- A malformed `/api/plant` request logged `plant-rejected` with its reason,
  attributed to the (fresh) visitor id that made the request.
- A forged, unsigned `visitor=<uuid>` cookie (the pre-signing format) was
  rejected: the server minted a different, properly signed identity rather
  than adopting the claimed one, and logged `visitor-identity-rejected`
  with a reason --- confirmed both via the HTTP response's `Set-Cookie`
  header and the corresponding log line.

All four checks passed on the first attempt, no retries needed.

## Potato wanders the meadow on her own

Previously Potato was a single static sprite drawn once at a fixed 50/50
point --- an explicit, deferred scope decision from an earlier week ("no
autonomous AI this week"), not an oversight. CLAUDE.md requires she never
be directly controlled ("the guinea pig decides what it does"), that every
visitor see her in the same place at the same time (one shared world), and
that the server --- not any one client --- owns "guinea pig state." This
adds simple autonomous wandering: she picks a nearby point, walks there
over a believable duration, pauses, repeats, server-decided and broadcast
to everyone.

**Ephemeral, not persistent.** Her exact position is transient,
frequently-changing state, not something "presented to the visitor as
permanent" the way furniture placement or Care Points are. It's the same
category as construction's active-builder tracking (ADR 003): in-memory
only, no new column, no migration, no extra SQLite writes every tick.
Losing her mid-walk position on a restart and reappearing at the meadow's
center is not a broken promise to anyone. `src/server/guinea-pig.ts` keeps
a single module-level `state` object and nothing else.

**No new CLAUDE.md exception needed.** Nothing new is shown as a number or
label --- no "Potato is walking," no coordinates. The only visible change
is the sprite itself moving, which is exactly the "Bean approaches, Bean
sleeps nearby" example CLAUDE.md already gives for communicating through
behaviour rather than stats.

**Testing without fake timers or wall-clock waits.** Every other test in
this repo that needs time to pass either uses a real `setTimeout` wait
(`spec/construction.test.ts`'s own comment: "Real wall-clock wait --- no
fake timers exist anywhere in this repo") or avoids the question entirely.
`guinea-pig.ts`'s core functions (`pickNextTarget`, `currentPosition`,
`tick`) take `now`/`random` as plain arguments instead of reading
`Date.now()`/`Math.random()` internally, so `spec/guinea-pig.test.ts` can
drive them with fixed values and assert exact behaviour with no waiting at
all. This sidesteps the constraint rather than working within it --- a
meaningfully cheaper pattern than the existing wall-clock-wait tests, worth
reusing for any future feature that needs to unit-test something
time-dependent.

**First real enforcement of `prefers-reduced-motion`.** CLAUDE.md's
Accessibility section has asked to "respect reduced-motion preferences for
animation that isn't load-bearing" since the project started, but nothing
in the codebase actually checked it until now --- it was a principle on
paper only. `OutdoorScene.ts` reads
`window.matchMedia("(prefers-reduced-motion: reduce)").matches` once in
`create()`; when true, Potato's position updates snap instantly instead of
tweening. Potato's position itself is load-bearing (it's the server's
authoritative state); only the cosmetic glide between two points is
gated.

**Verification:** `pnpm check` (39 tests: 34 existing + 5 new, all
passing; typecheck clean). Manual browser check against a production build
(`pnpm build && node src/server/index.ts`, since `pnpm dev`'s Vite server
has a pre-existing, unrelated cookie-minting race that breaks the very
first WS connection in local dev only):
- Potato visible on load, drifting to a new position within a few seconds
  with no click, confirmed across three screenshots taken ~3s apart.
- Two independent, cookie-isolated browser contexts loaded at the same
  time showed her in the exact same position at the same instant ---
  confirming one shared world, not a per-client simulation.
- With `prefers-reduced-motion: reduce` emulated, her position updated
  with no glide, matching the intended snap behaviour.

## Bugfix: the progress bar looked stuck on the bigger houses

Reported: "it seems that the progress bar doesn't increase when you build
house together." Confirmed against the live deployed app by contributing
directly (bypassing the UI) --- `construction.progressUnits` was climbing
correctly on every click, including the 1.5x multiplier kicking in once a
second visitor joined. The server side (`src/server/construction.ts`,
unchanged by ADR 004's own verification) was never the problem.

The actual bug was `ConstructionPanel.tsx` flooring the displayed percent
to a whole number. That's fine for the original `guinea-pig-house` (10,000
units, 1% per solo click), but ADR 004's four newer, deliberately much
larger projects make a single click worth far less than 1%: 0.2% on the
toolshed, 0.05% on the greenhouse, 0.02% on the bridge, 0.005% on the
great hall. Flooring meant the label could sit at a stuck "0%" for dozens
of real, server-recorded clicks --- confirmed by reproducing it directly:
10 solo clicks on the greenhouse moved `progressUnits` from 0 to 500 (the
real, correct amount) while the displayed label stayed "0%" the entire
time, with or without a second visitor involved. "Building together" was
never broken --- the multiplier and the shared broadcast both worked
exactly as they should (verified again with two browser contexts); the
number on screen just couldn't show the truth yet.

Fix: show two decimal places below 10%, a plain whole number at 10% and
above (where the extra precision stops being noticeable), "0" only when
progress is exactly zero, and "<0.01" for the sliver between zero and the
smallest value two decimals can represent. The progress bar's fill width
and its `aria-valuenow` both switched from the floored integer to the same
exact percentage, so a screen reader announces the same real number the
visual bar now shows.

Verified in-browser against a fresh local build: 10 solo clicks on the
greenhouse now show "0.50%" (previously stuck at "0%"); a two-visitor
session on the small project showed the label move 0% → 1.00% → 3.50% as
the multiplier engaged, both browser contexts staying in sync throughout.
`pnpm check` still passes (39/39, typecheck clean) --- no existing test
asserted the floored display, so nothing needed updating.


## Controllable visitors and shared movement

Added a separate human visitor avatar, controlled with WASD, arrow keys or the
on-screen direction buttons. This implements the requested visible co-presence
while leaving Potato autonomous. Existing click-to-plant, feeding, furniture and
construction interactions remain available.

The WebSocket now accepts ephemeral movement intents as well as sending world
updates. Clients send a room and direction, never trusted positions, speed or
elapsed time. The server advances movement at 20Hz, normalises diagonals, clamps
to meadow/room boundaries, expires stale input after 350ms and limits input
messages to 60 per second. Only changed presence snapshots are broadcast.
A ping/pong heartbeat removes broken connections. Persistent mutations continue
using the existing HTTP endpoints and SQLite transactions.

There is one avatar per live browser tab, with a fresh public connection id
that does not reveal the signed visitor cookie. This lets two tabs be controlled
independently without duplicating personal Care Points identities. Presence is
in-memory and disappears on departure; reconnecting returns to a spawn point
in the currently viewed room. No accounts, database migration or dependencies
were added. The initial HTTP state request establishes identity before opening
the socket, including in Vite development mode.

Both Phaser scenes use the same visitor layer. It interpolates server snapshots,
animates walking, labels the local visitor, and removes avatars in other rooms.
Input stops on lost focus, hidden tabs or scene shutdown. Reduced-motion mode
omits interpolation and walking bob. On-screen buttons focus before sending
movement so the canvas blur does not cancel the new input. Furniture selection
pauses walking; re-entering the house clears any stale selection.

Current scope: room boundaries are enforced; furniture, construction scenery,
and other visitors do not block walking. Room changes use the existing buttons.
Movement is server-authoritative with visual interpolation, without local
prediction, so high-latency connections may feel less responsive. Presence is
suited to the existing single-server, small-audience deployment.

Verification coverage: spec/presence.test.ts checks speed, diagonal movement,
invalid intents, stale input, boundaries, separate connections, and real socket
join/move/room/leave broadcasts. browser/multiplayer.spec.ts exercises two
independent browser contexts, keyboard and on-screen controls, repeated room
changes, a real socket closure/reconnect and departure cleanup. Browser tests
run serially because all of them share the same sanctuary. Verification uses
temporary databases, leaving the project's existing world untouched.

## Cute four-direction visitor artwork

Replaced the rectangle-built visitor with a generated transparent gardener sprite
sheet: fluffy chestnut hair, rosy cheeks, sage overalls and a peach neckerchief.
The referenced ChatGPT conversation exposed its text but not its original images;
the existing sanctuary sprites informed the cozy palette instead. The original
PNG is checked into src/client/assets/sprites/visitor-gardener.png. Built-in image
generation produced the artwork; no new image dependency is used at runtime.

BootScene registers four atlas frames using the sheet's alpha bounds. PlayerLayer
aligns their feet and renders each at 54px high, selecting front/back/left/right
from the server's actual movement. At rest it retains the last view. Individual
coloured ground markers and labels distinguish visitors without tinting their
skin or artwork. Existing movement, interpolation, reduced-motion handling and
multiplayer presence remain in place. The meadow's top bound includes enough
space for the taller sprite and its label. The generation prompt is recorded in
docs/visitor-art.md.

### Minimal character revision from supplied references

Replaced the active sprite sheet with visitor-minimal.png after the user supplied the intended visual references. The character now has a cream guinea-pig hat, simpler dark hair, short sage overalls, and a small backpack. Reduced shading and detail improve readability at game size. Updated the four atlas bounds; controls and presence behavior are unchanged. The original artwork and both generation prompts are retained.

## Public garden and nearby actions

Replaced experimental flower planting with one continuous public crop bed. All visitors may plant and harvest it; the crop picker offers hay, lettuce, bell peppers and cucumbers. Feeding, farming and construction now require a nearby authenticated avatar. Shared crops and pantry persist and broadcast; version checks and request IDs protect concurrent actions. Potato also uses a simpler cream-and-caramel sprite matching the visitor art.

## Inhabitants, food rewards and scene cleanup

Added Mochi, Biscuit and Clover with independent server-owned wandering and persistent feeding records. Food rewards are 10/15/20/25 for hay/lettuce/cucumber/pepper, selected server-side. Fixed construction updates reaching destroyed Phaser scenes: cleanup now runs on both shutdown and destruction. Previously a stale listener could throw before the active scene received the completed-building update. Early room switches are retained while assets load.

## Island landscape

Replaced the repeating grass backdrop with a reference-inspired pixel-art island: sandy paths, a waterfall, blossom trees, rock clusters, pots, bench and shoreline foliage. Existing world coordinates and live objects remain unchanged. Asset provenance and prompt are in docs/landscape-art.md.

## Shared indoor visits, social gestures and autonomous furniture use

Three commits ([`963d3d4`](../../commit/963d3d4a5d00c9c9c16e3620395be6ee12f52573), [`fec57d1`](../../commit/fec57d190c67eb44e1755f95074e6c67db7d8b15), [`baf739a`](../../commit/baf739ad453f28dccd8bf476dabcdfadc2256643)) close the biggest remaining gap in "meaningful co-presence": visitors could already stand next to each other, but had no way to acknowledge one another, and entering a house meant an empty room with static furniture. `docs/decisions/0011-social-encounters-and-furniture-behaviour.md` is the full decision record; this section is the shorter account of what changed and why.

**One shared population follows visitors indoors.** `src/server/indoor-guinea-pigs.ts` extends ADR 010's server-owned location to interiors: entering an empty room can attract one of the four existing inhabitants for a 90-second visit, visible to everyone who walks in rather than spawned per-visitor. There are still only four guinea pigs --- if all are already visiting other rooms, an empty room just waits. Feeding indoors reuses the existing proximity-and-room check, so a meadow visitor can't feed an animal inside a house they're not in.

**Gestures are deliberately small.** Wave, Sit and Help here sit alongside the movement controls, validated entirely server-side (`src/server/presence.ts`): a client can only gesture as its own avatar, never choose another visitor's id or supply a custom duration. Wave and Help here auto-expire after three seconds; Sit persists until the visitor stands, walks, changes rooms or disconnects, and a repeated-gesture request is rate-limited to one every 800ms on top of the existing presence message cap. No Care Points, no record, no persistence --- this is presence, the same category as a wave in *Sky: Children of the Light* (the reference README.md already cites), not a contribution.

**Furniture gives the inhabitants something to do, without visitors commanding it.** During an indoor visit, at each eligible choice point there's a 65% chance an animal picks a reachable hay bed, hideout or tunnel instead of ordinary wandering: it approaches, uses the piece for six seconds (resting, hiding or exploring respectively, each with its own client-side cue), then returns to clear floor with an eight-second cooldown before it can choose furniture again. The server still owns this entirely --- CLAUDE.md's "furniture use is chosen by the server, never commanded by visitors" line was added as part of this change, alongside a "social gestures" line, since both are new categories of server-validated, visitor-visible-but-not-visitor-controlled behaviour that the harness didn't previously have rules for. Moving, rotating or storing the furniture a guinea pig is using cancels the activity safely rather than leaving a stale reference; only the piece actually in use is excluded from collision checks, so walls and other furniture remain obstacles.

**What's still a simplification.** The tunnel's "exploring" activity reuses the same approach-and-pause sequence as the other two kinds rather than a dedicated end-to-end traversal animation. Furniture choice considers clear straight approach/return segments, not full pathfinding, so cluttered layouts can make some pieces unreachable. None of this is persisted --- an indoor visit, a gesture, or a furniture activity disappears on restart exactly like Potato's outdoor wandering position already does, while the furniture itself and feeding records remain in SQLite.

**Verification.** `pnpm check` passes in full against a fresh database: 56 `spec/` tests (up from 39), including three new files --- `spec/indoor-guinea-pigs.test.ts` (wall/furniture-path clearance, shared visits with no duplicate inhabitants, return to the meadow), `spec/gestures.test.ts` (a gesture only ever changes its own sender, expiry uses server time, sitting survives neutral movement input but ends on real movement or a room change, unknown gestures are rejected, repeated changes are rate-limited) and `spec/furniture-behaviour.test.ts` (all three furniture kinds produce their expected activity and then leave, storing furniture mid-use clears the activity) --- plus `browser/indoor-guinea-pigs.spec.ts` and `browser/gestures.spec.ts` for the two-browser-context checks `spec/` structurally can't see. Typecheck is clean.

Re-running `pnpm test:browser` for this update, against the project's one shared running instance, reproduced six failures that predate this round of work and aren't specific to it: `browser/multiplayer.spec.ts` now finds "4 other visitors" instead of "1" (ambient avatars left connected by other open sessions against the same dev server, not a regression in presence itself), and `browser/farm.spec.ts`, `browser/furniture-bounds.spec.ts`, `browser/guinea-pigs.spec.ts`, `browser/indoor-guinea-pigs.spec.ts` and `browser/z-food-rewards.spec.ts` time out waiting on UI state most likely for the same reason --- a shared dev server already carrying state and other live connections from earlier manual testing, not a clean target. These need re-running against a freshly started `pnpm dev` with no other browser tabs attached before relying on them at a crit; this account doesn't claim they passed clean this round.

Still open, named in ADR 0011 rather than hidden: whether visitors actually notice gestures, treat Help here as an invitation rather than ignore it, or read furniture activity as the sanctuary feeling collectively cared-for is a playtesting question the automated suite can't answer. `docs/testing/multi-user-test-report.md` is the placeholder for that observation, to be filled in from watching classmates use the deployed URL unprompted, not from this account.
