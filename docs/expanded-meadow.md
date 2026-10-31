# Expanded meadow pass — 30 October 2026

## Scope

The outdoor world is now 1280 × 1024 logical pixels (previously 640 × 512): twice each dimension and four times the area. Walking speed remains 120 logical pixels per second. A straight crossing of the walkable width takes about 9.6 seconds; actual journeys depend on obstacles. Arrival is beside the central campfire clearing.

The communal garden, giant carrot, five construction sites, and campfire seats use shared coordinates on both server and client. The original indoor 640 × 512 coordinate system and furniture grid remain unchanged. Feeding and animal rendering choose dimensions by room.

## Rendering and art

A tilemap uses a 192 × 16 terrain atlas (12 reusable 16-pixel tiles) for grass, paths, water, and island edges. Its static composition is cached once into twenty 256 × 256 logical chunks (257 × 257 cached pixels including a one-pixel overlap) for rendering; the reusable tiles remain the layout source. Paths connect the activity clearings to the fire. Trees, pines, blossoms, rocks, and flowers use five small reusable procedural pixel textures, separate from interactive construction and activity sprites. Terrain and scenery do not update every frame. The large painted island PNG remains in the repository but is no longer loaded.

Shared feet-level rectangles define solid trunks, rocks, building foundations, fire, and logs. Authoritative player movement slides along these footprints; animal route selection checks the same rectangles, with additional body clearance. Flowers, foliage, and soil are decorative/traversable. The bridge remains a traversable construction activity. Standing or walking off a log releases the seat to clear ground in front of it.

The player artwork and controls are preserved. The shared radio is an independent bottom-right HUD bubble; its expanded view contains the existing queue and visible YouTube player. It remains mounted when the journal closes. Collapsing the radio hides the video and pauses local YouTube playback, preserving its existing visible-player behavior.

## Measured performance work

Before optimization, the six-browser-client headless sample recorded a 50 ms median and 50.1 ms p95 animation-frame interval. The asset audit identified nine full copies of the 1254 × 1254 furniture sheet in Phaser's texture cache, large animal sheets, and a 1402 × 1122 background.

The furniture sheet now loads once, is scanned once, and is baked into bounded view textures before its full texture is released. Animal frames are baked to 152 pixels wide (four times outdoor display size); the original player sheet is preserved. Pixel filtering remains nearest-neighbor and camera scroll rounds to pixels. Stationary interaction/radio UI avoids redundant state changes, and the garden redraws only at a state or growth-phase change.

The first tiled six-renderer stress run retained the 50 ms median but regressed to 66.7 ms p95, exposing per-frame tile submission cost. Static chunk caching was introduced specifically in response to that measured regression. After chunk caching, the same six-browser-client stress sample returned to **50 ms median / 50.1 ms p95** (240 frames), matching the original-world baseline p95 despite the four-times-larger world. It is still a demanding approximately-20-FPS headless workload on this machine.

The final one-renderer/six-player test recorded **16.7 ms median / 16.8 ms p95**, no frames above 33.4 ms, and approximately **59.7 FPS** from Phaser. The final loaded-texture RGBA pixel footprint was **12,947,552 bytes (12.35 MiB)**, including cached terrain. Before this pass, the source sizes and registered texture keys imply approximately **114 MiB** for the large furniture, animal, player, and background textures alone; this is an RGBA accounting estimate, not a driver VRAM measurement. The extra 5 MiB for chunk caching buys lower terrain submission cost. Largest loaded texture dimension remains 1254 (the unchanged player sheet); terrain chunk caches are 257 square after the seam fix. The overlap adds about 0.04 MiB, putting the final footprint near 12.4 MiB. A final overview at fractional zoom verified that the overlaps remove the thin chunk-edge seams.

A separate browser test with one rendered client and five real socket peers measured 16.7 ms median / 16.8 ms p95 with no frame above 33.4 ms before chunk caching. This tests six visible visitors, while the six-renderer sample stresses six whole game clients on one machine. These are different workloads and should not be conflated.

## Verification

**35 focused server tests passed**, along with type checking and the production build. **11 browser checks passed** across expanded-world traversal/profile, queue/seating, camera alignment, desktop/mobile layout, room lifecycle, and sleeping/seating behavior. The complete legacy suite was not run to completion.

Focused server checks cover bounds, authoritative multiplayer movement, seating exclusivity and release, queue ownership/proximity, indoor animal activity, cooperative carrot rules, route access to every activity and four corners, collision/sliding, and 2000 sampled animal routes.

Browser checks exercise shared seating, queue propagation and late joins, personal volume/mute, visible YouTube playback with a deterministic player stub, camera/DOM target alignment, desktop and mobile layout, six visitors with remote corner-position observation, far-edge camera limits, garden/build prompts, and console errors.

For a separate local verification world, start the backend with `DB_PATH` pointing to a disposable database and `PORT` set to a free port. Run Vite with `API_ORIGIN` pointing to that server. Set `APP_URL` to the backend and `BROWSER_URL` to Vite when running the browser tests. Avoid reusing an older server: its in-memory bounds and shared queue may differ from the current source.

## Limits

This is a simplified procedural pixel interpretation of the concept, retaining the existing construction sprites. It does not reproduce the illustrated waterfall/river composition. No chat implementation was present in the supplied checkout, and none was added. Real YouTube embedding/advertisements/autoplay remain dependent on the provider and browser; queue persistence across server restart is unchanged. Large source PNG downloads and the Phaser bundle remain initial-load costs. Headless browser frame measurements are comparative diagnostics, not a guarantee for mobile hardware or a production network.
