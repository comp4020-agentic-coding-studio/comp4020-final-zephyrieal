# Manual checks

Everything `pnpm check` can assert lives in `spec/*.test.ts`. One thing in
the crit-9 scenarios genuinely can't: `spec/global-setup.ts` assumes one
already-running instance for the whole suite, and CI's own check job runs
the built Docker image without ever restarting it mid-run --- so there's no
honest way to script a server restart into `vitest run` without fighting
that model. This is checked by hand instead.

## Scenario 5: furniture and Care Points survive a server restart

1. `pnpm build && pnpm start` (or deploy and use the live URL).
2. In a browser: feed Potato a few times, note the Care Points balance; place
   a piece of furniture, note its kind and tile position.
3. `GET /api/state` and save the JSON (or just note `carePoints` and the
   `furniture` array shown in the browser).
4. Stop the server (`Ctrl-C`) and start it again (`pnpm start`), or
   `fly machine restart` on the deployed app.
5. Reload the page (or `GET /api/state` again). The balance and the
   furniture's position must be unchanged.

Record the result (pass/fail, date) in `PROCESS.md`'s crit-9 section before
the crit.

## Furniture editing and shared storage: UI-only scenarios

`spec/furniture-edit.test.ts` and `spec/furniture-storage.test.ts` cover
everything the server does. The harness is HTTP+WS against a running
server --- it never renders Phaser or touches a DOM, so what the *menu
itself* looks and feels like has to be checked by hand, the same carve-out
as scenario 5 above.

1. Click a piece of furniture in the house. A small menu (rotate, move,
   save, store, cancel) appears near it, stays within the visible game
   area even when the piece is near an edge, and the piece gets a yellow
   selection outline.
2. Hovering each icon shows a short tooltip naming the action.
3. Clicking Rotate spins the piece in place (no server call until Save);
   clicking Move lets the ghost preview follow the cursor, tinted green on
   a valid tile and red on an invalid one, while the piece can still be
   rotated mid-move.
4. Pressing Escape, or clicking Cancel, while editing reverts to the
   piece's last-saved position and rotation with no request sent.
5. Clicking Store asks for confirmation in the same menu before anything
   is sent; clicking the confirm option is the only way it actually stores.
6. Extend scenario 5 above: a piece that's been moved, rotated, or stored
   (not just a freshly-bought one) keeps its new position/rotation/status
   across a server restart.

Record the result (pass/fail, date) in `PROCESS.md`'s furniture-editing
section before relying on this feature at a crit.

## Cooperative construction: UI-only scenarios and restart persistence

`spec/construction.test.ts` covers the server side in full --- progress,
the multiplier, the 5s inactivity window, rate limiting, real-time
broadcast, concurrency and completion. What it can't touch, same reason as
above (no Phaser/DOM rendering in this harness):

1. The construction site in the outdoor meadow visually changes --- a
   different sprite --- as progress crosses each 25% threshold, and clicking
   it opens the panel without also planting a flower at that spot.
2. The panel's progress bar, percentage, active-builder count and teamwork
   phrasing match what `GET /api/state` reports, and the Build button gives
   a visible press response.
3. Reaching 100% replaces the site with the finished house and plays the
   completion effect for every connected visitor, not just whoever clicked
   last.

Manually verified 2026-10-11: built to 500/10000 units, restarted the
server, confirmed progress was still exactly 500 afterward; separately
drove a fresh project to completion (two cooperating visitors, one
accepted click `justCompleted: true`, cooperative reward paid), restarted
again, and confirmed `status` was still `completed` and a further
contribution was still rejected with 409 --- pass both times.
