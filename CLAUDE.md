# Your harness

Rules for any agent (human-directed or autonomous) working on Guinea Pig
Sanctuary. They follow from `README.md`'s definition of good: small moments of
connection between strangers, without conversation, competition or commitment,
and a world that remembers its visitors without any one of them owning it.

## Product principle

Every feature must support at least one of:

1. meaningful co-presence (other visitors create possibilities that don't
   exist alone);
2. collective memory (the sanctuary visibly remembers who passed through);
3. interaction with the guinea pigs;
4. collective stewardship of the sanctuary.

Don't add a conventional game mechanic just because games normally have one.

## Never add without stopping to discuss it first

XP, levels, leaderboards, loot, daily rewards, streaks, combat, private
property, individual guinea pig ownership, social-media feeds, likes, follower
counts, mandatory accounts, complex inventories. If a feature seems to need one
of these, the feature is probably wrong, not the rule.

**Exception, discussed and approved 2026-10-10:** individual Care Points
(earned per visitor by feeding, server-authoritative, tracked via the existing
anonymous `visitor` cookie) and a small furniture shop that spends them. Care
Points are a personal tally of one visitor's own contribution, not a tradeable
currency; once placed, furniture is nobody's exclusive property — no
leaderboard, loot, streak, or XP system rides along with it.

## Guinea pigs are inhabitants, not pets

Never implement direct player control of a guinea pig. Players influence
behaviour through proximity, gestures, food and structures; the guinea pig
decides what it does. There's a small, persistent, named population (Huahua is
the first), not animals spawned per visitor or per session.

## One shared world

There is one canonical sanctuary. Never create a private instance of it per
visitor. All connected visitors observe the same persistent state.

## Nobody owns anything

Visitors leave traces; they don't claim territory. Don't assign exclusive
modification rights over a shared structure or location to whoever built it.

## The server is authoritative

Persistent shared state is validated and owned by the server. Never trust a
client-sent value for construction progress, unlocked areas, guinea pig state,
or whether a cooperative interaction succeeded. The client sends an intent
("I'm interacting with the bridge"); the server decides what happens.

## Interface

Prefer interacting with the world over menus. Avoid dashboard-style UI and
avoid exposing raw stats (no "Bean happiness: 72/100") --- communicate through
behaviour instead (Bean hides, Bean approaches, Bean sleeps nearby). The core
experience should be understandable without a tutorial modal.

Exception: a visitor's own Care Points balance may be shown as a plain number
--- it's the one stat that's actually about the visitor, not the guinea pig,
and the shop can't work without it.

**Exception, discussed and approved 2026-10-11:** the cooperative
house-construction minigame may show shared construction progress (percent
toward completion), how many visitors are building together right now, and
the resulting teamwork multiplier. These describe the shared project the
whole sanctuary is building, not any one visitor or the guinea pigs ---
the multiplier exists specifically to make "more people helping, right now,
makes this faster" visible, which it can't teach while hidden. No ranking,
leaderboard, or per-visitor comparison rides along with it.

## Persistence

If an interaction is presented to the visitor as permanent, it must actually
survive a browser refresh, a reconnect, an app restart, and a redeploy where
the Fly volume persists. Never fake shared-world persistence with
browser-local storage.

## Scope

Before adding a system, ask: does the existing experience require this to
become meaningfully better? If not, don't add it yet. Prefer improving one
interaction over adding three new ones. Don't add a dependency unless it
clearly removes more complexity than it adds --- the deployment has to keep
fitting on one small Fly machine.

## Accessibility

Don't make essential information depend solely on colour or solely on sound.
Controls should be keyboard-operable where practical. Respect reduced-motion
preferences for animation that isn't load-bearing.

## Social gestures
Wave and help gestures are temporary presence, not permanent contributions. Sitting ends on movement, room changes or disconnect. Validate gestures on the server and never accept a client-supplied target identity or duration. Keep gesture meaning readable without relying on animation, colour or sound.

## Furniture and animal behaviour
Furniture use is chosen by the server, never commanded by visitors. Only the furnishing being used may be traversed; walls and other furnishings remain obstacles. Moving, rotating or storing it cancels use safely. Broadcast activity with animal movement and include it in reconnect snapshots. Activity is temporary; shared furniture remains persistent.

## Visitor names
Display names are optional and never a login: always allow skipping, store them server-side against the signed anonymous visitor cookie, and only ever let a visitor set their own name (never a client-supplied id). Sanitise and length-limit on the server. A name is a label, not a profile --- no avatars, bios, follower counts or name-based ranking.

## Campfire and radio
Seats are temporary presence owned by the server: it checks proximity and that the seat is free, and releases it on movement, standing, room change or disconnect. The music queue is server-owned and ordered; enforce one waiting track per signed visitor identity, not per tab, and verify ownership and proximity for skips. Mute, volume and distance fade are local to each listener and never sent to the server. Only accept HTTPS links from recognised YouTube hosts; no downloading or audio extraction.

## Cooperative carrot
Count distinct signed visitor identities, not browser tabs, for the giant carrot. Both must remain connected and nearby in the meadow throughout the pull; prune expired or absent participants before awarding progress. Reset unfinished progress when fewer than two remain. The server owns time, participants, round and reward. Commit each harvest, regrowth deadline and three public carrot portions in one database transaction. Reject stale rounds; no personal points or exclusive harvest rights. Carrots cannot be planted in the ordinary solo garden.
