import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "node:http";
import { logAction } from "./log.ts";
import { verifyVisitorCookie } from "./identity.ts";

// Server -> client push only. Purchases and other mutations still go over
// the existing HTTP intent endpoints (/api/feed, /api/plant,
// /api/furniture/place) --- this keeps "the client sends an intent, the
// server decides" (CLAUDE.md) structural: the HTTP response *is* the commit
// confirmation, and a WebSocket broadcast is purely informative for everyone
// else already connected. See docs/decisions/0001-concurrent-furniture-placement.md.

const connections = new Map<string, Set<WebSocket>>(); // visitorId -> open sockets

export function attachRealtime(httpServer: Server): void {
  const wss = new WebSocketServer({ noServer: true });

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
      logAction(visitorId, "connected", { totalVisitors: connections.size });
      ws.on("close", () => {
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
