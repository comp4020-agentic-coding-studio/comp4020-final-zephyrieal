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

test("one 'Plant a flower' click sends exactly one request, after repeated round trips", async ({
  page,
}) => {
  // The bug's second half: "plant-random" was registered on the
  // Scene-independent EventBus on every create() but never removed on
  // SHUTDOWN, so it stacked up --- one visit to the house and back added a
  // second listener, meaning one click fired two (then three, then four)
  // identical plant requests.
  const plantRequests: string[] = [];
  page.on("request", (req) => {
    if (req.method() === "POST" && req.url().includes("/api/plant")) {
      plantRequests.push(req.url());
    }
  });

  await page.goto("/");
  await page.waitForSelector("canvas");
  await page.waitForTimeout(1000);

  for (let i = 0; i < 3; i++) {
    await page.getByRole("button", { name: "Go inside" }).click();
    await page.waitForTimeout(300);
    await page.getByRole("button", { name: "Go back outside" }).click();
    await page.waitForTimeout(300);
  }

  plantRequests.length = 0;
  await page.getByRole("button", { name: "Plant a flower" }).click();
  await page.waitForTimeout(500);

  expect(plantRequests.length).toBe(1);
});
