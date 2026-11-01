import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "node:http";
import { logAction } from "./log.ts";
import { verifyVisitorCookie } from "./identity.ts";
import { createMusicQueue } from "./campfire.ts";
import { createPresence } from "./presence.ts";
import { getName } from "./names.ts";
import { createCampfireChat } from "./chat.ts";
import { db } from "./db.ts";

// Persistent mutations use HTTP; ephemeral movement intents use this socket.
const presence = createPresence();
const music = createMusicQueue();
const chat = createCampfireChat<WebSocket>(db);
const CHAT_INTENTS = ["chat-send", "chat-block", "chat-unblock", "chat-report"];
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
    if (music.tick(Date.now())) broadcast({ type: "music-state", music: music.snapshot(Date.now()) });
    syncChat();
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
      const selfId = presence.join(ws, getName(visitorId));
      ws.send(JSON.stringify({ type: "presence-welcome", selfId, players: presence.snapshot() }));
      ws.send(JSON.stringify({ type: "music-state", music: music.snapshot(Date.now()) }));
      ws.send(JSON.stringify({ type: "chat-status", member: false, nearby: chat.nearby() }));
      ws.send(JSON.stringify({ type: "chat-blocks", blocks: chat.blocks(visitorId) }));
      let musicWindow = 0, musicMessages = 0;
      ws.on("message", (data, binary) => {
        if (binary) return;
        try {
          const intent = JSON.parse(data.toString());
          if (CHAT_INTENTS.includes(intent?.type)) handleChat(ws, visitorId, intent);
          else if (["music-remove", "music-add-youtube", "music-duration", "music-skip"].includes(intent?.type)) {
            if (Date.now() - musicWindow >= 1000) { musicWindow = Date.now(); musicMessages = 0; }
            if (++musicMessages > 10) { ws.send(JSON.stringify({ type: "purchase-rejected", reason: "Please give the music queue a moment." })); return; }
            if (intent.type === "music-duration") {
              if (music.reportDuration(visitorId, intent.playbackId, intent.seconds)) broadcast({ type: "music-state", music: music.snapshot(Date.now()) });
              return;
            }
            const player = presence.playerFor(ws);
            const reason = intent.type === "music-add-youtube" ? music.addYouTube(visitorId, player, intent.url, intent.title, Date.now())
              : intent.type === "music-skip" ? music.skip(visitorId, player, intent.playbackId, Date.now())
              : (music.remove(visitorId), null);
            if (reason) ws.send(JSON.stringify({ type: "purchase-rejected", reason }));
            else broadcast({ type: "music-state", music: music.snapshot(Date.now()) });
          } else presence.input(ws, intent, performance.now());
        }
        catch { /* Malformed input never changes the world. */ }
      });
      logAction(visitorId, "connected", { totalVisitors: connections.size });
      ws.on("close", () => {
        presence.leave(ws);
        if (chat.isMember(ws)) { chat.leave(ws); chatNearby = -1; }
        connections.get(visitorId)?.delete(ws);
        if (connections.get(visitorId)?.size === 0) connections.delete(visitorId);
        logAction(visitorId, "disconnected", { totalVisitors: connections.size });
      });
    });
  });
}

// Membership follows server-owned positions. Only the visitor whose status
// changed hears about it; everyone inside hears the new headcount.
let chatNearby = 0;
function syncChat() {
  const entries = [...connections].flatMap(([visitorId, sockets]) =>
    [...sockets].map(key => ({ key, visitorId, player: presence.playerFor(key) })));
  const changed = chat.update(entries);
  const nearby = chat.nearby();
  if (!changed.length && nearby === chatNearby) return;
  chatNearby = nearby;
  const status = (member: boolean) => JSON.stringify({ type: "chat-status", member, nearby });
  for (const key of new Set([...chat.memberKeys(), ...changed.map(c => c.key)])) {
    if (key.readyState === WebSocket.OPEN) key.send(status(chat.isMember(key)));
  }
}

function handleChat(ws: WebSocket, visitorId: string, intent: { type: string; text?: unknown; clientId?: unknown; messageId?: unknown; blockId?: unknown; reason?: unknown }) {
  const now = Date.now();
  const clientId = typeof intent.clientId === "string" ? intent.clientId.slice(0, 64) : undefined;
  if (intent.type === "chat-send") {
    const result = chat.send(ws, presence.playerFor(ws), intent.text, now);
    if (!result.ok) { ws.send(JSON.stringify({ type: "chat-rejected", reason: result.reason, clientId })); return; }
    // The sender's own tab gets its clientId back to replace its pending copy.
    for (const key of result.recipients) {
      if (key.readyState !== WebSocket.OPEN) continue;
      key.send(JSON.stringify({ type: "chat-message", message: key === ws ? { ...result.message, clientId } : result.message }));
    }
    logAction(visitorId, "chat-sent", { messageId: result.message.id, length: result.message.text.length, recipients: result.recipients.length });
    return;
  }
  if (intent.type === "chat-report") {
    const result = chat.report(visitorId, intent.messageId, intent.reason, now);
    if (!result.ok) { ws.send(JSON.stringify({ type: "chat-rejected", reason: result.reason })); return; }
    logAction(visitorId, "chat-reported", { reportId: result.reportId, reason: intent.reason });
    ws.send(JSON.stringify({ type: "chat-reported" }));
    return;
  }
  const result = intent.type === "chat-block" ? chat.block(visitorId, intent.messageId, now) : chat.unblock(visitorId, intent.blockId);
  if (!result.ok) { ws.send(JSON.stringify({ type: "chat-rejected", reason: result.reason })); return; }
  logAction(visitorId, intent.type === "chat-block" ? "chat-blocked" : "chat-unblocked");
  sendToVisitor(visitorId, { type: "chat-blocks", blocks: chat.blocks(visitorId) });
}

// Relabels every tab this visitor has open; the next presence tick carries it.
export function renameVisitor(visitorId: string, name: string): void {
  for (const ws of connections.get(visitorId) ?? []) presence.rename(ws, name);
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
