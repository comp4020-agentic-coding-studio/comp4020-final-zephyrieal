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
