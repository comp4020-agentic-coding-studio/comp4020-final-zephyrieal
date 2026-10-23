# ADR 006: Nearby Interactions and One Public Food Garden

## Status

Accepted — 2026-10-22. Extends ADR 005's shared-state permissions and replaces experimental flower planting.

## Context

Global feeding and planting buttons let visitors affect the meadow without moving. The playable character needed a reason to approach inhabitants and construction sites. Flower planting was a prototype for farming; the requested replacement is one continuous public bed, with a small crop chooser when clicked nearby.

## Options Considered

- Keep global actions: simple, but movement remains disconnected from caring for the sanctuary.
- Check proximity only in the browser: responsive, but crafted requests can bypass the rule.
- Check proximity against server-owned presence and keep the garden communal: connects movement to interactions without introducing private land.

## Decision

Choose server-enforced proximity and one public garden bed.

Feeding, construction contributions, planting and harvesting require an outdoor avatar within the configured reach. Requests provide `X-Player-Id`; the server resolves it only among live sockets authenticated to the request's signed visitor cookie. It uses the avatar's authoritative position, never coordinates supplied in the action request. Feeding checks Potato's current server position. Reach is 64 logical pixels for feeding, 76 for construction and 96 for the garden. Client prompts provide guidance; they do not grant permission.

The bed has no owner. Anyone nearby may plant an empty bed or harvest a mature crop, regardless of who planted it. It holds one crop across the whole bed until harvest. Choices are hay, lettuce, bell peppers and cucumbers. Prototype growth times are 30, 45, 60 and 45 seconds respectively. Harvest adds three portions to a shared pantry. Food choice appears when feeding nearby; vegetables require pantry stock, while basic hay remains available so visitors can feed before a first harvest.

SQLite stores the bed, growth timestamps, pantry quantities and action ledgers. Growth is calculated from server timestamps rather than per-second database writes, so time spent disconnected still counts. Accepted changes broadcast to all connected visitors; state loading restores the current snapshot.

Planting and harvesting run in synchronous transactions with a bed version and visitor-scoped request ID. Stale actions fail instead of replacing another visitor's crop. Matching retries return current state without repeating the mutation; reusing an ID for different input fails. Feeding consumes available food, increments the feeding trace and awards the server-defined Care Points reward in one transaction, with its own replay ledger.

The flower UI and `/api/plant` endpoint are removed. Historical flower rows are retained without rendering them or exposing planting, avoiding an unnecessary destructive migration.

## Rationale

This gives walking a purpose while preserving collective stewardship. Public harvests let visitors finish work someone else began. Versions and transactions protect that contribution without reservations or ownership.

## Consequences

One visitor's crop choice occupies the whole bed until harvest, and anyone may consume the shared food. These are deliberate public-world rules. Short growth times are prototype settings, not a simulated farming calendar. Basic hay means growing hay is optional. Prompts may briefly disagree with reach during network delay or Potato's movement; the server's rejection wins. Avatars are ephemeral, so actions require a connected tab.

## Verification

`spec/farm.test.ts` covers growth, another visitor's harvest, stale versions, replay safety and denied distant, indoor or mismatched-avatar actions. `spec/flowers.test.ts` covers removal of flower planting. `browser/farm.spec.ts` uses two independent browser contexts to plant and harvest the same bed, feed nearby and contribute to construction. `browser/scene-lifecycle.spec.ts` checks that the bed remains singular across room changes. Persistence across a process restart should also be checked against an existing database; the browser tests alone do not establish that guarantee.
