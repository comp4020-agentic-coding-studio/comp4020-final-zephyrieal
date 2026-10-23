# 0011 — Social encounters and autonomous furniture use

Date: 2026-10-23

Status: Accepted

Extends ADRs 007 (visitor presence), 009 (shared interiors) and 010 (indoor guinea-pig visits). ADRs 001–010 retain the decisions for the earlier sanctuary systems; this record brings together the changes in this round of development.

## Context

The brief requires distinguishable visitors acting on shared state, updates visible within about a second, and changes that survive sessions, restarts and redeploys. It also asks for an experience made more interesting by people being present together.

The sanctuary's definition of good is small moments of connection between strangers without requiring conversation, competition or commitment. It already has shared farming, construction, furniture and live visitor movement. Those systems establish a shared world, but movement alone gives visitors little way to acknowledge one another. Furniture also needs a visible consequence for the inhabitants, beyond changing a room's appearance.

The design reference is Sky: Children of the Light, particularly encounters through movement and expressions, discussed in README.md. We adapt that principle to one small sanctuary: visitors can acknowledge each other, invite help and observe animals responding to the environment they collectively furnish. This is a design motivation, not evidence that the implemented interactions already create connection.

## Decision

### One shared population across meadow and interiors

Retain ADR 010's server-owned location for each of the four named guinea pigs. Entering an empty interior can attract one available inhabitant for a 90-second visit. Other visitors see the same animal; entering another room does not create a duplicate. Feeding requires the visitor and animal to be nearby in the same room.

Indoor visits, positions and activities are temporary. Furniture, food, construction and feeding records remain persistent under their existing rules. We do not persist a fleeting pose or imply that an animal will remain in the same place after a restart.

### Small, temporary social gestures

Add Wave, Sit and Help here buttons alongside movement controls. The server accepts a gesture intent for the sending socket's own avatar, validates it against the supported gestures and controls its duration. A client cannot choose another avatar or supply its own duration. Gestures use the existing WebSocket presence snapshots rather than adding another transport or database table.

Wave and Help here expire after three seconds. Sit remains until the visitor toggles it off, moves, changes rooms, selects another gesture or disconnects. Repeated gesture changes have an 800-millisecond minimum interval, in addition to the existing presence message limit. Gestures carry no Care Points reward or persistent record.

Visitors render gesture labels above avatars in their own room. Sitting also reduces the displayed avatar height; it does not yet use dedicated sitting artwork. The buttons work with pointer or keyboard input and are disabled while disconnected. Meaning remains readable without relying on sound, colour or animation.

Help here is an invitation rather than a command: it does not target an object, force another visitor to participate or complete an interaction automatically.

### Furniture influences autonomous animal choices

During an indoor visit, an animal can choose a reachable hay bed, hideout or tunnel instead of an ordinary wandering destination. The server selects the furnishing and owns the approach, use and departure phases. Visitors cannot directly command the animal.

At an eligible choice, there is a 65 percent chance of considering furniture. The animal approaches the centre of a suitable item, uses it for six seconds and then returns to clear floor. After leaving, an eight-second cooldown allows ordinary wandering before another furniture choice. The 90-second room visit can still end during any phase.

A hay bed produces a resting activity, a hideout a hiding activity and a tunnel an exploring activity. Clients show a short activity label; hiding reduces the animal's opacity and resting places its sprite above the furnishing. The tunnel currently uses the same approach-and-pause sequence, rather than a dedicated end-to-end traversal animation.

Only the furnishing being used is excluded from collision checks. Walls and other furniture remain obstacles. A candidate needs a clear straight approach and a clear route back to ordinary floor. If the selected item's identity, position, dimensions, rotation or version changes, its use is cancelled. Existing recovery moves an obstructed animal to clear floor or ends the visit if no clear floor remains.

Activity travels with the existing timestamped animal movement messages and appears in state snapshots, so connected and returning visitors receive the same server-owned activity. No new persistence system, dependency, ownership rule or personal progression system is introduced.

## Alternatives and trade-offs

- Text chat would offer more expression but would add moderation and interface scope. Three gestures support acknowledgement and invitations with a smaller social vocabulary.
- Client-only gestures or animal choices would be simpler locally but could disagree across browsers. Existing server-owned presence and movement keep encounters consistent.
- Direct commands to use furniture would make demonstrations predictable but conflict with the rule that guinea pigs are inhabitants with their own behaviour.
- Full pathfinding and bespoke animations would permit richer furniture use. Clear straight segments and labelled activities reuse the existing movement system, at the cost of inaccessible furniture in some layouts and simplified poses.
- Persisting activities would add recovery complexity without a lasting contribution worth remembering. The furnishing is the durable trace; its current use is temporary.

These additions make social expression and collective care more visible. They do not establish an interaction that requires two distinct visitors: construction remains faster with company, while a two-person carrot interaction and collective quiet-sitting behaviour are still proposals.

## Validation and limits

Enforced checks:

- `spec/gestures.test.ts`: a gesture affects only its sender, transient gestures expire using server time, neutral movement input preserves sitting, movement and room changes end it, invalid gestures are rejected, repeated changes are limited and disconnect removes the avatar.
- `spec/presence.test.ts`: existing movement authority and real-socket presence regression coverage.
- `browser/gestures.spec.ts`: two browser sessions observe wave, help and sit within one second; transient labels expire and walking ends sitting.
- `spec/furniture-behaviour.test.ts`: all three furniture kinds produce their expected activity, snapshots expose the current activity, animals leave to clear floor and storing furniture clears activity.
- `spec/indoor-guinea-pigs.test.ts`: existing wall, furniture-path, shared-visit and return checks.
- `browser/indoor-guinea-pigs.spec.ts`: shared indoor animals, same-room feeding, cross-room denial and reload recovery. Optional access in polling predicates allows initial state to arrive before assertions evaluate it.

Type checking passed. The gesture/presence run passed eight tests; the furniture/animal run passed eleven tests. Both browser checks passed. The indoor browser check passed against a fresh preview after the existing preview returned missing client state during polling. This browser regression checks indoor sharing and feeding; it does not directly validate every furniture pose or cancellation case.

Whether visitors notice gestures, respond to invitations or interpret furniture use as collective care remains a playtesting question. These outcomes have not been demonstrated by the automated checks. Observe classmates using only the URL and record what they notice, without coaching them through the encounter.

## Implementation record

- `963d3d4` — shared indoor guinea-pig visits, wandering and room-checked feeding, detailed in ADR 010.
- `fec57d1` — shared wave, sit and help gestures, documentation and checks.
- `baf739a` — autonomous furniture use, activity rendering, documentation and checks.

README.md describes the resulting visitor experience. CLAUDE.md records the rules for temporary gestures and autonomous, collision-aware furniture use. The checks above enforce the corresponding testable claims. PROCESS.md remains the author's account of the design argument and development process.
