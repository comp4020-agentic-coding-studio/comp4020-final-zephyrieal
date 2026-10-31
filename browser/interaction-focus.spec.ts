import { test, expect } from "@playwright/test";
import { feedHuahua, presence } from "./walk-helper.ts";

test("feeding and closing world menus return keyboard control to the game", async ({ page }) => {
  test.setTimeout(90000);
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Wave", exact: true })).toBeEnabled();
  await feedHuahua(page);
  const game = page.locator(".game-container");
  await expect(game).toBeFocused();
  const state = await presence(page);
  const before = state.players.find(p => p.id === state.selfId)!;
  // No focus helper or canvas click: a real movement key must work immediately.
  await page.keyboard.down("s");
  try {
    await expect.poll(async () => {
      const current = await presence(page);
      const self = current.players.find(p => p.id === current.selfId)!;
      return Math.hypot(self.x - before.x, self.y - before.y);
    }).toBeGreaterThan(3);
  } finally { await page.keyboard.up("s"); }
  const feed = page.getByRole("button", { name: "Feed Huahua", exact: true });
  await expect(feed).toBeVisible();
  await feed.click();
  await page.getByRole("button", { name: "Close food choices", exact: true }).click();
  await expect(game).toBeFocused();
  await page.keyboard.press("e");
  await expect(page.getByRole("dialog", { name: "Feed Huahua food choices" })).toBeVisible();
});
