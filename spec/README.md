# The spec

The [final project brief](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/assessments/final-project/)
and its spec are on the course website, along with the specs for crits 8, 9 and
10, which run in this repo. The brief poses the problem; the spec is the fixed
contract.

## What ships

`invariants.test.ts` checks the two things the course relies on:

- `/` answers with a 200, which is what the deploy and the crit capture read
- `/readme/` publishes `README.md`. Markdown renderers all differ slightly, so
  it checks the README's headings rather than every word: each one has to
  appear, in order, in the HTML the server sends, since no script runs. Render
  it however you like, as long as it's there in full; the marker reads it there.

Both run against the **running** app over HTTP, so they hold whatever it's built
with. In CI that app is the image your `Dockerfile` builds, started with a
throwaway `/data`, and a red run blocks the deploy. Locally, start the app
however you run it and `pnpm check` finds it at `APP_URL` (default
`http://localhost:8080`). Keep them; don't delete them.

## Your checks

Everything else in `spec/` is yours to write. Any `spec/*.test.ts` runs with
`pnpm check`, against the same running app. Some lines of a spec only a person
can judge; those are left to the crit and the marker.

At a crit, a green `check` job is half the shipped mark, but it's never the
judgement of the work: your tutor checks what you deployed against the published
spec.

## Crit 9: real-time, Care Points, furniture

`care-points.test.ts`, `furniture-placement.test.ts`,
`furniture-concurrency.test.ts` and `reconnection.test.ts` cover the crit-9
scenarios over HTTP and WebSocket, reusing `ws-client.ts` (a small helper ---
Node's global `WebSocket` can't set a custom `Cookie` header on the
handshake, which these tests need to simulate a second visitor). Each
furniture test uses its own reserved region of the house's tile grid so they
don't collide with each other on the one shared running instance.

One crit-9 scenario --- furniture and Care Points surviving a server restart
--- is checked manually instead of automated; see `MANUAL.md` for why and the
procedure.

Furniture is permanent, same as flowers, and the house is a small fixed 10x8
tile grid --- so unlike the flowers tests (an effectively unbounded meadow),
running `pnpm check` many times in a row against the *same* local
`data/sanctuary.db` will eventually leave no free tile for these tests to use
(`findFreeTile` throws "the house is full" rather than failing silently).
CI never sees this (`--tmpfs /data` starts empty every run); locally, delete
`data/sanctuary.db` and restart the server for a clean slate.
