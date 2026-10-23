import { test, expect } from "@playwright/test";

// Regression for a bug found manually: "Go inside" then "Go back outside"
// crashed OutdoorScene.create() on the very first round trip (the shared
// house's construction site sprite never came back, and the meadow lost its
// click-to-plant/keyboard handlers for the rest of the session). Phaser
// reuses the same Scene *instance* across stop()/start() --- switching views
// never constructs a fresh OutdoorScene --- so any code in create() that
// assumes "first time" state (a class field that's still set from the
// previous run, a listener registered on the Scene-independent EventBus
// rather than cleaned up on SHUTDOWN) breaks the second time the Scene
// starts, not the first. spec/ can't catch this: it's HTTP+WS only, with no
// Phaser/DOM rendering (see spec/README.md) --- see playwright.config.ts for
// why this lives here instead.

test("the construction site survives going inside and back outside", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));

  await page.goto("/");
  await page.waitForSelector("canvas");
  await page.waitForTimeout(1000); // let BootScene finish loading and OutdoorScene render

  await page.getByRole("button", { name: "Go inside" }).click();
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: "Go back outside" }).click();
  await page.waitForTimeout(300);

  expect(errors, "OutdoorScene.create() threw on the round trip").toEqual([]);

  // A second round trip, since a fix that only survives one cycle (e.g.
  // re-introducing a fresh stale reference) would still be wrong.
  await page.getByRole("button", { name: "Go inside" }).click();
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: "Go back outside" }).click();
  await page.waitForTimeout(300);

  expect(errors, "OutdoorScene.create() threw on the second round trip").toEqual([]);
});

test("the public farm remains a single bed after repeated room changes", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("canvas")).toBeVisible();
  for (let i = 0; i < 3; i++) {
    await page.getByRole("button", { name: "Go inside" }).click();
    await expect(page.getByRole("button", { name: "Shared farm", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Go back outside" }).click();
    await expect(page.getByRole("button", { name: "Shared farm", exact: true })).toHaveCount(1);
  }
  await expect(page.getByRole("button", { name: "Plant a flower" })).toHaveCount(0);
});


test("destroyed scenes release listeners and completed sites use their final texture", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const configPath = "/game/config.ts", busPath = "/game/eventBus.ts", statePath = "/game/sanctuaryState.ts";
    const { startGame } = await import(configPath);
    const { EventBus } = await import(busPath);
    const { sanctuaryState } = await import(statePath);
    // Instantiate through the scene's Phaser superclass, using a separate game
    // from the same runtime as the app, to exercise direct game destruction.
    const parent = document.createElement("div"); document.body.append(parent);
    const game = startGame(parent);
    await new Promise<void>((resolve, reject) => {
      const deadline = Date.now() + 10000;
      const check = () => {
        if (game.scene.isActive("OutdoorScene")) resolve();
        else if (Date.now() > deadline) reject(new Error("Scene did not start"));
        else setTimeout(check, 30);
      }; check();
    });
    sanctuaryState.construction["guinea-pig-house"] = { progressUnits: 10000, targetUnits: 10000, status: "completed", activeBuilders: 0, multiplierUnits: 100, hadCooperativeMoment: false };
    EventBus.emit("construction-updated", "guinea-pig-house");
    const scene = game.scene.getScene("OutdoorScene");
    const texture = scene.children.getByName("construction:guinea-pig-house").texture.key;
    await new Promise<void>(resolve => { game.events.once("destroy", resolve); game.destroy(true); });
    // A stale callback used to throw here and prevent later listeners running.
    EventBus.emit("construction-updated", "guinea-pig-house");
    parent.remove();
    return texture;
  });
  expect(result).toBe("guinea-pig-house-4");
});
