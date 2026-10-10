# ADR 001: Concurrent Furniture Placement in Shared Houses

## Status

Proposed

## Context

Guinea Pig Sanctuary allows multiple visitors to decorate the same guinea pig house.

Each visitor earns and spends individual Care Points, but all furniture belongs to the shared sanctuary.

Because furniture occupies tiles, simultaneous placement requests may conflict.

The system must prevent overlapping furniture and avoid charging visitors for unsuccessful purchases.

## Options Considered

### Option A: Last Write Wins

The latest placement replaces an earlier conflicting placement.

This is simple but allows one visitor to erase another visitor's contribution.

### Option B: Temporary Tile Locks

Visitors reserve tiles before confirming furniture placement.

This provides advance conflict prevention but introduces lock expiration, abandoned reservations and additional synchronisation complexity.

### Option C: First Valid Placement Wins

The server processes placement requests atomically.

The first valid request succeeds. Later requests that conflict with occupied tiles are rejected without charging points.

## Decision

Choose Option C: First Valid Placement Wins.

The server is responsible for validating:
- Available Care Points.
- Room boundaries.
- Blocked tiles.
- Furniture footprints.
- Existing occupancy.

Validation, point deduction and furniture creation must happen in one database transaction.

After a successful transaction, the server broadcasts the new furniture state to connected visitors.

## Rationale

This approach preserves contributions rather than silently overwriting them.

It also supports the project's definition of good: visitors contribute to a shared world without owning its contents.

The decision prioritises predictable shared state over allowing every visitor's preferred placement to succeed.

## Costs

Visitors may be disappointed when another person occupies a location first.

The interface must explain rejected placements and refresh its preview when the shared layout changes.

Server-side transactions add implementation complexity compared with client-only placement.

## Verification

Test simultaneous overlapping requests from two independent visitors.

Verify:
- Exactly one conflicting placement succeeds.
- No overlap is persisted.
- Only the successful visitor is charged.
- Both clients converge on the same layout.
- The accepted placement survives a server restart.
