# ADR 007: Server-Authoritative Playable Visitor Presence

## Status

Accepted — 2026-10-22. Builds on ADR 005's signed anonymous identity.

## Context

Visitors could change shared state but could not see each other moving through the sanctuary. We needed controllable characters, a consistent view of other visitors and trustworthy positions for nearby interactions.

## Options Considered

- Broadcast client-reported positions: straightforward, but clients could teleport or invent speed.
- Persist every position in SQLite: durable, but adds writes for transient movement and leaves a cleanup problem for departed visitors.
- Simulate directional input on the server and keep presence in memory: authoritative movement without turning a visit into permanent world state.

## Decision

Choose server-authoritative, in-memory presence over the existing WebSocket connection.

Each authenticated connection gets a public random avatar ID independent of its signed cookie. One connected tab represents one avatar; multiple tabs may share the same visitor identity and Care Points. Public snapshots expose the avatar ID, room, position and visual presence attributes, not the signed cookie. Construction's distinct-builder count continues to use visitor identity, not avatar count.

Clients send direction and room intent. The server validates finite bounded direction values, ignores client position/speed claims, normalizes diagonal input, clamps movement to room boundaries and simulates at 20 Hz with a speed of 120 logical pixels per second. Input expires after 350 ms, and more than 60 input messages per second per connection are ignored. Changed snapshots broadcast to connected clients.

WASD, arrow keys and on-screen direction buttons control movement. Keyboard movement requires game focus. Blur and visibility changes clear held input; the server lease also prevents a missing release from causing indefinite walking. Clients interpolate snapshots for smooth display and render visitors in the current room. Reduced-motion preferences remove cosmetic interpolation/bobbing.

Leaving removes the avatar. Heartbeats remove dead connections. Reconnection creates a new avatar and reloads persistent sanctuary state; it does not restore a saved position. Room changes use existing indoor/outdoor navigation and server-defined spawn positions. Continuous position updates are not written to the action log; connection lifecycle remains logged.

## Rationale

A single authority makes movement consistent across browsers and provides usable evidence for ADR 006's proximity checks. Ephemeral presence matches the distinction between visitors passing through and lasting contributions such as crops, feeding and construction.

## Consequences

Movement depends on the server and can lag under poor connectivity. Rooms have bounds rather than full object collision or pathfinding, and navigation is not a doorway-proximity system. Presence lives in one server process; multiple replicas would need shared routing or a coordinated presence service. Anonymous browser identity still does not prove one human per visitor. Disconnecting removes presence but does not erase persistent contributions.

## Verification

`spec/presence.test.ts` covers movement and multiplayer presence rules. `browser/multiplayer.spec.ts` checks two independent visitors observing movement, stopping, room changes, reconnection and departure without ghost avatars. `spec/nearby-client.ts` walks real authenticated avatars for interaction tests rather than adding a teleport bypass.
