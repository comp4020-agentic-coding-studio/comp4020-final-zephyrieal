import { afterEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createCampfireChat } from "../src/server/chat.ts";
import { CAMPFIRE_CHAT, CHAT_MAX_LENGTH } from "../src/shared/chat.ts";
import type { Player } from "../src/shared/presence.ts";

const databases: DatabaseSync[] = [], folders: string[] = [];
afterEach(() => { for (const db of databases) db.close(); databases.length = 0; for (const f of folders) rmSync(f, { recursive: true, force: true }); folders.length = 0; });
const at = (id: string, x = CAMPFIRE_CHAT.x, y = CAMPFIRE_CHAT.y, name?: string): Player =>
  ({ id, room: "outdoor", x, y, facing: 1, moving: false, color: 0, ...(name ? { name } : {}) });
function fixture(path = ":memory:") {
  const db = new DatabaseSync(path); databases.push(db);
  const chat = createCampfireChat<string>(db);
  // key = tab, visitor = signed identity
  const players = new Map<string, { visitorId: string; player: Player }>();
  const put = (key: string, visitorId: string, player: Player) => { players.set(key, { visitorId, player }); return chat.update([...players].map(([k, v]) => ({ key: k, ...v }))); };
  return { db, chat, players, put };
}

describe("campfire chat area", () => {
  it("delivers only to visitors inside the area, including the sender", () => {
    const { chat, put, players } = fixture();
    put("a", "va", at("a", CAMPFIRE_CHAT.x, CAMPFIRE_CHAT.y, "Ash"));
    put("b", "vb", at("b", CAMPFIRE_CHAT.x + 100));
    put("c", "vc", at("c", CAMPFIRE_CHAT.x + 400));
    const sent = chat.send("a", players.get("a")!.player, "  hello\nfire  ", 1000);
    expect(sent.ok && sent.recipients.sort()).toEqual(["a", "b"]);
    expect(sent.ok && sent.message).toMatchObject({ name: "Ash", text: "hello fire", playerId: "a" });
    expect(JSON.stringify(sent)).not.toContain("va");
    expect(chat.send("c", players.get("c")!.player, "can anyone hear me", 1000)).toEqual({ ok: false, reason: "Return to the campfire to send." });
  });

  it("uses a buffer so the edge doesn't flicker, and indoors never counts", () => {
    const { put } = fixture();
    expect(put("a", "va", at("a", CAMPFIRE_CHAT.x + CAMPFIRE_CHAT.enter + 10))).toEqual([]);
    expect(put("a", "va", at("a", CAMPFIRE_CHAT.x + CAMPFIRE_CHAT.enter - 5))).toEqual([{ key: "a", member: true }]);
    // Between the enter and leave radii: still a member, no change.
    expect(put("a", "va", at("a", CAMPFIRE_CHAT.x + CAMPFIRE_CHAT.leave - 5))).toEqual([]);
    expect(put("a", "va", at("a", CAMPFIRE_CHAT.x + CAMPFIRE_CHAT.leave + 5))).toEqual([{ key: "a", member: false }]);
    put("a", "va", at("a"));
    expect(put("a", "va", { ...at("a"), room: "indoor" })).toEqual([{ key: "a", member: false }]);
  });

  it("never sends from a stale membership after walking away", () => {
    const { chat, put, players } = fixture();
    put("a", "va", at("a"));
    // The position moved past the leave radius before the next membership sync.
    expect(chat.send("a", at("a", CAMPFIRE_CHAT.x + 500), "draft", 0).ok).toBe(false);
    put("a", "va", at("a", CAMPFIRE_CHAT.x + 500));
    expect(chat.send("a", players.get("a")!.player, "draft", 0).ok).toBe(false);
    expect(chat.isMember("a")).toBe(false);
  });

  it("drops disconnected tabs from membership", () => {
    const { chat, put } = fixture();
    put("a", "va", at("a")); put("b", "vb", at("b"));
    expect(chat.nearby()).toBe(2);
    chat.update([{ key: "a", visitorId: "va", player: at("a") }]);
    expect(chat.nearby()).toBe(1);
  });
});

describe("campfire chat limits", () => {
  it("rejects empty and over-long messages", () => {
    const { chat, put, players } = fixture();
    put("a", "va", at("a"));
    const a = players.get("a")!.player;
    expect(chat.send("a", a, " \n\t ", 0).ok).toBe(false);
    expect(chat.send("a", a, 42, 0).ok).toBe(false);
    expect(chat.send("a", a, "x".repeat(CHAT_MAX_LENGTH + 1), 0).ok).toBe(false);
    expect(chat.send("a", a, "x".repeat(CHAT_MAX_LENGTH), 0).ok).toBe(true);
  });

  it("rate-limits per visitor identity across tabs", () => {
    const { chat, put, players } = fixture();
    put("tab1", "va", at("tab1")); put("tab2", "va", at("tab2"));
    let accepted = 0;
    // Twelve sends 700ms apart all land inside one 10s window.
    for (let i = 0; i < 12; i++) {
      const key = i % 2 ? "tab1" : "tab2";
      if (chat.send(key, players.get(key)!.player, `hi ${i}`, i * 700).ok) accepted++;
    }
    expect(accepted).toBe(5);
    // A burst inside the minimum gap is refused even under the window cap.
    const fresh = fixture(); fresh.put("b", "vb", at("b"));
    expect(fresh.chat.send("b", at("b"), "one", 0).ok).toBe(true);
    expect(fresh.chat.send("b", at("b"), "two", 100).ok).toBe(false);
    expect(fresh.chat.send("b", at("b"), "later", 20_000).ok).toBe(true);
  });
});

describe("blocking and reporting", () => {
  it("blocks by identity in both directions and persists across restarts", () => {
    const folder = mkdtempSync(join(tmpdir(), "chat-")); folders.push(folder);
    const path = join(folder, "chat.db");
    const first = fixture(path);
    first.put("a", "va", at("a", undefined, undefined, "Ash")); first.put("b", "vb", at("b", undefined, undefined, "Bo"));
    const rude = first.chat.send("b", first.players.get("b")!.player, "rude", 0);
    expect(rude.ok).toBe(true);
    expect(first.chat.block("vb", rude.ok && rude.message.id, 0).ok).toBe(false); // can't block yourself
    expect(first.chat.block("va", rude.ok && rude.message.id, 0)).toEqual({ ok: true });
    expect(first.chat.blocks("va")).toEqual([{ id: 1, name: "Bo" }]);
    const fromB = first.chat.send("b", first.players.get("b")!.player, "again", 5000);
    expect(fromB.ok && fromB.recipients).toEqual(["b"]);
    const fromA = first.chat.send("a", first.players.get("a")!.player, "bye", 5000);
    expect(fromA.ok && fromA.recipients).toEqual(["a"]);

    // A new tab and a server restart: the block is still there.
    const second = fixture(path);
    second.put("a2", "va", at("a2")); second.put("b2", "vb", at("b2"));
    const later = second.chat.send("b2", second.players.get("b2")!.player, "hello?", 0);
    expect(later.ok && later.recipients).toEqual(["b2"]);
    expect(second.chat.unblock("vb", 1)).toEqual({ ok: true }); // someone else's block row is untouched
    expect(second.chat.blocks("va")).toHaveLength(1);
    second.chat.unblock("va", 1);
    const after = second.chat.send("b2", second.players.get("b2")!.player, "hi again", 5000);
    expect(after.ok && after.recipients.sort()).toEqual(["a2", "b2"]);
  });

  it("stores reports with server-held context and validates the reason", () => {
    const { chat, put, players, db } = fixture();
    put("a", "va", at("a", undefined, undefined, "Ash")); put("b", "vb", at("b", undefined, undefined, "Bo"));
    chat.send("a", players.get("a")!.player, "hi everyone", 0);
    const bad = chat.send("b", players.get("b")!.player, "something mean", 1000);
    const id = bad.ok ? bad.message.id : -1;
    expect(chat.report("va", id, "made-up", 2000).ok).toBe(false);
    expect(chat.report("va", 9999, "unkind", 2000).ok).toBe(false);
    expect(chat.report("vb", id, "unkind", 2000).ok).toBe(false);
    expect(chat.report("va", id, "unkind", 2000)).toMatchObject({ ok: true });
    const row = db.prepare("SELECT reporter_id, reported_id, reason, message_text, context_json FROM chat_reports").get() as Record<string, string>;
    expect(row).toMatchObject({ reporter_id: "va", reported_id: "vb", reason: "unkind", message_text: "something mean" });
    expect(JSON.parse(row.context_json).map((c: { text: string }) => c.text)).toEqual(["hi everyone", "something mean"]);
  });
});
