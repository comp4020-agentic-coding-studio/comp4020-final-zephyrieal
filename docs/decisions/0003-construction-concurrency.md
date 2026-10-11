# ADR 003: Cooperative, Never Mandatory, House Construction

## Status

Proposed

## Context

Visitors can now work together to build a guinea pig house: each accepted
"Build!" click adds shared progress, and the number of distinct visitors
contributing *right now* determines how much progress each click is worth.

The central design question is how cooperation and solo play should relate.
The system must also decide, server-side, who counts as "building right
now" without persisting that as permanent world state, and must guarantee
progress is never lost or duplicated, completion fires exactly once, and a
one-time completion reward is never paid twice.

## Options Considered

### Option A: Solo Construction Only, No Bonus

Every accepted click is worth the same amount regardless of how many
visitors are present.

Simple and fully predictable, but wastes the one thing a shared, persistent
world is good at: visitors never need each other, so the feature teaches
nothing about co-presence. A multiplayer sanctuary where building together
feels no different from building alone misses the project's own definition
of good.

### Option B: Construction Requires Multiple Simultaneous Visitors

Progress only accrues while at least two distinct visitors are actively
contributing; a lone visitor's clicks do nothing.

Strongly rewards co-presence, but makes a core, persistent feature of the
shared world depend on timing a visit to match a stranger's. A visitor
arriving when nobody else is around couldn't make any progress at all ---
mandatory multiplayer for a feature the brief explicitly frames as
optional, and a bad fit for a small, often-quiet sanctuary.

### Option C: Solo Allowed, With a Cooperative Bonus

Any single visitor can complete construction alone. Each additional
simultaneous distinct contributor increases the progress-per-click rate,
up to a cap.

## Decision

Choose Option C.

One visitor contributing alone always makes progress (+1 construction point
per accepted click); two simultaneous distinct contributors raise that to
+1.5 each, three to +2, four or more to +2.5. Progress is stored as integer
"units" (100 units = 1 construction point, 10000 units = complete) rather
than fractional points, so the 1.5x/2x/2.5x multipliers never touch
floating-point arithmetic or accumulate rounding error.

**Who counts as "building right now" is derived purely from recent accepted
contributions, not from WebSocket presence or a client-reported "panel
open" flag.** A single in-memory map (`visitorId -> timestamp of last
accepted contribution`, never written to the database) is the entire
mechanism: a visitor counts as active while their most recent accepted
click is less than five seconds old. Closing the panel, disconnecting, or
simply pausing all stop producing contributions, which is exactly what ages
a visitor out of this map --- one mechanism covers every case the brief
describes, without the server ever needing to trust a client's claim about
its own connection state or UI, and without adding presence-tracking
plumbing to `realtime.ts`'s connection map, which exists to route messages,
not to model "who's doing what." Progress itself lives in the database and
survives a restart exactly like furniture and Care Points; who's actively
building does not, and is simply rebuilt from whoever contributes next.

The server computes and persists the award for every click inside one
synchronous, non-`await`ing transaction --- the same discipline
`placeFurniture`/`editFurniture`/`storeFurniture`/`retrieveFurniture`
already use (see ADR 001, ADR 002), and for the identical reason: Node's
single-threaded event loop, not the transaction wrapper, is what actually
prevents two concurrent clicks from corrupting shared progress. The
`UPDATE`'s own `WHERE status = 'in_progress' AND progress_units = ?` clause
is defense-in-depth on top of that structural guarantee, not a substitute
for it, matching ADR 002's `version`-check idiom.

Completion is detected the instant a transaction's own write crosses the
target; because the next contribution's very first read sees
`status = 'completed'` and rejects before reaching the `UPDATE`, completion
can only ever fire once. The one-time Care Points reward reuses the
existing `earnCarePoints` ledger function directly (already its own
idempotent transaction) rather than inventing a parallel rewards system;
because `node:sqlite` has no nested transactions, granting it is a second,
sequential transaction run immediately after the completing one commits ---
safe because nothing `await`s in between, so nothing else can interleave on
Node's single thread. That reward pass is also safe to re-run (it skips
anyone `earnCarePoints` already paid, via the same deterministic
`request_id` idiom used everywhere else), and is re-run defensively on
every later rejected contribution attempt once the project is already
finished, so a crash between completion and paying every eligible visitor
self-heals the next time anyone clicks.

The already-shipped indoor house and furniture shop are **not** gated
behind this project's completion. That feature already exists and is
already in use; retrofitting an access gate onto it now would be a
regression for an already-tagged deliverable, for a requirement clearly
written with a from-scratch project in mind. Completion is celebrated
outdoors --- the finished building's sprite replaces the construction
site, and everyone connected sees the celebration --- without touching
indoor access at all.

## Rationale

Option C is the only one of the three that supports the project's
definition of good without contradicting it. It offers meaningful
co-presence (principle 1: showing up with someone else visibly, measurably
helps) and collective stewardship (principle 4: the finished house belongs
to everyone who helped, a little or a lot) without making either
mandatory, which is what "small moments of connection... without
conversation, competition or commitment" actually asks for: a visitor who
arrives alone still gets the real thing, just more slowly, and a visitor
who happens to arrive with others gets to notice that it mattered.

## Costs

A flat bonus for more simultaneous clickers can reward repetitive clicking
for its own sake rather than any more interesting form of cooperation ---
the interaction really is "click a button," and the multiplier doesn't
make it meaningfully different in kind, only in rate.

Visitor identity is an unsigned, anonymous cookie. Nothing stops one person
from opening a second browser or an incognito window and appearing as a
second "distinct" builder to inflate their own multiplier. This is a real
limitation of the identity model this whole project already relies on, not
something this feature solves; it's named here rather than presented as
handled.

The teamwork multiplier and active-builder count are now visible,
numeric, raw stats about the sanctuary (not about any one visitor), which
needed its own documented exception to `CLAUDE.md`'s general ban on
dashboard-style displays --- a judgement call about what "the sanctuary's
shared state" versus "an individual stat" means, worth a tutor's second
look.

A one-second server-side timer now runs for the lifetime of the process to
catch the one case recent-contribution broadcasts can't (a builder going
quiet, which has no contribution event of its own to push on) --- a small
amount of permanently-running background work that didn't exist before,
in exchange for keeping the active-builder count visibly current for
everyone within about a second even when nobody is currently clicking.

## Verification

Covered in `spec/construction-basic.test.ts` and
`spec/construction-cooperation.test.ts`:

- A solo contribution awards exactly 1 construction point (100 units) and
  counts as 1 active builder.
- Two, then three, simultaneous distinct contributors raise the per-click
  award to 1.5 and 2 points respectively.
- A visitor who stops contributing is no longer counted as active once
  five real seconds have passed, and the multiplier drops accordingly.
- Two connections authenticated as the same visitor count as one builder,
  not two.
- A replayed `request_id` never awards progress twice; a rejected
  (rate-limited or already-completed) contribution never does either.
- Concurrent contributions from multiple visitors never push progress past
  10000 units and never lose an accepted contribution.
- Completion happens exactly once even when many visitors are contributing
  at once, and the one-time reward lands exactly once per eligible visitor.

`spec/MANUAL.md` covers what the automated suite can't: that progress ---
partial or completed --- survives a server restart, and that the
construction site's sprite and the completion celebration actually render
correctly, since this harness has no Phaser/DOM rendering.
