# ADR 009: Separate Shared Interiors for Completed Buildings

## Status

Accepted — 2026-10-22. Extends ADRs 004, 006 and 007.

## Context

Completed structures should be enterable, and multiple buildings should not lead to the same furniture layout or visitor group. The existing shelter and its furniture must remain usable.

## Decision

Give the guinea pig house, toolshed, greenhouse and great hall distinct public room IDs. The bridge stays outdoors. Each building becomes enterable when its shared construction is completed. Entry uses an authenticated avatar and a server check of construction status and distance to the building. Movement messages cannot switch an avatar into or out of these interiors; an explicit room transition is required. Leaving places the avatar beside that building.

Reuse the indoor scene and layout with a room title, rather than creating separate copies of the scene implementation. Presence is filtered by room, so visitors in the same building see one another and visitors in different buildings do not.

Furniture gains a persistent `room_id`. Existing furniture migrates to the original shared shelter (`indoor`). Placement occupancy checks, state loading, storage and editing use the room ID. A connected avatar may decorate only its current interior; item mutations targeting another room are rejected. No room or furniture belongs to a visitor. Anyone entering the same room can use its shared furniture and storage.

The original shelter remains accessible through the existing navigation. Legacy requests without an avatar header retain access to that original shelter only; they cannot target a completed building's furniture. Disconnected avatars are transient: reconnecting from a building returns the visitor to the meadow rather than assuming a stale room authorization.

## Alternatives and consequences

A single interior would conflate independent buildings. Separate scene implementations would duplicate controls and furniture logic. Reusing the scene with a room identity gives separate shared state without private instances. Interiors currently share a floor plan and decorating catalog; differentiated layouts can follow separately. The entry and room-scoped checks run server-side, but this does not add ownership or hide publicly readable room layouts.

## Verification

`browser/y-building-rooms.spec.ts`, using an explicitly supplied disposable database, checks nearby completed-building entry, denial of remote entry, separate presence and furniture, cross-room mutation rejection, return beside the entrance and two visitors joining the same room. Existing furniture and multiplayer regression tests cover compatibility with the original shelter.
