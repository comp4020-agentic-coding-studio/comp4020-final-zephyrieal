import { test, expect, type Page } from "@playwright/test";
async function state(page: Page) {
  return page.evaluate(async () => { const path = "/game/presenceState.ts"; return (await import(path)).presenceState; });
}
test("visitors exchange gestures and walking ends sitting", async ({ browser }) => {
  const ca = await browser.newContext(), cb = await browser.newContext();
  const a = await ca.newPage(), b = await cb.newPage();
  const errors: string[] = [];
  for (const page of [a, b]) page.on("pageerror", e => errors.push(e.message));
  try {
    for (const page of [a, b]) { await page.goto("/"); await expect(page.locator("canvas")).toBeVisible(); await expect(page.getByRole("button", { name: "Wave", exact: true })).toBeEnabled(); }
    const id = (await state(a)).selfId;
    const gesture = async () => (await state(b)).players.find(p => p.id === id)?.gesture;
    await a.getByRole("button", { name: "Wave", exact: true }).click();
    await expect.poll(gesture, { timeout: 1000 }).toBe("wave");
    await expect.poll(gesture, { timeout: 4000 }).toBeUndefined();
    await a.getByRole("button", { name: "Help here", exact: true }).click();
    await expect.poll(gesture, { timeout: 1000 }).toBe("help");
    await expect.poll(gesture, { timeout: 4000 }).toBeUndefined();
    await a.getByRole("button", { name: "Sit", exact: true }).click();
    await expect.poll(gesture, { timeout: 1000 }).toBe("sit");
    await expect(a.getByRole("button", { name: "Stand up", exact: true })).toHaveAttribute("aria-pressed", "true");
    await b.screenshot({ path: "/tmp/sanctuary-gestures.png", fullPage: true });
    await a.locator(".game-container").focus(); await a.keyboard.down("d");
    await expect.poll(gesture, { timeout: 1000 }).toBeUndefined(); await a.keyboard.up("d");
    expect(errors).toEqual([]);
  } finally { await ca.close(); await cb.close(); }
});
