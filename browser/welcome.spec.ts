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

  // The name is remembered by the cookie, so a reload goes straight in.
  await page.reload();
  await expect(page.getByRole("button", { name: "Pip · change" })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("skipping keeps the anonymous label and doesn't ask again", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Skip for now" }).click();
  await expect(page.getByRole("button", { name: "Choose a name" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Choose a name" })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
