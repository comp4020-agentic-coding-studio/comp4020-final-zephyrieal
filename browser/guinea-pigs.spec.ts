import { test, expect } from "@playwright/test";
import { walkTo } from "./walk-helper.ts";
test("new guinea pigs have independent feeding and shared movement", async ({ browser }) => {
  test.setTimeout(60000);
  const ca = await browser.newContext(), cb = await browser.newContext();
  const a = await ca.newPage(), b = await cb.newPage();
  const errors: string[] = [];
  a.on("pageerror", e => errors.push(e.message)); b.on("pageerror", e => errors.push(e.message));
  try {
    await a.goto("/"); await b.goto("/");
    for (const [id, name] of [["mochi", "Mochi"], ["biscuit", "Biscuit"], ["clover", "Clover"]]) {
      await walkTo(a, id, 25);
      const before = await a.request.get("/api/state").then(r => r.json());
      await a.getByRole("button", { name: `Feed ${name}`, exact: true }).click();
      const response = a.waitForResponse(r => r.url().endsWith("/api/feed"));
      await a.getByRole("dialog", { name: `Feed ${name} food choices` }).getByRole("button", { name: "Hay", exact: true }).click();
      expect((await response).status()).toBe(200);
      await expect.poll(() => b.evaluate(async id => {
        const path = "/game/sanctuaryState.ts";
        return (await import(path)).sanctuaryState.guineaPigs[id]?.feed_count;
      }, id)).toBe(before.guineaPigs.find((p: {id: string}) => p.id === id).feed_count + 1);
      const after = await a.request.get("/api/state").then(r => r.json());
      expect(after.guineaPig.feed_count).toBe(before.guineaPig.feed_count);
    }
    await a.screenshot({ path: "/tmp/sanctuary-breeds.png", fullPage: true });
    expect(errors).toEqual([]);
  } finally { await ca.close(); await cb.close(); }
});
