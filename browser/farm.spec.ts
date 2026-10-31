import { FARM_PLOTS } from "../src/shared/farm.ts";
import { sitePosition } from "../src/shared/interactions.ts";
import { test, expect } from "@playwright/test";
import { feedHuahua, walkTo, presence, enterShelter } from "./walk-helper.ts";

test("one public farm supports nearby planting and another visitor's harvest", async ({ browser }) => {
  test.setTimeout(90000);
  const ca = await browser.newContext(), cb = await browser.newContext();
  const a = await ca.newPage(), b = await cb.newPage();
  const errors: string[] = [];
  for (const page of [a, b]) page.on("pageerror", error => errors.push(error.message));
  try {
    await a.goto("/"); await b.goto("/");
    await expect(a.getByRole("button", { name: "Shared farm", exact: true })).toHaveCount(1);
    await expect(a.getByRole("button", { name: "Plant a flower" })).toHaveCount(0);
    await walkTo(a, FARM_PLOTS[0], 60);
    await a.getByRole("button", { name: "Shared farm", exact: true }).click();
    const menu = a.getByRole("dialog", { name: "Shared farm options" });
    for (const name of ["Hay", "Lettuce", "Bell peppers", "Cucumbers"]) await expect(menu.getByRole("button", { name, exact: true })).toBeVisible();
    await menu.getByRole("button", { name: "Hay", exact: true }).click();
    await expect(menu).toContainText("Growing hay");
    await expect.poll(async () => (await b.request.get("/api/state").then(r => r.json())).farm.plots[0].crop).toBe("hay");
    await expect.poll(()=>a.evaluate(async()=>{const path="/game/gameRuntime.ts";const scene=(await import(path)).gameRuntime.current.scene.getScene("OutdoorScene");return scene.children.list.filter((o:any)=>o.name?.startsWith("farm-bed:")).length;})).toBe(1);
    await a.screenshot({ path: "/tmp/sanctuary-art/garden-planted.png", fullPage: true });
    await a.getByRole("button", { name: "Close farm" }).click();
    await feedHuahua(a);
    await walkTo(a, sitePosition("guinea-pig-house")!, 55);
    await a.getByRole("button", { name: "Build guinea-pig-house", exact: true }).click();
    await b.evaluate(async () => {
      const path = "/game/eventBus.ts";
      const { EventBus } = await import(path);
      EventBus.once("construction-dust", (projectId: string) => {
        document.documentElement.dataset.constructionDust = projectId;
      });
    });
    const buildResponse = a.waitForResponse(r => r.url().endsWith("/api/construction/contribute"));
    await a.getByRole("button", { name: "Build!" }).click();
    expect((await buildResponse).status()).toBe(200);
    await expect(b.locator("html")).toHaveAttribute("data-construction-dust", "guinea-pig-house");
    await enterShelter(a);
    await expect(a.getByRole("dialog", { name: "Build The shared shelter" })).toHaveCount(0);
    const id = (await presence(a)).selfId;
    const denied = await a.request.post("/api/feed", { headers: { "X-Player-Id": id }, data: { requestId: crypto.randomUUID() } });
    expect(denied.status()).toBe(403);
    await walkTo(b, FARM_PLOTS[0], 60);
    await b.getByRole("button", { name: "Shared farm", exact: true }).click();
    const harvest = b.getByRole("button", { name: "Harvest for Huahua", exact: true });
    await expect(harvest).toBeVisible({ timeout: 35000 });
    await harvest.click();
    await expect(b.getByRole("dialog", { name: "Shared farm options" })).toContainText("Plant food for Huahua");
    await expect.poll(async () => (await a.request.get("/api/state").then(r => r.json())).farm.food.hay).toBe(3);
    expect(errors).toEqual([]);
  } finally { await ca.close(); await cb.close(); }
});
