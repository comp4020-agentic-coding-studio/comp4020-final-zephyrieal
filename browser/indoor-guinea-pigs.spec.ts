import { test, expect } from "@playwright/test";
import { walkTo, presence, enterShelter } from "./walk-helper.ts";
test("house visitors share roaming guinea pigs and can feed them only in the same room", async ({ browser }) => {
  const ca = await browser.newContext(), cb = await browser.newContext();
  const a = await ca.newPage(), b = await cb.newPage();
  try {
    await a.goto("/"); await b.goto("/");
    await expect.poll(async () => (await presence(a)).connected).toBe(true);
    await enterShelter(a);
    const state = () => a.request.get("/api/state").then(r => r.json());
    await expect.poll(async () => (await state()).guineaPigs.some((p: any) => p.movement.room === "indoor")).toBe(true);
    const pig = (await state()).guineaPigs.find((p: any) => p.movement.room === "indoor");
    const id = (await presence(b)).selfId;
    const denied = await b.request.post("/api/feed", { headers: { "X-Player-Id": id }, data: { guineaPigId: pig.id } });
    expect(denied.status()).toBe(403);
    await enterShelter(b);
    const local = (page: any) => page.evaluate(async (id: string) => { const path = "/game/sanctuaryState.ts"; return (await import(path)).sanctuaryState.guineaPigs[id]; }, pig.id);
    await expect.poll(async () => (await local(b))?.movement.room).toBe("indoor");
    await expect.poll(async () => (await local(a))?.movement.durationMs, { timeout: 10000 }).toBeGreaterThan(0);
    expect((await local(b)).movement.targetX).toBe((await local(a)).movement.targetX);
    await walkTo(a, pig.id, 25);
    await a.getByRole("button", { name: `Feed ${pig.name}`, exact: true }).click();
    const response = a.waitForResponse(r => r.url().endsWith("/api/feed"));
    await a.getByRole("dialog", { name: `Feed ${pig.name} food choices` }).getByRole("button", { name: "Hay", exact: true }).click();
    expect((await response).status()).toBe(200);
    await expect.poll(async () => (await local(b)).feed_count).toBe(pig.feed_count + 1);
    await b.reload();
    await expect.poll(async () => (await local(b))?.movement.room).toBe("indoor");
    await a.screenshot({ path: "/tmp/sanctuary-indoor-guinea-pigs.png", fullPage: true });
  } finally { await ca.close(); await cb.close(); }
});
