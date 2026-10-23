import { test, expect, type Page } from "@playwright/test";

async function state(page: Page) {
  return page.evaluate(async () => {
    const path = "/game/presenceState.ts";
    return (await import(path)).presenceState;
  });
}
async function ready(page: Page) {
  await page.goto("/");
  await expect(page.locator("canvas")).toBeVisible();
  await expect.poll(async () => (await state(page)).connected).toBe(true);
}

test("two visitors see movement, switch rooms, reconnect and leave without ghosts", async ({ browser }) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const a = await contextA.newPage(), b = await contextB.newPage();
  let disconnect = async () => {};
  await a.routeWebSocket("**/ws", route => {
    const server = route.connectToServer();
    disconnect = async () => { await Promise.all([route.close(), server.close()]); };
  });
  const errors: string[] = [];
  for (const page of [a, b]) page.on("pageerror", error => errors.push(error.message));
  try {
    await ready(a); await ready(b);
    const selfId = (await state(a)).selfId;
    await expect(a.getByRole("status")).toContainText("1 other visitor");
    await expect(b.getByRole("status")).toContainText("1 other visitor");
    const start = (await state(a)).players.find(p => p.id === selfId).x;
    await a.locator(".game-container").focus();
    await a.keyboard.down("d");
    await expect.poll(async () => (await state(b)).players.find(p => p.id === selfId).x).toBeGreaterThan(start + 30);
    await a.keyboard.up("d");
    await expect.poll(async () => (await state(b)).players.find(p => p.id === selfId).moving).toBe(false);
    const stopped = (await state(b)).players.find(p => p.id === selfId).x;
    await a.waitForTimeout(400);
    expect((await state(b)).players.find(p => p.id === selfId).x).toBe(stopped);
    await b.screenshot({ path: "/tmp/sanctuary-multiplayer.png", fullPage: true });

    // Repeat entry to exercise scene cleanup and input listener lifetime.
    for (let i = 0; i < 2; i++) {
      await a.getByRole("button", { name: "Go inside" }).click();
      await expect.poll(async () => (await state(b)).players.find(p => p.id === selfId).room).toBe("indoor");
      await expect(b.getByRole("status")).toContainText("Other visitors will appear");
      await a.getByRole("button", { name: "Go back outside" }).click();
      await expect(b.getByRole("status")).toContainText("1 other visitor");
    }
    await a.getByRole("button", { name: "Go inside" }).click();
    await b.getByRole("button", { name: "Go inside" }).click();
    await expect(a.getByRole("status")).toContainText("1 other visitor");
    await a.locator(".game-container").focus();
    await a.keyboard.down("ArrowLeft");
    await expect.poll(async () => (await state(b)).players.find(p => p.id === selfId).x).toBeLessThan(310);
    await a.keyboard.up("ArrowLeft");
    // On-screen controls also work without keyboard focus on the canvas.
    const button = a.getByRole("button", { name: "Walk up" });
    await button.hover(); await a.mouse.down();
    await expect.poll(async () => (await state(b)).players.find(p => p.id === selfId).y).toBeLessThan(310);
    await a.mouse.up();
    await disconnect();
    await expect.poll(async () => (await state(a)).connected).toBe(false);
    await expect.poll(async () => (await state(a)).connected).toBe(true);
    await expect.poll(async () => (await state(a)).selfId).not.toBe(selfId);
    await expect(a.getByRole("status")).toContainText("1 other visitor");
    await expect.poll(async () => (await state(b)).players.length).toBe(2);
    await contextA.close();
    await expect(b.getByRole("status")).toContainText("Other visitors will appear");
    expect(errors).toEqual([]);
  } finally { await contextA.close(); await contextB.close(); }
});
