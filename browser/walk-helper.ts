import { expect, type Page } from "@playwright/test";
export async function presence(page: Page) {
  return page.evaluate(async () => { const path = "/game/presenceState.ts"; return (await import(path)).presenceState; });
}
export async function walkTo(page: Page, target: string | { x: number; y: number }, reach = 35) {
  await expect.poll(async () => (await presence(page)).connected).toBe(true);
  await page.locator(".game-container").focus();
  let held: string[] = [];
  try {
    for (let i = 0; i < 180; i++) {
      const state = await presence(page), self = state.players.find(p => p.id === state.selfId);
      const destination = typeof target === "string"
        ? await page.request.get("/api/state").then(r => r.json()).then(s => ({ x: (target === "feed" ? s.guineaPigMovement : s.guineaPigs.find((p: { id: string }) => p.id === target).movement).x * 6.4, y: (target === "feed" ? s.guineaPigMovement : s.guineaPigs.find((p: { id: string }) => p.id === target).movement).y * 5.12 })) : target;
      const dx = destination.x - self.x, dy = destination.y - self.y;
      if (Math.hypot(dx, dy) <= reach) return;
      const next = [...(Math.abs(dx) > 10 ? [dx < 0 ? "a" : "d"] : []), ...(Math.abs(dy) > 10 ? [dy < 0 ? "w" : "s"] : [])];
      for (const key of held.filter(k => !next.includes(k))) await page.keyboard.up(key);
      for (const key of next.filter(k => !held.includes(k))) await page.keyboard.down(key);
      held = next;
      await page.waitForTimeout(100);
    }
    throw new Error("Could not walk to interaction");
  } finally { for (const key of held) await page.keyboard.up(key); }
}
export async function feedPotato(page: Page) {
  await walkTo(page, "feed");
  await page.getByRole("button", { name: "Feed Potato", exact: true }).click();
  const response = page.waitForResponse(r => r.url().endsWith("/api/feed") && r.request().method() === "POST");
  await page.getByRole("dialog", { name: "Feed Potato food choices" }).getByRole("button", { name: "Hay", exact: true }).click();
  expect((await response).status()).toBe(200);
}
