import { defineConfig } from "@playwright/test";

// A real-browser regression suite, separate from spec/ (HTTP+WS only, no
// Phaser/DOM rendering --- see spec/README.md). This exists for exactly the
// class of bug spec/ structurally can't catch: a Phaser Scene instance
// surviving a stop()/start() cycle with stale GameObject references or
// leaked EventBus listeners (see browser/scene-lifecycle.spec.ts). Not part
// of `pnpm check`/CI, which runs the built Docker image headlessly with no
// browser available --- run this locally with `pnpm test:browser` before
// relying on a cross-scene UI change at a crit.
export default defineConfig({
  testDir: "./browser",
  // Each browser test observes the same sanctuary; keep unrelated visitors out.
  workers: 1,
  timeout: 30_000,
  webServer: {
    command: "pnpm dev",
    url: process.env.BROWSER_URL ?? "http://localhost:5173",
    reuseExistingServer: true,
    timeout: 60_000,
  },
  use: {
    baseURL: process.env.BROWSER_URL ?? "http://localhost:5173",
    // Every spec starts as a brand-new visitor; pre-dismiss the first-visit
    // name screen so it doesn't cover the game. browser/welcome.spec.ts
    // clears this to test the screen itself.
    storageState: {
      cookies: [],
      origins: [{
        origin: new URL(process.env.BROWSER_URL ?? "http://localhost:5173").origin,
        localStorage: [{ name: "sanctuary-welcome-skipped", value: "1" }],
      }],
    },
  },
});
