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
