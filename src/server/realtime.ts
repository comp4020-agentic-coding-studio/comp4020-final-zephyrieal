import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "node:http";

// Server -> client push only. Purchases and other mutations still go over
// the existing HTTP intent endpoints (/api/feed, /api/plant,
// /api/furniture/place) --- this keeps "the client sends an intent, the
// server decides" (CLAUDE.md) structural: the HTTP response *is* the commit
// confirmation, and a WebSocket broadcast is purely informative for everyone
// else already connected. See docs/decisions/0001-concurrent-furniture-placement.md.

const connections = new Map<string, Set<WebSocket>>(); // visitorId -> open sockets

// By the time client JS opens a socket, an earlier HTTP page load has already
// minted the `visitor=<uuid>` cookie (the Express middleware in index.ts runs
// on every request, including the first static asset fetch), so the upgrade
// request already carries it --- no separate handshake-time minting needed.
function parseVisitorId(cookieHeader: string | undefined): string | undefined {
  return (cookieHeader ?? "").match(/visitor=([a-f0-9-]+)/)?.[1];
}

export function attachRealtime(httpServer: Server): void {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (req, socket, head) => {
    if (req.url !== "/ws") {
      socket.destroy();
      return;
    }
    const visitorId = parseVisitorId(req.headers.cookie);
    if (!visitorId) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      if (!connections.has(visitorId)) connections.set(visitorId, new Set());
      connections.get(visitorId)!.add(ws);
      ws.on("close", () => {
        connections.get(visitorId)?.delete(ws);
        if (connections.get(visitorId)?.size === 0) connections.delete(visitorId);
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
