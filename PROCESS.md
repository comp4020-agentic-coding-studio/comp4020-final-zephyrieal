# Process overview

## Purpose

Hayhaven is a small shared world where visitors care for guinea pigs, grow food, furnish communal interiors and gather around a campfire. My audience is a handful of people, particularly classmates at the showcase. I interpreted “good” as small moments of connection without demanding conversation, competition or continued participation.

I was inspired by *Sky: Children of the Light* for informed expressions between visitors and Parimal Satyal’s *Rediscovering the Small Web* informed the deliberately small audience. [README.md](README.md) develops these references. I translated that direction into [CLAUDE.md](CLAUDE.md): shared ownership, autonomous inhabitants and one authoritative world, rather than private animals, leaderboards or individual territory ([da74a37](https://github.com/comp4020-agentic-coding-studio/comp4020-final-zephyrieal/commit/da74a37)).

## Meaningful co-presence

Sharing state did not necessarily create interaction. Feeding, gardening and furnishing could happen alone. Construction rewards simultaneous help but remains achievable alone, avoiding a permanent feature that depends on meeting a stranger ([ADR 0003](docs/decisions/0003-construction-concurrency.md)).

I therefore added a smaller encounter requiring cooperation: two distinct nearby visitor identities must pull a giant carrot together. Progress resets when fewer than two remain. Completion adds three portions to the public pantry, connecting cooperation to shared feeding rather than private rewards ([8263f29](https://github.com/comp4020-agentic-coding-studio/comp4020-final-zephyrieal/commit/8263f29), [ADR 0012](docs/decisions/0012-cooperative-carrot.md)).

Furniture also gained consequences beyond decoration. Guinea pigs autonomously approach hay beds, hideouts and tunnels; visitors arrange possibilities rather than command animals ([baf739a](https://github.com/comp4020-agentic-coding-studio/comp4020-final-zephyrieal/commit/baf739a), [ADR 0011](docs/decisions/0011-social-encounters-and-furniture-behaviour.md)). Wave and Help here support acknowledgement without typing ([fec57d1](https://github.com/comp4020-agentic-coding-studio/comp4020-final-zephyrieal/commit/fec57d1)).

Campfire chat introduced optional conversation tied to one place. Visitors can still explore, care for animals or sit silently. The server determines the audience from avatar positions; leaving stops delivery and disables sending without automatically sending a draft. Whether silence remains comfortable requires observation ([ADR 0014](docs/decisions/0014-campfire-public-chat.md)).

## Stack choices and trade-offs

The initial Node, Express and SQLite stack established persistence before adding a complex client. Node 24 runs TypeScript directly, and built-in SQLite avoids another native database dependency. This suited the course’s one-machine, 256 MB deployment with a persistent volume ([Dockerfile](Dockerfile), [fly.toml](fly.toml), [historical stack account](https://github.com/comp4020-agentic-coding-studio/comp4020-final-zephyrieal/blob/0ae7cbe/PROCESS.md)).

Movement, interiors and furniture placement led to a React/Phaser client ([3740fb9](https://github.com/comp4020-agentic-coding-studio/comp4020-final-zephyrieal/commit/3740fb9)). React handles browser controls; Phaser handles the spatial world. Vite adds a client build step while the server runs directly from source. This division costs coordination around scenes, event listeners and focus; scene-lifecycle failures required explicit browser checks ([8d02e46](https://github.com/comp4020-agentic-coding-studio/comp4020-final-zephyrieal/commit/8d02e46)).

HTTP handles persistent actions; WebSockets carry updates and movement, gesture and chat intents. WebSockets fit bidirectional traffic over one connection. Server-sent events would need a separate upstream path, while polling would repeatedly request updates and make latency depend on the interval. The cost is explicit reconnection and presence cleanup ([ADR 0007](docs/decisions/0007-authoritative-multiplayer-presence.md), [reconnection checks](spec/reconnection.test.ts)).

SQLite avoids a separate database service. Furniture, food, construction, names, blocks and reports persist; presence, unfinished pulls, seats, music queues and general chat history remain temporary ([database](src/server/db.ts), [names](src/server/names.ts), [chat](src/server/chat.ts), [ADR 0013](docs/decisions/0013-campfire-game-window-and-shared-music.md)). Synchronous validation and writes resolve conflicting furniture placements within one process, not across machines ([ADR 0001](docs/decisions/0001-concurrent-furniture-placement.md)). Testing exposed different saved state across server machines, so scaling requires shared storage and live-state coordination ([test report](docs/testing/multi-user-test-report.md)).

## Directing and correcting agent work

I used ChatGPT to explore ideas and asset design, and Claude Code to implement repository changes. The obvious alternative was one agent for both; I split them because ChatGPT’s image generation suited the artwork better. The cost was carrying context between tools: ideas needed reconciliation with current code and constraints. README.md and CLAUDE.md provided reference points, but I still reviewed whether changes followed them.

The harness evolved through explicit exceptions. Care Points permitted personal contribution balances while furniture remained shared ([8cb1430](https://github.com/comp4020-agentic-coding-studio/comp4020-final-zephyrieal/commit/8cb1430)). Construction permitted progress and teamwork displays despite the general restriction on raw statistics ([f96b564](https://github.com/comp4020-agentic-coding-studio/comp4020-final-zephyrieal/commit/f96b564)). These revisions made changed boundaries available to later agent work.

Campfire chat exposed inconsistent written direction: “without conversation” no longer matched the intended experience. I changed it to “without demanding conversation” ([595ea75](https://github.com/comp4020-agentic-coding-studio/comp4020-final-zephyrieal/commit/595ea75)) and recorded a bounded exception ([9675230](https://github.com/comp4020-agentic-coding-studio/comp4020-final-zephyrieal/commit/9675230)). I rejected the broader friendship and private-messaging proposal, retaining public campfire chat. This discarded direction, rather than discarded implementation, is documented with its alternatives and costs in [ADR 0014](docs/decisions/0014-campfire-public-chat.md).

Before accepting changes, I checked behaviour against the intended interaction. During week 12 playtesting, classmates discovered that mouse interactions left keyboard focus outside the game, so movement required another click. The fix returned focus after world-action button clicks, and a browser regression test checks that movement works immediately after feeding without another canvas click ([2f8f143](https://github.com/comp4020-agentic-coding-studio/comp4020-final-zephyrieal/commit/2f8f143cffbdd8ce66635783c581231ec525cc06), [interaction-focus test](browser/interaction-focus.spec.ts)). This gave a concrete acceptance check beyond the agent’s description.

## Evidence, verification and limitations

The music queue illustrates another boundary: server-owned ordering and start times do not guarantee synchronised listening. YouTube ads, buffering and autoplay restrictions can differ between visitors. The queue remains a labelled prototype, and simulated-player checks cannot establish availability or timing for arbitrary real videos ([ADR 0013](docs/decisions/0013-campfire-game-window-and-shared-music.md)). Similarly, two signed visitor identities establish the carrot’s technical cooperation rule, but do not prove that two different humans participated ([ADR 0012](docs/decisions/0012-cooperative-carrot.md)).

[Carrot tests](spec/carrot.test.ts) check identity rules, departure resets and persistent rewards after database reopening. [Construction](spec/construction.test.ts) and [farm tests](spec/farm.test.ts) cover shared mutations. These establish specific behaviours, not social connection.

Chat checks cover membership, limits across tabs, persistent blocks and server-held report context ([unit tests](spec/campfire-chat.test.ts)). [Live-socket tests](spec/campfire-chat-live.test.ts) check delivery boundaries; [browser checks](browser/campfire-chat.spec.ts) exercise drafts, typing and blocking. Reports are stored, but there is no moderator interface yet, so reporting is not evidence of an effective moderation response.

The [week 11 report](docs/testing/multi-user-test-report.md) records visitor identification, shared updates, conflicting actions, late joins and returning identity. It also records inconsistent multi-machine state and updates resuming after restart, including actions attempted during interruption. These are observations from that session, not guarantees under every failure condition. Further observation should assess whether visitors discover the carrot, understand Help here and feel comfortable participating silently.
