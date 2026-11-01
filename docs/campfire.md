# Campfire gathering area

The central clearing at (640, 510) reuses the meadow, existing camera, authoritative visitor presence, sitting gesture, WebSocket connection and four named inhabitants. The garden, carrot, buildings and room controls retain their interactions. Public text chat is available inside the campfire area only (see below and ADR 014); existing gestures remain available. Seats use nearby E prompts; the music queue lives in the sidebar. Typing or focusing controls does not move the avatar.

## Playing

Run `pnpm dev` and open http://localhost:5173 in separate browser windows. Walk to the central fire. Walk beside an available log and press E (or tap the in-world Sit prompt). Five seats are exclusive while occupied. Walking, pressing E again, a different gesture, changing rooms or disconnecting releases the seat. Other visitors see the seated sprite facing the fire.

Queue YouTube or YouTube Music video links from the sidebar. The current track and upcoming tracks are shared through the existing server. Each signed visitor identity may have one waiting track, including across tabs. The playing track does not count as pending. Enable sound loads the visible YouTube player; mute and volume affect only that browser. Premade synthesised music has been removed. Queues reset on server restart.

Guinea pigs keep their existing server-owned wandering, now sometimes choosing points near the fire and visibly resting between walks without feeding. Segment clearance checks avoid the fire and log footprints, with bounded retries. The wider map retains its existing decorative scenery and movement model.

The logs are perspective sprites (`campfire-logs.png`, plus `campfire-log-flat.png` for the north seat). The fire flickers through eight frames generated from its sprite, with rising embers and a pulsing glow. Reduced-motion visitors get a static flame and no pulse. Seat state is shown by the seated sprite and by the in-world Sit/Stand prompt text, and all campfire panel controls are keyboard accessible.

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

## Campfire chat

The chat area is a circle around the fire. You join within 170 world pixels and leave beyond 210, so walking along the edge doesn't keep toggling membership. Membership comes from the server's own avatar positions every presence tick; only the visitor whose status changed is told, and members see the nearby count. Messages go to the members at send time, including the sender, whose pending copy is replaced through a `clientId`. Late arrivals see only messages sent after they joined. If you leave mid-draft, the draft stays in the box with "Return to the campfire to send." The server checks the live position on send, so a send racing the boundary is refused and the text is returned to the input.

Limits: 200 characters, single line, 5 messages per 10 s and 600 ms apart per signed identity across tabs. Mute is local to the page. Block and report use the `chat_blocks` and `chat_reports` tables. Blocks hide messages in both directions and persist. Reports save the reason and the server's last six messages of context. There's no moderator view yet; query `chat_reports` directly.

Checks: `spec/campfire-chat.test.ts` (unit, temporary databases), `spec/campfire-chat-live.test.ts` (real sockets against the running app) and `browser/campfire-chat.spec.ts`.
