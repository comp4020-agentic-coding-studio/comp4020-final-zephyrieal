import { test, expect } from "@playwright/test";
import { presence } from "./walk-helper.ts";

test.use({ storageState: { cookies: [], origins: [] } });

test("a first-time visitor names themselves and their avatar label follows", async ({ page }) => {
  await page.goto("/");
  const dialog = page.getByRole("dialog", { name: "Welcome to the sanctuary" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Your name").fill("Pip");
  await dialog.getByRole("button", { name: "Enter the meadow" }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(async () => { const s = await presence(page); return s.players.find(p => p.id === s.selfId)?.name; }).toBe("Pip");

  await expect(page.locator(".game-container")).toBeFocused();
  const state = await presence(page), start = state.players.find(p => p.id === state.selfId)!;
  // Do not click or focus the canvas: movement must work after saving the name.
  await expect.poll(async () => {
    await page.keyboard.press("s", { delay: 180 });
    const current = await presence(page), self = current.players.find(p => p.id === current.selfId)!;
    return Math.hypot(self.x - start.x, self.y - start.y);
  }).toBeGreaterThan(3);
  await page.getByRole("button", { name: "Pip · change" }).click();
  await page.getByRole("textbox", { name: "Your name", exact: true }).fill("Pip Two");
  await page.getByRole("textbox", { name: "Your name", exact: true }).press("Enter");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".game-container")).toBeFocused();

  // The name is remembered by the cookie, so a reload goes straight in.
  await page.reload();
  await expect(page.getByRole("button", { name: "Pip Two · change" })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("skipping keeps the anonymous label and doesn't ask again", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Skip for now" }).click();
  await expect(page.getByRole("button", { name: "Choose a name" })).toBeVisible();
  await expect(page.locator(".game-container")).toBeFocused();
  await page.reload();
  await expect(page.getByRole("button", { name: "Choose a name" })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
