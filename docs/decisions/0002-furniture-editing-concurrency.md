# ADR 002: Concurrency for Editing and Storing Shared Furniture

## Status

Proposed

## Context

Furniture can now be moved, rotated, stored into a shared pool, and
retrieved from it by anyone, for free. Unlike placing a brand-new piece
(ADR 001), each of these operations repeatedly mutates the *same* existing
database row, potentially read by more than one visitor before either of
them writes back.

Two visitors could try to move the same piece at once. Two visitors could
try to retrieve the same stored piece at once. In both cases the system must
pick exactly one winner, never duplicate or silently lose the piece, and
never charge or refund Care Points for any of these operations.

## Options Considered

### Option A: Last Write Wins

Whichever edit request reaches the database last simply overwrites whatever
is there.

Simple, but a visitor's deliberate move or rotation could be silently
erased by someone else's request that happened to land a moment later,
with neither visitor ever told.

### Option B: Row-Level Locking

A visitor "checks out" a piece of furniture before editing it, blocking
other edits until they finish or time out.

Prevents the conflict outright, but introduces exactly the lock-expiration
and abandoned-reservation complexity ADR 001 already rejected for
placement, now for every kind of edit instead of just one.

### Option C: Optimistic Versioning, First Valid Write Wins

Every furniture row carries a `version` number. A client's edit request
must include the version it last saw. The server only applies the edit if
the row's version still matches, inside one atomic transaction; a stale
version is rejected and the server's current row is sent back instead of
being silently overwritten.

For retrieval specifically, the same mechanism reduces to a simpler check:
a stored piece can only be retrieved while its `status` is still `stored`,
checked and flipped to `placed` in the same no-`await` transaction that
already makes concurrent purchases safe (ADR 001). No reservation, no
timeout --- Node's single-threaded event loop is what actually decides
which of two simultaneous requests runs first; the version/status check is
what makes that decision final rather than racy.

## Decision

Choose Option C.

Every `furniture` row has a `version` column, starting at 1 and
incrementing on every successful move, rotate, store, or retrieve. A move
and a rotation are committed together as one edit (the visitor's menu asks
for Save once, after previewing both locally), so they share one version
bump rather than two.

The server validates and commits each operation as one synchronous,
non-`await`ing transaction, the same discipline ADR 001 established for
purchases --- this is still what actually serialises concurrent requests;
the version check in the `UPDATE ... WHERE version = ?` clause is
belt-and-suspenders on top of that, not a replacement for it. A request
whose version doesn't match current is rejected with the server's current
row attached, so the client can resync and retry rather than guess what
changed.

A per-request idempotency ledger (`furniture_mutations`) gives repeated
edits of the same row the same "a retried request is a no-op, not a double
charge" guarantee `request_id` already gave the original purchase --- it
stores the exact response from the first successful attempt and replays it
verbatim, rather than re-running the version check against a row whose
version has since moved on.

Moving, rotating, storing, and retrieving a piece never touch Care Points.
Storing never refunds the original purchase price; retrieving never
charges anything, for anyone.

## Rationale

This keeps the same philosophy as ADR 001 --- the server is the one source
of truth, and a conflicting request is told so rather than silently
clobbering or being clobbered. Versioning scales that idea from "one new
row being created" to "an existing row with a history," without needing
locks, reservations, or anything a visitor could abandon mid-edit and leave
stuck.

## Costs

A visitor's Save can fail with "this changed since you last saw it" if
someone else edited, stored, or retrieved the same piece first; the edit
menu must show that clearly and refresh from the server's row rather than
leaving a stale draft on screen.

An extra `version` check and an extra idempotency table are more moving
parts than a naive "just update the row" implementation would need.

## Verification

Covered in `spec/furniture-edit.test.ts` and `spec/furniture-storage.test.ts`:

- A move or rotation with a stale version is rejected, and the current row
  is returned unchanged.
- Two simultaneous retrieval requests for the same stored piece: exactly
  one succeeds, the other is rejected, neither visitor's Care Points
  change, and the piece is never duplicated.
- Moving, rotating, storing, and retrieving never change any visitor's
  Care Points balance.
- A successful edit or storage change broadcasts to other connected
  visitors within about a second.

`spec/MANUAL.md` covers what the automated suite can't: that a moved,
rotated, or stored piece's new state survives a server restart.
