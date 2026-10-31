# 0013 — Campfire gathering, a full-window game and shared YouTube music

Date: 2026-10-30 (revised 2026-10-31: campfire position, fifth seat, seated sprite, animated fire, distance-faded music)

Status: Accepted (shared YouTube playback remains a labelled prototype)

Extends ADRs 005 (visitor identity), 006 (nearby interactions), 007 (authoritative presence), 008 (in-game controls) and 011 (social gestures and animal behaviour). Replaces ADR 011's standalone Sit button with nearby seat interactions and its resting activity captions with sleeping sprites. Other gesture, furniture and persistence decisions remain in effect.

## Context

The sanctuary needs a relaxed place where visitors can spend time together between exploration activities, without rewards or obligations. The existing meadow, four inhabitants, visitor presence and WebSocket connection already provide the necessary shared world.

The initial page placed game controls and explanatory content around a bounded canvas. The requested direction is a full-window pixel-art game with supporting information in a sidebar, seating operated in the world, and resting conveyed by the animals' appearance. Music requirements evolved from original synthesised tunes to accepting YouTube links, then removing all premade tunes. This record describes the resulting implementation.

## Decision

### Reuse the central meadow and authoritative presence

Place the campfire at the centre of the meadow, (640, 510) since the 2026-10-31 meadow expansion, with five fixed log seats around it (originally four; a forward-facing north log was added on 2026-10-31). Keep the garden, construction, carrot and room routes available. The logs are perspective pixel-art sprites with the angle drawn in; the fire is an eight-frame flicker generated from its sprite, with a few rising embers and a pulsing glow. Reduced-motion preferences get a static flame and no glow pulse.

Seat occupation belongs to the server and uses existing presence messages. A nearby visitor requests a seat; the server checks proximity and availability, so two avatars cannot occupy the same seat. Other visitors see the visitor's seated sprite, turned to face the fire. The seated pose replaces the earlier "Sitting" caption and shrunken standing figure. Movement, standing, another gesture, room changes and disconnect release the seat. Seats and poses are temporary presence, not persistent contributions or property.

Use the nearest free seat's world prompt within 40 world units. E sits; E again or movement stands. Pointer and touch users can activate the same prompt. Standing takes priority over seating, and seating over nearby feeding/building actions; only the selected action advertises E. Keyboard interaction requires focus on the game container, so typing in the sidebar does not operate the world. Remove the sidebar seat buttons and the standalone Sit gesture button; retain Wave and Help here. The existing game has no text chat, and this change does not introduce one.

### Make the game the application shell

Use a responsive full-window Phaser view with the existing camera and world-coordinate overlays. Move the journal, shared memory, room controls, music and other supporting controls into an independently scrolling pixel-style React sidebar. Allow the sidebar to collapse; hidden controls are inert. Retain native form controls and accessible world buttons rather than rebuilding every input inside the canvas. This keeps keyboard operation and text entry practical while presenting one game window.

### Show autonomous resting through sprites

Reuse the four named animals and their server-owned movement/activity messages. Outdoor wandering can select destinations near the fire and pause to rest without feeding. Check straight movement segments against the fire and log footprints, with bounded retries, rather than adding a separate navigation system.

For the shared resting activity, swap each animal's normal sprite for its own sleeping pose, including indoor resting. Restore the normal sprite when resting ends. Preserve individual markings, facing and a consistent ground baseline. Keep the name label but remove the resting sentence; existing hiding and tunnel labels remain. The artwork does not decide animal state or add player control. Asset provenance and generation prompts are recorded in [sleeping-sprites.md](../sleeping-sprites.md).

### Keep one server-owned, YouTube-only queue

Accept HTTPS video links from recognised YouTube and YouTube Music hosts, extract the validated video ID, and accept an optional bounded title. Reject arbitrary embed URLs and playlist-only links. Remove the original melody catalogue, its queue action/buttons and local synthesiser; the final product has no premade music choices.

Use the existing WebSocket connection and signed anonymous visitor identity. Adding a track requires proximity to the fire. Each identity may have one pending track across tabs; the current track no longer counts as pending. Cap the waiting queue at 24 entries. Visitors can remove their own pending entry, and the submitter can skip their current YouTube track while nearby. The server owns ordering, playback IDs, start times and advancement; reconnect snapshots include current and upcoming tracks. Private owner identifiers are not broadcast. The queue is explicitly temporary and clears on server restart.

Load the official visible YouTube iframe player only after Enable sound. Keep mute and volume local to each browser. Fade local volume smoothly to a quiet background level as listeners leave the fire, restoring it on return. Distance does not pause or restart playback. Collapsing the radio controls or scrolling them out of view keeps playback running. Pause locally only when the browser game tab is hidden. Rejoining seeks toward the shared server epoch. Ask visitors to share videos they own or have permission to play; link validation does not verify rights or availability. No audio extraction, downloads, API keys or additional streaming service are introduced.

Label shared playback as a prototype. Only the submitting identity can report a duration once for the matching current playback ID. Accept finite positive values bounded to one second through ten minutes; without a report, use a five-minute slot. This is a deliberate trust limitation: timing comes from the submitter's browser, not independently verified media metadata. Stale reports cannot alter the next track. Ads, buffering, autoplay restrictions and unavailable embeds can differ across visitors, so a shared queue and epoch do not guarantee synchronised playback. An unavailable track waits for its deadline unless its submitter skips it.

## Alternatives and trade-offs

- A separate gathering map would fragment co-presence and add navigation. The existing clearing is reachable from current activities, at the cost of fixed seating capacity.
- Canvas-only menus would look uniform but complicate text entry and accessibility. A styled DOM sidebar preserves native controls while reducing canvas width on desktop and overlaying it on narrow screens.
- Client-only seating or queue order would be simpler but allow conflicting shared state. Existing server authority avoids another transport or persistence layer.
- Full pathfinding would handle more complex routes; bounded straight-segment checks are sufficient for this clearing but are not proof against every future obstacle layout.
- Resting captions were explicit but cluttered the scene. Sleeping poses convey behaviour visually; no new screen-reader narration of animal activity is implemented.
- Retaining the original tunes would provide offline music, but conflicts with the final request. YouTube-only listening depends on an external service and a visible player.
- Dedicated media metadata, moderation and synchronisation infrastructure could improve reliability. It is outside this focused version; the UI exposes the prototype limitation instead of promising broadcast-quality timing.

No new currencies, rankings, daily obligations, progression, animal ownership or persistent reward is added. Existing Care Points and stewardship systems keep their previous rules.

## Validation and limits

The latest music-removal verification passed type checking, the production build, seven unit checks across `spec/campfire-unit.test.ts` and `spec/youtube-queue.test.ts`, and both `browser/campfire.spec.ts` and `browser/youtube-queue.spec.ts`.

These cover seat contention/release, two visitors observing sitting and queue order, identity quotas, URL validation, duration bounds and stale reports, owner-only skipping, fallback advancement, personal audio controls, returning to exploration and 2,000 seeded animal route decisions. Browser tests remove their temporary queue entries between runs. The YouTube browser test uses a simulated external player with the real application/server; real iframe playback was also manually observed locally. Neither check establishes synchronisation across arbitrary networks or availability of every video.

Earlier checks in this development round covered full-window/sidebar layouts (`browser/game-window.spec.ts`), sleeping/awake sprite transitions (`browser/sleeping-sprites.spec.ts`) and gesture regressions (`browser/gestures.spec.ts`). Local demonstrations used a separate test database. These are implementation checks, not evidence that visitors naturally gather or feel social connection; that still requires observation with people using the game.

See [campfire.md](../campfire.md) for operation and prototype details. This record documents implemented local behaviour; it does not imply deployment or production validation.
