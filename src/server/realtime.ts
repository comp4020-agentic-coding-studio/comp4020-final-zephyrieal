import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "node:http";
import { logAction } from "./log.ts";
import { verifyVisitorCookie } from "./identity.ts";
import { createPresence } from "./presence.ts";

// Persistent mutations use HTTP; ephemeral movement intents use this socket.
const presence = createPresence();
export const movePlayerRoom = presence.moveRoom;

// A public avatar id is usable only with the signed identity owning its socket.
export function playerForVisitor(visitorId: string, playerId: string | undefined) {
  if (!playerId) return undefined;
  for (const ws of connections.get(visitorId) ?? []) {
    const player = presence.playerFor(ws);
    if (ws.readyState === WebSocket.OPEN && player?.id === playerId) return player;
  }
  return undefined;
}

const connections = new Map<string, Set<WebSocket>>(); // visitorId -> open sockets

export function attachRealtime(httpServer: Server): void {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });
  let previousTick = performance.now();
  const movementTimer = setInterval(() => {
    const now = performance.now();
    const message = presence.tick(now, (now - previousTick) / 1000);
    previousTick = now;
    if (message) broadcast(message);
  }, 50);
  movementTimer.unref();
  const alive = new WeakSet<WebSocket>();
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!alive.has(ws)) { ws.terminate(); continue; }
      alive.delete(ws);
      ws.ping();
    }
  }, 15000);
  heartbeat.unref();
  httpServer.once("close", () => {
    clearInterval(movementTimer);
    clearInterval(heartbeat);
    for (const ws of wss.clients) ws.terminate();
    wss.close();
  });

  httpServer.on("upgrade", (req, socket, head) => {
    if (req.url !== "/ws") {
      socket.destroy();
      return;
    }
    // By the time client JS opens a socket, an earlier HTTP page load has
    // already minted and signed the visitor cookie (the Express middleware
    // in index.ts runs on every request, including the first static asset
    // fetch), so the upgrade request already carries a verifiable one --- no
    // separate handshake-time minting needed. A WS upgrade can't itself set
    // a cookie, so a missing or forged one here is rejected outright rather
    // than silently minted: see src/server/identity.ts, the one place both
    // this file and index.ts now verify the same signed cookie.
    const visitorId = verifyVisitorCookie(req.headers.cookie);
    if (!visitorId) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      if (!connections.has(visitorId)) connections.set(visitorId, new Set());
      connections.get(visitorId)!.add(ws);
      alive.add(ws);
      ws.on("pong", () => alive.add(ws));
      ws.on("error", () => ws.terminate());
      const selfId = presence.join(ws);
      ws.send(JSON.stringify({ type: "presence-welcome", selfId, players: presence.snapshot() }));
      ws.on("message", (data, binary) => {
        if (binary) return;
        try { presence.input(ws, JSON.parse(data.toString()), performance.now()); }
        catch { /* Malformed input never changes the world. */ }
      });
      logAction(visitorId, "connected", { totalVisitors: connections.size });
      ws.on("close", () => {
        presence.leave(ws);
        connections.get(visitorId)?.delete(ws);
        if (connections.get(visitorId)?.size === 0) connections.delete(visitorId);
        logAction(visitorId, "disconnected", { totalVisitors: connections.size });
      });
    });
  });
}

export function broadcast(message: unknown): void {
  const payload = JSON.stringify(message);
  for (const sockets of connections.values()) {
    for (const ws of sockets) {
      if (ws.readyState === WebSocket.OPEN) ws.send(payload);
    }
  }
}

// Sends only to one visitor's own connection(s) --- this is what keeps a
// Care Points balance update invisible to everyone else (CLAUDE.md's
// Interface exception is for a visitor's *own* balance only).
export function sendToVisitor(visitorId: string, message: unknown): void {
  const payload = JSON.stringify(message);
  for (const ws of connections.get(visitorId) ?? []) {
    if (ws.readyState === WebSocket.OPEN) ws.send(payload);
  }
}
