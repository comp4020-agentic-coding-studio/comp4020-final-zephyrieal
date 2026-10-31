# Process overview

## Purpose

I am building Guinea Pig Sanctuary as a small place where strangers can spend time together without needing to start a conversation. Visitors share a meadow, feed its inhabitants, grow food and furnish communal interiors. My intended audience is a handful of people, particularly classmates using the site together during the showcase.

Meeting the brief’s technical requirements would not necessarily make the sanctuary worth visiting. I wanted another person’s presence to change the experience. My definition of good is therefore small moments of connection without competition, ownership or an expectation of continued participation. This became the basis for deciding which features belonged in the project. Two things pulled me toward this: the appeal of caring for something living with no win condition attached, and the appeal of enjoying the same space with others.

I was inspired by Sky: Children of the Light for expressions between players. I was interested in how a simple acknowledgement could begin an interaction without requiring text chat. I adapted this into three actions: waving, sitting and asking for help. The intention is to give visitors enough expression to recognize each other.

Parimal Satyal’s *Rediscovering the Small Web*, discussed in my README, informed the project’s deliberately limited audience. The sanctuary does not need a large population to justify its existence. A short encounter between a few visitors is enough.

These references helped me draw the harness in CLAUDE.md. Private animal ownership, leaderboards, daily rewards and individual territory would encourage a different relationship with the sanctuary. Instead, visitors contribute to a place that remains available to everyone. 

## Meaningful Co-presence

I realized that sharing state did not necessarily give visitors a reason to interact. Feeding, gardening and furniture placement gave multiple visitors things to do in the same environment, but each could be performed entirely alone. Construction went one step further: more simultaneous builders raise the progress rate, but a single visitor can still finish any project alone (see ADR 003's choice of “solo allowed, with a cooperative bonus” over a mandatory-multiplayer alternative that was rejected specifically for making a persistent feature depend on timing a visit to match a stranger’s).

Hence, I added a smaller interaction which required co-operation (ADR 12): a giant carrot that requires two distinct visitors to pull together. They must stay nearby together for the pull to make any progress at all; the moment fewer than two remain, progress resets to zero. Completing the action adds three carrot portions to the public pantry. The reward belongs to the sanctuary rather than either participant, connecting cooperation to the existing feeding system. The carrot regrows so later visitors can experience the encounter too.

This still has a limit: the identity model counts distinct signed anonymous identities, not distinct humans. A determined player could open a second browser profile and satisfy the rule.

Furniture itself tells a smaller version of the same story. Placing a hay bed or hideout originally only changed how a room looked; it had no consequence for the guinea pigs living in it. Autonomous furniture use (ADR 11) gives those placements a visible effect: Guinea pigs can approach hay beds, hideouts and tunnels during indoor visits. This gives furnishing a consequence beyond decoration. The animals remain autonomous: visitors arrange an environment that they may use, rather than directly commanding them. The server alone decides whether, when and which furnishing an inhabitant uses; a visitor who places a hay bed has changed what’s possible for the guinea pigs, not given them an instruction. This follows directly from CLAUDE.md’s rule that guinea pigs are inhabitants.

## Current Stack

The first version prioritized one persistent interaction with a small server. As the sanctuary gained movement, interiors and furniture placement, the client changed to React and Phaser. React provides browser controls and menus; Phaser handles the spatial world. Their separation introduces coordination and scene-lifecycle problems, including stale references and event listeners. 

The server runs TypeScript directly on Node 24 with Express. Vite builds the client separately; the final image serves those static assets and installs the server’s runtime dependencies. HTTP handles persistent actions, while WebSockets carry live updates and movement or gesture intents.

SQLite stores durable state on the Fly volume without a separate database service. This suits one small authoritative machine, but scaling beyond it would require architectural changes. Presence and unfinished interactions remain temporary; furniture, food and completed contributions persist. That distinction keeps recovery focused on promises made to visitors.

| Part | Why it is used | Cost or limitation |
|---|---|---|
| React | Browser controls, menus and interface state | Must stay coordinated with Phaser scenes --- a Scene instance surviving a stop/start cycle with a stale reference or a leaked cross-scene listener is a real bug class this project hit twice |
| Phaser | Spatial world, sprites and movement | Scene lifecycle and cleanup require care for the same reason |
| Node/Express | Validates every action and owns all shared state | One authoritative process --- concurrent writes are resolved by Node's single-threaded event loop alone, with no application-level locking, which only works because there's one process |
| WebSockets | Sends live updates and receives movement/gesture intents | Reconnection and temporary presence need explicit handling --- a reconnecting client re-fetches `/api/state` rather than relying on any socket-level resume, and presence, gestures and carrot readiness are all deliberately in-memory, not persisted |
| SQLite on the Fly volume | Durable state without running a separate database service | Designed around the single-machine deployment --- one file, one volume, no path to scaling past one machine |

Each of these costs was paid deliberately rather than discovered late: the single-process/single-file design was chosen at the very start specifically because the brief's “handful of people” framing didn't need more.

## Directing and correcting agent work

I used Claude Code and ChatGPT to inspect the implementation, propose changes and implement features incrementally. My role was to keep those changes connected to the brief and the sanctuary’s purpose. For example, I redirected the discussion toward meaningful co-presence rather than simply adding more activities or locations. The repository’s harness expresses that direction in three places. README.md explains what good means. CLAUDE.md translates that argument into implementation rules, including shared ownership, server authority and autonomous inhabitants. 

I expected the carrot's progress caption to render like every other text overlay in the game, since it used the same positioning pattern as the farm and furniture bubbles. The evidence it didn't came from checking thecarrot encounter in a real browser rather than trusting the component in isolation: the caption rendered at close to zero height, with its text
clipped rather than readable. The cause was `.game-container`'s own
`line-height: 0` --- set deliberately to remove the canvas element's
default inline baseline gap --- which the caption inherited, since nothing
in `.carrot-caption` overrode it.

The fix was a one-line CSS change, giving `.carrot-caption` its own
explicit `line-height`. What made this a correction to the workflow rather
than a one-off patch is where it landed: `browser/carrot.spec.ts` now
asserts the caption's rendered height is greater than 20px, so a future
change that reintroduces the inherited zero line-height fails a real
check, not just a visual inspection I might skip. The decision and its
reasoning are also recorded in ADR 0012, so the next feature that adds a
text overlay inside `.game-container` has a documented reason to check
this.

## Evidence, Verification, and Limitations

Automated checks cover shared updates, invalid actions, concurrent mutations and recovery. Carrot tests verify that same-identity tabs cannot satisfy cooperation, departure resets progress, and completed rewards and regrowth deadlines survive a database reopen. Construction and farming use request IDs to prevent duplicate outcomes; the carrot uses a versioned round and atomic reward transaction. Browser checks exercise interaction through real controls and independent sessions.

The crit 11 classmate testing session provided a different kind of evidence. The recorded successful scenarios included distinct visitors, shared furniture and construction updates, late-joining state, returning identity and recovery after a restart. The session record should identify the six successful scenarios individually. Two planned scenarios: competing simultaneous actions and isolated room joins, had no recorded outcome and are not reported as passes.

Note that all testings above can establish whether visitors feel connected or understand an invitation. The next question is whether someone discovers the carrot and invites another visitor without explanation. Observation should record whether people notice each other, respond to “Help here” and understand the shared reward before interpreting what those actions mean.
