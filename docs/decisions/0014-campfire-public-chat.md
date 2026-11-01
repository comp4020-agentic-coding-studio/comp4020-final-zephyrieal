# 0014 — Public text chat at the campfire only

Date: 2026-11-01

Status: Accepted (first version; playtest before extending)

Extends ADRs 005 (visitor identity), 007 (authoritative presence) and 013 (campfire gathering). Reverses ADR 013's note that the campfire does not introduce text chat, for the campfire area only.

## Context

A "Campfire and Friendship Chat" plan proposed three phases: public chat at the campfire, mutual friend requests, and private friend messaging anywhere on the map. The README's definition of good is "small moments of connection between strangers **without demanding conversation**". CLAUDE.md also lists social-media feeds and follower counts as things to discuss before adding. A persistent friend list with online status and private messages is close to both. Public chat tied to one place is easier to reconcile: it is co-presence (principle 1), since you can only talk to the people sitting at the same fire.

## Decision

Build **only the public campfire chat**. Friendships, friend requests and private messages are deliberately out of scope.

- **Area, not distance between players.** Membership is a fixed circle around the fire (enter at 170 px, leave at 210 px). The buffer stops visitors flickering in and out at the edge. Indoors never counts. The server recomputes membership every presence tick from its own avatar positions.
- **Delivery at send time.** A message reaches the sockets inside the area when the server accepts it, sender included. Visitors arriving later see only messages sent after they joined. Messages are not stored. The server keeps the last 100 in memory so blocks and reports can refer to them.
- **Never re-route a draft.** There is only one destination. Leaving disables sending and keeps the draft and this visit's history, with "Return to the campfire to send." The server checks the live position again on send, so a message sent just after crossing the edge is refused and put back in the box, not delivered.
- **Quiet arrival.** Only the visitor themselves sees "You joined campfire chat"; there are no public join or leave announcements. The panel header shows "Campfire chat · N nearby".
- **Controls.** Every message from someone else has a ⋯ menu:
  - **Mute** is local to this page for this visit.
  - **Block** is stored server-side against the signed visitor identity. It hides messages in both directions, across every tab, and survives reconnects and restarts. It can be undone from "Muted and blocked".
  - **Report** stores the reason plus the server's own copy of the last six messages up to the reported one.
- **Limits.** 200 characters, single line. Five messages per 10 s with a 600 ms minimum gap, per signed visitor identity (shared across tabs). Ten block or report actions per minute.
- **Typing never moves the avatar.** Movement and E already require focus on the game container. Esc in the chat returns focus to the game.

## Alternatives

- **Preset phrases only** (Sky-style): closest to the README, no moderation needs, but much less expressive. Still a reasonable fallback if free text goes badly in playtests.
- **The full friendship plan**: needs a dated CLAUDE.md exception, persistent social graphs and offline/online presence. Deferred until playtests show whether campfire conversations actually happen.

## Limits

- Reports are only stored (`chat_reports`). There is no moderator view yet.
- The name shown is the visitor's display name or `Visitor xxxx`. Display names are not unique.
- In-memory message ids reset on restart, so a block or report can only target messages from the current server run.

## Validation

`spec/campfire-chat.test.ts` covers area membership and the buffer, stale-position sends, length and rate limits across tabs, two-way blocks that persist across a restart, and reports holding server-side context. `spec/campfire-chat-live.test.ts` uses real sockets against the running server: a visitor outside the area receives nothing and is refused, and delivery stops after walking away. `browser/campfire-chat.spec.ts` covers the audience label and nearby count, typing WASD without moving, drafts kept but not sent after leaving, sending after returning, blocking that persists across reload, and Esc returning focus.
