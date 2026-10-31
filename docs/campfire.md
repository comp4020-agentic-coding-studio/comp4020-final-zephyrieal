# Campfire gathering area

The central clearing at (280, 290) reuses the meadow, existing camera, authoritative visitor presence, sitting gesture, WebSocket connection and four named inhabitants. The garden, carrot, buildings and room controls retain their interactions. There was no text-chat system in the inspected game; existing gestures remain available. Seats use nearby E prompts; the music queue lives in the sidebar. Typing or focusing controls does not move the avatar.

## Playing

Run `pnpm dev` and open http://localhost:5173 in separate browser windows. Walk to the central fire. Walk beside an available log and press E (or tap the in-world Sit prompt). Four seats are exclusive while occupied. Walking, pressing E again, a different gesture, changing rooms or disconnecting releases the seat. Other visitors see the seated avatar and Sitting label.

Queue YouTube or YouTube Music video links from the sidebar. The current track and upcoming tracks are shared through the existing server. Each signed visitor identity may have one waiting track, including across tabs. The playing track does not count as pending. Enable sound loads the visible YouTube player; mute and volume affect only that browser. Premade synthesised music has been removed. Queues reset on server restart.

Guinea pigs keep their existing server-owned wandering, now sometimes choosing points near the fire and visibly resting between walks without feeding. Segment clearance checks avoid the fire and log footprints, with bounded retries. The wider map retains its existing decorative scenery and movement model.

The glow and slow flame pulse use Phaser drawing in the existing palette. Reduced-motion visitors get a static flame. Seat state is conveyed by text as well as avatar height, and all campfire panel controls are keyboard accessible.

## Checks

- `pnpm typecheck` and `pnpm build`.
- `pnpm exec vitest run spec/campfire-unit.test.ts`: identity quota, proximity and track validation, server-time advancement, seat races and release, and 2,000 seeded animal decisions with segment clearance and continued movement.
- `pnpm exec playwright test browser/campfire.spec.ts`: two independent visitors sitting, shared ordered queue, quota UI, personal audio controls, late join snapshot, track advancement and walking back to exploration without page errors.
- Existing gesture and scene lifecycle browser checks cover walking out of sitting and repeat indoor/outdoor transitions.

Local testing uses DB_PATH=/tmp/campfire-sanctuary.db so the saved sanctuary database is untouched. No new progression or currencies were added.

## YouTube queue prototype

Near the fire, paste a YouTube or YouTube Music video link and optionally name it. Links share the same server-owned queue and one-pending-track quota. Only HTTPS video links from recognised YouTube hosts are accepted; playlist-only links are not supported. Share only videos you own or have permission to play. No downloads, audio extraction, API keys or new services are used.

Enable sound loads the official iframe API. Each listener has independent mute/volume; music fades smoothly with distance from the fire, retaining a quiet background level. It stays at full personal volume within 150 world pixels, fades over the next 400 pixels to 15% of that volume, and rises again on return. Collapsing the radio controls or scrolling them out of view keeps playback running. The video pauses locally when the browser game tab is hidden. Rejoin seeks to the shared server epoch. This is explicitly a shared playback prototype, not synchronised streaming: advertisements, autoplay and embedding restrictions can differ by visitor. The submitter's player can report duration once for the matching playback ID, capped at ten minutes. Without that report a slot lasts five minutes. The submitting session can skip its current YouTube selection. The server verifies owner identity and proximity for skipping.

Checks: `spec/youtube-queue.test.ts` covers URL validation, cross-tab quotas, private ownership, duration validation, stale reports, advancement, fallback and skipping. `browser/youtube-queue.spec.ts` uses two real browser visitors and the real server, with the external iframe API mocked for deterministic playback-control testing. Live YouTube availability remains dependent on the visitor's network and YouTube.
