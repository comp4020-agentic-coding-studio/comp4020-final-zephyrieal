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

XP, levels, leaderboards, currency, shops, loot, daily rewards, streaks,
combat, private property, individual guinea pig ownership, social-media feeds,
likes, follower counts, mandatory accounts, complex inventories. If a feature
seems to need one of these, the feature is probably wrong, not the rule.

## Guinea pigs are inhabitants, not pets

Never implement direct player control of a guinea pig. Players influence
behaviour through proximity, gestures, food and structures; the guinea pig
decides what it does. There's a small, persistent, named population (Potato is
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
