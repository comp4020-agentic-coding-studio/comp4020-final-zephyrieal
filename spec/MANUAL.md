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
