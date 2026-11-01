import type { DatabaseSync } from "node:sqlite";
import { CAMPFIRE_CHAT, CHAT_MAX_LENGTH, CHAT_RATE, cleanChatText, isReportReason, type ChatBlock, type ChatMessage } from "../shared/chat.ts";
import { visitorLabel, type Player } from "../shared/presence.ts";

type Result<T = object> = ({ ok: true } & T) | { ok: false; reason: string };
type Sent = ChatMessage & { visitorId: string };
const RECENT_LIMIT = 100, REPORT_CONTEXT = 6, ACTIONS_PER_MINUTE = 10;

// Campfire chat: the server decides who is inside the area and delivers each
// message only to the sockets inside it at send time. Messages themselves are
// not persisted; blocks and reports are, keyed by signed visitor identity so
// they survive reconnects and cover every tab. `K` is one connection (a
// WebSocket in production, any value in tests).
export function createCampfireChat<K>(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_blocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      visitor_id TEXT NOT NULL,
      blocked_visitor_id TEXT NOT NULL,
      blocked_name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(visitor_id, blocked_visitor_id)
    );
    CREATE TABLE IF NOT EXISTS chat_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reporter_id TEXT NOT NULL,
      reported_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      message_text TEXT NOT NULL,
      context_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  const members = new Map<K, string>(); // connection -> visitorId
  const recent: Sent[] = [];
  const sends = new Map<string, number[]>(), actions = new Map<string, number[]>();
  let nextId = 1;

  function inside(player: Player | undefined, wasMember: boolean) {
    if (!player || player.room !== "outdoor") return false;
    return Math.hypot(player.x - CAMPFIRE_CHAT.x, player.y - CAMPFIRE_CHAT.y) <= (wasMember ? CAMPFIRE_CHAT.leave : CAMPFIRE_CHAT.enter);
  }
  // Sliding-window limit per visitor identity, shared across that visitor's tabs.
  function allow(log: Map<string, number[]>, visitorId: string, now: number, max: number, windowMs: number, minGapMs = 0) {
    const times = (log.get(visitorId) ?? []).filter(t => now - t < windowMs);
    if (times.length >= max || (times.length && now - times[times.length - 1] < minGapMs)) { log.set(visitorId, times); return false; }
    times.push(now); log.set(visitorId, times); return true;
  }
  // Blocking hides messages in both directions.
  function hiddenFrom(visitorId: string) {
    const rows = db.prepare("SELECT visitor_id, blocked_visitor_id FROM chat_blocks WHERE visitor_id = ? OR blocked_visitor_id = ?")
      .all(visitorId, visitorId) as { visitor_id: string; blocked_visitor_id: string }[];
    return new Set(rows.map(r => r.visitor_id === visitorId ? r.blocked_visitor_id : r.visitor_id));
  }
  function find(messageId: unknown, visitorId: string): Result<{ message: Sent }> {
    const message = Number.isSafeInteger(messageId) ? recent.find(m => m.id === messageId) : undefined;
    if (!message) return { ok: false, reason: "That message is no longer available." };
    if (message.visitorId === visitorId) return { ok: false, reason: "That's your own message." };
    return { ok: true, message };
  }

  return {
    nearby: () => members.size,
    memberKeys: () => [...members.keys()],
    isMember: (key: K) => members.has(key),
    leave(key: K) { members.delete(key); },
    // Recomputes membership from server-owned positions; returns who changed.
    update(entries: Iterable<{ key: K; visitorId: string; player: Player | undefined }>) {
      const changed: { key: K; member: boolean }[] = [];
      const seen = new Set<K>();
      for (const { key, visitorId, player } of entries) {
        seen.add(key);
        const was = members.has(key), now = inside(player, was);
        if (now) members.set(key, visitorId); else members.delete(key);
        if (now !== was) changed.push({ key, member: now });
      }
      for (const key of members.keys()) if (!seen.has(key)) members.delete(key);
      return changed;
    },
    send(key: K, player: Player | undefined, value: unknown, now: number): Result<{ message: ChatMessage; recipients: K[] }> {
      const visitorId = members.get(key);
      if (!visitorId || !player || !inside(player, true)) return { ok: false, reason: "Return to the campfire to send." };
      const text = cleanChatText(value);
      if (!text) return { ok: false, reason: "Type a message first." };
      if (text.length > CHAT_MAX_LENGTH) return { ok: false, reason: `Keep messages under ${CHAT_MAX_LENGTH} characters.` };
      if (!allow(sends, visitorId, now, CHAT_RATE.messages, CHAT_RATE.windowMs, CHAT_RATE.minGapMs)) {
        return { ok: false, reason: "Slow down a little — give others a chance to reply." };
      }
      const message: ChatMessage = { id: nextId++, playerId: player.id, name: visitorLabel(player), text, at: now };
      recent.push({ ...message, visitorId });
      if (recent.length > RECENT_LIMIT) recent.shift();
      const hidden = hiddenFrom(visitorId);
      const recipients = [...members].filter(([, v]) => !hidden.has(v)).map(([k]) => k);
      return { ok: true, message, recipients };
    },
    blocks(visitorId: string): ChatBlock[] {
      return db.prepare("SELECT id, blocked_name AS name FROM chat_blocks WHERE visitor_id = ? ORDER BY id").all(visitorId) as unknown as ChatBlock[];
    },
    block(visitorId: string, messageId: unknown, now: number): Result {
      const found = find(messageId, visitorId);
      if (!found.ok) return found;
      if (!allow(actions, visitorId, now, ACTIONS_PER_MINUTE, 60_000)) return { ok: false, reason: "Please wait a moment and try again." };
      db.prepare("INSERT OR IGNORE INTO chat_blocks (visitor_id, blocked_visitor_id, blocked_name) VALUES (?, ?, ?)")
        .run(visitorId, found.message.visitorId, found.message.name);
      return { ok: true };
    },
    unblock(visitorId: string, blockId: unknown): Result {
      if (!Number.isSafeInteger(blockId)) return { ok: false, reason: "Choose someone to unblock." };
      db.prepare("DELETE FROM chat_blocks WHERE id = ? AND visitor_id = ?").run(blockId as number, visitorId);
      return { ok: true };
    },
    // The server attaches its own copy of the surrounding conversation, so a
    // report can't be filed with invented context.
    report(visitorId: string, messageId: unknown, reason: unknown, now: number): Result<{ reportId: number }> {
      if (!isReportReason(reason)) return { ok: false, reason: "Choose a reason for the report." };
      const found = find(messageId, visitorId);
      if (!found.ok) return found;
      if (!allow(actions, visitorId, now, ACTIONS_PER_MINUTE, 60_000)) return { ok: false, reason: "Please wait a moment and try again." };
      const index = recent.indexOf(found.message);
      const context = recent.slice(Math.max(0, index - REPORT_CONTEXT + 1), index + 1).map(({ name, text, at }) => ({ name, text, at }));
      const row = db.prepare("INSERT INTO chat_reports (reporter_id, reported_id, reason, message_text, context_json) VALUES (?, ?, ?, ?, ?)")
        .run(visitorId, found.message.visitorId, reason, found.message.text, JSON.stringify(context));
      return { ok: true, reportId: Number(row.lastInsertRowid) };
    },
  };
}
