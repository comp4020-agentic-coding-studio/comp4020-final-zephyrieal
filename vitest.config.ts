import { defineConfig } from "vitest/config";

// Every test in spec/ runs against the running app, which spec/global-setup.ts
// finds. Only spec/ runs: a test anywhere else needs adding to `include`.
export default defineConfig({
  test: {
    include: ["spec/**/*.test.ts"],
    globalSetup: ["./spec/global-setup.ts"],
    // Every file shares ONE live server and its one SQLite-backed world
    // (one guinea pig, one flower meadow, one house) --- Vitest's default
    // parallel-file execution would let two files' mutations (e.g. a feed
    // from one file's test landing between another file's own before/after
    // reads of the shared feed count) interleave. Individual tests within a
    // file that deliberately race two requests against each other (see
    // furniture-concurrency.test.ts) still do so via Promise.all, which this
    // doesn't affect --- it only serializes *files* against each other.
    fileParallelism: false,
    // Integration fixtures walk to interactions at real player speed, and
    // chasing a wandering guinea pig across the expanded meadow on a slow CI
    // runner can take well over 20s for a test that feeds several times.
    testTimeout: 45000,
  },
});
