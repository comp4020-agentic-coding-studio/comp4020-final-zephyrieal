import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Builds the React+Phaser client straight into repo-root public/, so
// src/server/index.ts's express.static(publicDir) needs no change at all ---
// public/ just stops being hand-authored and becomes a build artifact (see
// .gitignore). In dev, the proxy below forwards API/WS calls to the Express
// server on :8080 so the client never needs to know it's talking to a
// different port, and CORS never comes up.
export default defineConfig({
  root: "src/client",
  plugins: [react()],
  build: {
    outDir: resolve(__dirname, "public"),
    emptyOutDir: true,
  },
  server: {
    proxy: {
      "/api": process.env.API_ORIGIN ?? "http://localhost:8080",
      "/ws": { target: process.env.API_ORIGIN ?? "ws://localhost:8080", ws: true },
    },
  },
});
