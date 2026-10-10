# 0001: Concurrent furniture placement

**Status:** Accepted, 2026-10-10.

## Context

Crit 9 requires the sanctuary to be real-time and requires one documented
decision about how it behaves with several people in it. This project's
answer is a shared guinea-pig house where visitors spend individually-earned
Care Points on furniture (see `CLAUDE.md`'s discussed exception). Two visitors
can attempt to place furniture on overlapping tiles at the same moment; the
rule is: at most one succeeds, no overlapping furniture is ever stored, the
rejected visitor keeps their points, and both visitors converge on the same
final layout. The deployment is one Fly machine (`shared-cpu-1x`, 256 MB),
one SQLite file via `node:sqlite`'s synchronous `DatabaseSync`.

Explicitly ruled out up front: resolving the conflict with client-side
timestamps, or last-write-wins overwriting. Both would mean trusting a
client's account of "when" or "what should stay," which contradicts
`CLAUDE.md`'s "the server is authoritative."

## Decision

The purchase-and-placement check (balance check, tile-overlap check, the
furniture insert, the matching points-deduction insert) runs inside one
function, `placeFurniture` (`src/server/furniture.ts`), with **no `await`
anywhere between its first read and its final commit**, wrapped in an
explicit `BEGIN IMMEDIATE` / `COMMIT` / `ROLLBACK`.

Ordering of two concurrent placement attempts is resolved entirely by the
order their HTTP handlers are invoked on Node's single-threaded event loop ---
not by the transaction wrapper. Because `placeFurniture` is fully synchronous
and Node never runs two pieces of JavaScript at once, whichever request's
handler starts running first sees the true current state of `furniture` and
either commits against it or rejects; the second request's handler runs
strictly afterward, and is validated against whatever the first one actually
did. No additional application-level locking is introduced.

The `BEGIN`/`COMMIT`/`ROLLBACK` wrapper exists for a different reason: all-or-
nothing atomicity if something throws partway through (e.g. a crash between
the furniture insert and the ledger insert must not leave a half-applied
state). `node:sqlite`'s `DatabaseSync` has no built-in `.transaction()`
helper, so this is issued by hand.

A client-generated `requestId` (one per user-initiated placement attempt,
reused only on a same-attempt retry) makes a retried request idempotent: if
the row already exists under that `request_id`, the function returns the
existing result instead of inserting a second time.

## Options considered

1. **Client-side timestamp ordering.** Rejected outright --- explicitly
   disallowed by the brief, and untrustworthy: a client's clock and a
   client's account of "I clicked first" are exactly the kind of value
   `CLAUDE.md` says never to trust for a shared outcome.
2. **Optimistic concurrency** (a version/lock column on the house or on each
   tile, with the client retrying on a conflicting write). More moving parts
   than this deployment needs --- it only pays off once multiple server
   processes can write to the same data concurrently, which isn't this
   deployment's shape at all.
3. **Chosen: synchronous single-writer check-then-commit**, as described
   above.

## Consequences / trade-offs

The single Node process plus single SQLite connection is a genuine single
point of failure and a hard ceiling on write throughput. That is accepted,
not hidden, and is in fact required by the one-small-Fly-machine constraint
(`fly.toml`: `shared-cpu-1x`, 256 MB, one `internal_port`). This design does
**not** scale horizontally: adding a second machine writing to the same
SQLite file would reopen exactly the race this decision closes, since
cross-process file locking doesn't give the same guarantee as one process's
synchronous, single-threaded execution. That's out of scope for this project
and is flagged here rather than silently assumed away.
