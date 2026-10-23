# 0012 — A carrot that needs two visitors

Date: 2026-10-24

Status: Accepted. Extends ADRs 006, 007 and 011.

## Context

Gestures allow visitors to acknowledge one another, but existing construction only becomes faster with company. The sanctuary needs a short encounter that makes a second person necessary and gives Help here a purpose. It must remain repeatable after the showcase's first group finishes it.

## Decision

Place one giant carrot in the shared meadow. A nearby connected visitor chooses Pull together, becoming ready for up to 15 seconds. Two distinct signed visitor identities must remain within 58 world units of the carrot for three seconds. The server validates each participating avatar through its owner's open socket. Multiple tabs sharing one identity count once. Separate anonymous browser identities count as separate visitors, consistent with the existing identity model; this is not proof of distinct humans.

Participation ends on cancellation, expiry, departure, room change or disconnect. Progress resets when fewer than two valid participants remain. The server ticks every 100 milliseconds and caps credited time per tick, so a stalled event loop cannot turn a long pause into an immediate harvest. Readiness and unfinished progress are temporary and reset on restart.

On completion, one SQLite transaction advances the round, records the harvest and next growth deadline, and adds three carrot portions to the public pantry. The next carrot becomes available after 30 seconds, including across restarts. Requests carry the round they refer to; stale requests cannot participate in the next harvest. No personal reward or exclusive harvesting right is granted.

Carrots appear in the existing feeding menu and follow its shared-food and server-chosen reward rules. They cannot be planted in the ordinary garden: obtaining them is the cooperative interaction. Existing solo farming remains available.

Visitors see the carrot, readiness, pulling progress and the shared result in the world. A native button supports pointer, touch and keyboard use without requiring a held input. Help here remains an optional invitation. The caption has an explicit line height to avoid inheriting the canvas container's zero line height. Growth displays use server time plus elapsed client time rather than trusting the visitor's clock.

## Alternatives and trade-offs

A construction multiplier permits solo completion and does not meet this interaction's purpose. A one-time unlock would leave later visitors without the encounter. A hold-to-pull input would require more input and disconnect handling; timed readiness keeps the action accessible, at the cost of less physical expressiveness. A persistent partial pull would let people contribute at different times rather than requiring co-presence.

The visual is a small native drawing, not a new image asset. Pulling currently has a live progress caption rather than bespoke character animations. Solo visitors can invite help but cannot harvest the giant carrot alone; ordinary feeding and gardening remain usable. A visitor can create another anonymous browser identity, so the rule enforces distinct identities rather than preventing determined self-cooperation.

## Checks

`spec/carrot.test.ts` checks that two tabs of one identity cannot complete a pull; distinct identities award food once; stale requests and early regrowth requests are rejected; departures and expired readiness reset progress; forged avatars and indoor participation are rejected; cancellation removes readiness; a database reopen retains food and growth state; and solo carrot planting is rejected.

`browser/carrot.spec.ts` checks two independent browsers walking to the carrot, shared readiness within about a second, no solo harvest, shared pulling progress, exactly three new pantry portions, the result after reload, a readable caption height and absence of browser errors. The check runs against a separate test database. Existing farming tests cover compatibility with solo garden actions.

Whether visitors naturally invite strangers and understand the reward still needs observation with classmates using only the URL.
