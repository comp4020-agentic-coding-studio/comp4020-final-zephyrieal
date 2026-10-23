# Architecture decision records

These records describe decisions implemented in the sanctuary. Existing records retain their historical status and context; later records identify extensions or replacements.

| ADR | Decision |
| --- | --- |
| [001](0001-concurrent-furniture-placement.md) | Concurrent furniture placement |
| [002](0002-furniture-editing-concurrency.md) | Editing and storing shared furniture |
| [003](0003-construction-concurrency.md) | Optional cooperative construction |
| [004](0004-multiple-construction-projects.md) | Multiple shared building projects |
| [005](0005-visitor-identity-and-permissions.md) | Signed anonymous identity and permissions |
| [006](0006-proximity-and-public-garden.md) | Nearby interactions, removal of flowers and one public crop bed |
| [007](0007-authoritative-multiplayer-presence.md) | Controllable avatars and synchronized visitor movement |
| [008](0008-in-game-construction-feedback.md) | In-game building controls and shared construction dust |
| [009](0009-shared-building-interiors.md) | Separate shared interiors for completed buildings |
| [010](0010-shared-indoor-guinea-pig-visits.md) | One shared location per inhabitant, indoor wandering and room-checked feeding |
| [011](0011-social-encounters-and-furniture-behaviour.md) | Social gestures, shared indoor encounters and autonomous furniture use |
| [012](0012-cooperative-carrot.md) | Two distinct nearby visitors pull one carrot into the shared pantry |

As of 2026-10-22, ADR 006 supersedes earlier descriptions of active flower planting, and ADR 007 adds live avatar presence to the existing identity model. Art and sprite revisions are intentionally excluded. The sanctuary now has four named inhabitants. Each has independent server-owned wandering and a persistent feeding record; proximity and shared pantry rules still apply.
