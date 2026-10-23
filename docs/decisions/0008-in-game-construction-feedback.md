# ADR 008: In-Game Construction Controls and Shared Dust Feedback

## Status

Accepted — 2026-10-22. Extends ADRs 003, 004 and 006 without changing construction rewards or progress rules.

## Context

The construction panel appeared below the meadow, pulling attention away from the site. Other visitors also needed immediate visual feedback that someone was contributing, beyond a changing progress number.

## Options Considered

- Keep the below-game panel and numeric progress only: accessible, but spatially disconnected from the activity.
- Rebuild controls inside Phaser: integrates visually, but duplicates native button, layout and accessibility behavior.
- Place the React panel over the game and trigger a brief effect from accepted server contributions: retains native controls and makes activity visible in the shared world.

## Decision

Choose an HTML overlay inside the game container and an ephemeral server-triggered dust effect.

A nearby Build prompt, E key or nearby site click opens the project's React panel centered over the meadow. The panel is sized and scroll-limited to remain within the game area. Buttons remain native HTML controls. Pointer events on the panel do not refocus the movement container. It closes through its close button, Escape while focus is in the panel, or leaving the site's interaction range/room. Server-side proximity checks remain authoritative for every contribution.

After a successful, non-replayed contribution, the server broadcasts `construction-dust` with the project ID. Clients render a small group of pale dust puffs that rise and fade at that site. The initiating player and other outdoor visitors receive the same event. Failed requests, replayed contributions and periodic active-builder updates do not trigger new dust.

Dust is presentation only: it neither awards progress nor changes the cooperative multiplier. Each client throttles puffs per site to at most one burst every 180 ms, and particles expire after their short animation. Reduced-motion preferences suppress the effect. Scene shutdown removes event listeners so returning outdoors does not duplicate bursts. The effect is not persisted or replayed on reconnect; authoritative construction progress remains persistent and is reloaded normally.

## Rationale

Keeping controls in the meadow preserves context while retaining accessible HTML interaction. Emitting feedback only after server acceptance makes it evidence of a real contribution, rather than a local optimistic animation that could mislead other players.

## Consequences

The centered panel covers part of the meadow while open. Network latency delays the dust, and a disconnected or indoor visitor will not see a past burst. Throttling can combine the visual impression of rapid contributions; particles are not a counter of accepted actions. Reduced-motion visitors rely on the panel and shared progress instead.

## Verification

`browser/farm.spec.ts` performs a nearby build and checks that an independent second browser receives the construction-dust event. The multiplayer and scene-lifecycle browser checks cover room changes and reconnects. The event assertion verifies delivery, not the precise appearance of individual particles; visual appearance remains a manual check. Type checking and the production build passed after implementation, together with all five browser tests.
