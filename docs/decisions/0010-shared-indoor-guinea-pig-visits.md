# 0010 — Shared indoor guinea-pig visits

Date: 2026-10-23

Status: Accepted

## Context

Guinea pigs should roam inside the shared shelter and completed buildings as well as the meadow. Their locations must agree across visitors, and adding interiors must not duplicate the named inhabitants.

## Decision

The server owns one location for each existing guinea pig. Entering a room without a guinea pig attracts one available meadow inhabitant, beginning at a clear spot near the entrance. Additional visitors see that same animal. A visit lasts 90 seconds before the animal returns to its meadow position; a later room entry can attract another visit. There are only four inhabitants: when all are visiting other rooms, an empty room waits for a future entry instead of creating another animal.

Indoor movement uses the existing timestamped movement messages, with an explicit room. Targets and entire walking segments stay inside the floor and clear furniture, including a margin for the animal's body. New furniture that blocks a route stops the walk; furniture placed over an animal moves it to the nearest clear spot. A completely obstructed room ends the visit. Movement and visits are ephemeral and reset on server restart; identities and feeding history remain persistent.

Clients render animals only in their current room. Nearby feeding works indoors using the same food, care rewards and transaction rules. The server verifies both room membership and proximity, so a meadow visitor cannot feed an animal inside a house.

## Validation

Unit checks cover wall margins, furniture-crossing paths, visits, roaming and return to the meadow. Two-browser checks cover shared indoor movement, feeding, cross-room denial and reload recovery.

## Trade-offs

Room transitions are immediate visits rather than animated walks through doorways. Indoor route selection considers clear straight segments, not a full pathfinding system; furniture arrangements can limit how far an animal wanders.
