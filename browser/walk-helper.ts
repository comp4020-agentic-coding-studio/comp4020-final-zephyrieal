import { sitePosition } from "../src/shared/interactions.ts";
import { expect, type Page } from "@playwright/test";
export async function presence(page: Page) {
  return page.evaluate(async () => { const path = "/game/presenceState.ts"; return (await import(path)).presenceState; });
}
export async function walkTo(page: Page, target: string | { x: number; y: number }, reach = 35) {
  await expect.poll(async () => (await presence(page)).connected).toBe(true);
  if (typeof target === "string") {
    const state = await page.request.get("/api/state").then(r => r.json());
    const pig = state.guineaPigs.find((p: {id: string}) => p.id === (target === "feed" ? "potato" : target));
    const room = pig?.movement.room ?? "outdoor";
    const ps = await presence(page);
    const current = ps.players.find(p => p.id === ps.selfId)?.room;
    if (current !== room) {
      if (current !== "outdoor") await page.getByRole("button", { name: "Go back outside", exact: true }).click();
      if (room === "indoor") await page.getByRole("button", { name: "Go inside", exact: true }).click();
      else if (room.startsWith("house:")) {
        const project = room.slice(6);
        const position = sitePosition(project)!;
        await walkTo(page, position);
        await page.getByRole("button", { name: `Enter ${project}`, exact: true }).click();
      }
      await expect.poll(async () => { const ps = await presence(page); return ps.players.find(p => p.id === ps.selfId)?.room; }).toBe(room);
    }
  }
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
export async function feedHuahua(page: Page) {
  await walkTo(page, "feed");
  await page.getByRole("button", { name: "Feed Huahua", exact: true }).click();
  const response = page.waitForResponse(r => r.url().endsWith("/api/feed") && r.request().method() === "POST");
  await page.getByRole("dialog", { name: "Feed Huahua food choices" }).getByRole("button", { name: "Hay", exact: true }).click();
  expect((await response).status()).toBe(200);
}
