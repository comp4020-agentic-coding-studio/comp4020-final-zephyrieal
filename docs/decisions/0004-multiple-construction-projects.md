# ADR 004: Multiple Cooperative Construction Projects

## Status

Accepted

## Context

The cooperative house-construction minigame (ADR 003) supported exactly one
shared build: Potato's house, with a fixed 10,000-unit target and one site in
the outdoor meadow. The sanctuary needed more build sites visitors can work
on together, with some of them deliberately much larger --- projects that
take sustained group effort across many sessions, not something one visitor
finishes in a sitting.

The system had to generalize from "one hardcoded project" to "several
configured projects" without changing the mechanics ADR 003 already settled
(the solo-allowed-with-a-bonus multiplier, the recency-only active-builder
model, the two-transaction reward design) --- those stay correct per project,
they just needed to stop being implicitly singular.

## Options Considered

### Option A: One Row Per Project, Target Size in the Database

Store each project's target unit count as a database column instead of code,
so new projects could be added via a data migration with no deploy.

Rejected: the course's own convention (ADR 001/002/003, the furniture
catalog in `furniture.ts`) already keeps game-balance constants in code, not
the database, and a configuration-only change here would be the only
exception. Nothing about target sizes needs changing without a deploy; code
is simpler and consistent with everything else in this repo.

### Option B: A Separate Server Module Per Project

Give each project its own file/table family, mirroring how furniture and
construction are already separate modules.

Rejected: every project needs the exact same mechanics (multiplier,
rate-limit, completion, reward) --- duplicating that five times for no
behavioral difference between projects would be pure repetition, and any
future bugfix would need five co-ordinated edits instead of one.

### Option C: One Shared Module, a Config Array of Projects

Keep `src/server/construction.ts`'s existing logic, but parameterize every
function by `projectId` and replace the single hardcoded
`PROJECT_ID`/`CONSTRUCTION_TARGET_UNITS` pair with a `PROJECTS` array of
`{ id, name, targetUnits }`.

## Decision

Choose Option C.

`PROJECTS` lists five entries: the existing `guinea-pig-house` (10,000 units,
unchanged) alongside four new, deliberately much larger projects ---
`toolshed` (50,000), `greenhouse` (200,000), `bridge` (500,000), and
`great-hall` (2,000,000). These sizes are chosen against the existing
100-units-per-solo-click rate, not picked arbitrarily: a solo visitor is
500 clicks away from finishing the smallest new project, and even a
sustained group of four (the multiplier's 2.5x cap) is roughly 8,000 clicks
away from finishing the largest --- "a lot of clicks," scaled to feel real
rather than a literal million-click counter.

Every function that previously assumed the one project now takes a
`projectId` parameter: `contribute()`, `getConstructionState()`,
`grantConstructionRewards()`. The two in-memory presence/rate-limit maps
(`lastContributionMs`, `rateLimitWindows`) switch from keying by `visitorId`
alone to `` `${projectId}:${visitorId}` ``, so a visitor building on two
sites at once is tracked --- and rate-limited --- independently per site,
rather than one site's clicks counting against another's limit. The
completion reward's idempotency key gains the same project prefix
(`construction-reward:${projectId}:${visitorId}`) so finishing one project
pays its own reward independently of any other project's, rather than the
first project a visitor ever completed silently blocking every later one
under the old single-key scheme.

`src/server/db.ts` adds a `project_id` column to `construction_contributions`
via the same `PRAGMA table_info`-guarded `ALTER TABLE` pattern already used
for furniture's `rotation`/`status`/`version` migration, backfilling
existing rows to `'guinea-pig-house'` --- the only project that existed
before this change. Seeding loops over `PROJECTS` instead of inserting one
row, so new projects appear with zero progress on an already-deployed
database without touching the existing house's progress at all.

`GET /api/state`'s `construction` field changed from one snapshot to a map
keyed by project id; `POST /api/construction/contribute` now requires a
`projectId` naming a known project; the WS broadcast and the
active-builder-change poller both carry/track `projectId` so each project's
clients update independently. `OutdoorScene.ts` draws one site sprite per
project at its own fixed meadow position, and `ConstructionPanel.tsx` is
parameterized by project id/name instead of a hardcoded "Potato's house."

## Rationale

Option C reuses every piece of ADR 003's already-tested concurrency
reasoning (the no-`await` synchronous transaction, the `WHERE status =
'in_progress'` guard, the `request_id`-based replay safety) without
re-deriving or duplicating it --- the only new surface area is "which
project," threaded through as a plain parameter, which is the smallest
change that actually generalizes the system rather than reimplementing it.

## Costs

Five sites now compete for space in the one outdoor meadow's percent-space;
positions are currently fixed by eye (not derived from a layout algorithm)
and could in principle overlap if the meadow's rendered size changes
significantly. Twenty new sprite assets (four projects x five stages) were
hand-drawn to the same quality bar as the existing house rather than reused
or procedurally generated, which is real one-time art cost but keeps each
project visually distinct rather than a palette-swapped clone.

The much larger target sizes are themselves unverified by any automated
test --- `spec/construction.test.ts`'s own completion test still only drives
the original, small `guinea-pig-house` project to completion, deliberately;
driving a 2,000,000-unit project to completion in a test run would take
an impractical amount of real wall-clock time even at the multiplier's cap,
which is exactly the point of making it that large.

## Verification

Covered in `spec/construction.test.ts`, extended rather than rewritten: every
existing assertion keeps passing against the default `guinea-pig-house`
project (the file's helpers default their new `projectId` parameter to it),
and one new test confirms a second project's progress and active-builder
count are unaffected by activity on the first, and vice versa. The four new,
large projects are never driven toward completion in this suite by design.
