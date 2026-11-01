import { test, expect } from "@playwright/test";
import { walkTo, presence } from "./walk-helper.ts";
import { CAMPFIRE_CHAT } from "../src/shared/chat.ts";

const fire = { x: CAMPFIRE_CHAT.x, y: CAMPFIRE_CHAT.y + 90 };
const away = { x: CAMPFIRE_CHAT.x, y: CAMPFIRE_CHAT.y + CAMPFIRE_CHAT.leave + 70 };

test("public campfire chat: audience, drafts, typing and blocking", async ({ browser }) => {
  test.setTimeout(120000);
  const ca = await browser.newContext(), cb = await browser.newContext();
  const a = await ca.newPage(), b = await cb.newPage(); const errors: string[] = [];
  for (const p of [a, b]) p.on("pageerror", e => errors.push(e.message));
  try {
    for (const p of [a, b]) await p.goto("/");
    await walkTo(a, fire, 30); await walkTo(b, fire, 30);
    for (const p of [a, b]) {
      await expect(p.getByText("You joined campfire chat.")).toBeVisible();
      await expect(p.getByText("Everyone at the campfire can read this.")).toBeVisible();
      await expect(p.getByRole("button", { name: /Campfire chat · 2 nearby/ })).toBeVisible();
    }

    // Typing WASD into chat must not walk the avatar.
    const input = a.getByRole("textbox", { name: "Message everyone at the campfire" });
    const before = await presence(a), start = before.players.find(p => p.id === before.selfId)!;
    await input.click();
    await input.pressSequentially("wasd sssss hello", { delay: 30 });
    await a.waitForTimeout(400);
    const after = await presence(a), self = after.players.find(p => p.id === after.selfId)!;
    expect(Math.hypot(self.x - start.x, self.y - start.y)).toBeLessThan(1);
    await input.press("Enter");
    await expect(b.locator(".chat-log li").filter({ hasText: "wasd sssss hello" })).toBeVisible();
    await expect(a.locator(".chat-log li").filter({ hasText: "wasd sssss hello" })).not.toContainText("sending");

    // Walking away keeps history and the draft, disables sending and never sends it.
    await input.fill("half-written thought");
    await walkTo(a, away, 20);
    await expect(a.getByText("You left the campfire.", { exact: false })).toBeVisible();
    await expect(a.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
    await expect(input).toHaveValue("half-written thought");
    await expect(a.getByText("Return to the campfire to send. Your draft is kept.")).toBeVisible();
    await expect(a.locator(".chat-log li").filter({ hasText: "wasd sssss hello" })).toBeVisible();
    await b.getByRole("textbox", { name: "Message everyone at the campfire" }).fill("only for the fire");
    await b.getByRole("button", { name: "Send", exact: true }).click();
    await b.waitForTimeout(500);
    await expect(a.getByText("only for the fire")).toHaveCount(0);
    await expect(b.getByText("half-written thought")).toHaveCount(0);

    // Back at the fire, the draft is still the visitor's to send.
    await walkTo(a, fire, 30);
    await expect(a.getByRole("button", { name: "Send", exact: true })).toBeEnabled();
    await a.getByRole("button", { name: "Send", exact: true }).click();
    await expect(b.getByText("half-written thought")).toBeVisible();

    // Block from the message menu; it survives a reload of the blocker's page.
    await b.getByRole("button", { name: /Options for .*'s message/ }).last().click();
    await b.getByRole("button", { name: "Block", exact: true }).click();
    await expect(b.getByText("half-written thought")).toHaveCount(0);
    await expect(b.getByText(/Muted and blocked \(1\)/)).toBeVisible();
    await b.reload();
    await walkTo(b, fire, 30);
    await expect(b.getByText(/Muted and blocked \(1\)/)).toBeVisible();
    await a.waitForTimeout(700);
    await a.getByRole("textbox", { name: "Message everyone at the campfire" }).fill("can you see this");
    await a.getByRole("button", { name: "Send", exact: true }).click();
    await expect(a.locator(".chat-log li").filter({ hasText: "can you see this" })).not.toContainText("sending");
    await b.waitForTimeout(400);
    await expect(b.getByText("can you see this")).toHaveCount(0);

    // Esc returns keyboard focus to the game.
    await a.getByRole("textbox", { name: "Message everyone at the campfire" }).press("Escape");
    await expect(a.locator(".game-container")).toBeFocused();
    expect(errors).toEqual([]);
  } finally { await ca.close(); await cb.close(); }
});
