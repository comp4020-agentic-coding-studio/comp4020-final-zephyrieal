import { test, expect } from "@playwright/test";

test("furniture art and opaque click areas fit every rotated footprint", async ({ page }) => {
  await page.goto("/");
  const results = await page.evaluate(async () => {
    const configPath = "/game/config.ts", statePath = "/game/sanctuaryState.ts";
    const { startGame } = await import(configPath);
    const { sanctuaryState } = await import(statePath);
    const footprintFor = (kind: string, rotation: number) => { const base = kind === "tunnel" ? { width: 3, height: 1 } : { width: 2, height: 2 }; return rotation === 90 || rotation === 270 ? { width: base.height, height: base.width } : base; };
    const parent = document.createElement("div"); document.body.append(parent);
    const game = startGame(parent);
    await new Promise<void>((resolve, reject) => {
      const deadline = Date.now() + 15000;
      const check = () => {
        if (game.scene.isActive("OutdoorScene")) resolve();
        else if (Date.now() > deadline) reject(new Error("Scene did not start"));
        else setTimeout(check, 30);
      }; check();
    });
    game.scene.stop("OutdoorScene");
    sanctuaryState.room = "indoor";
    game.scene.start("IndoorScene");
    const scene = game.scene.getScene("IndoorScene");
    const results = [];
    for (const kind of ["hay_bed", "tunnel", "hideout"]) {
      for (const rotation of [0, 90, 180, 270]) {
        const { width, height } = footprintFor(kind, rotation);
        sanctuaryState.furniture = [{ id: 901, kind, tile_x: 2, tile_y: 2, width, height, rotation, status: "placed", version: 1 }];
        scene.redrawFurniture();
        const sprite = scene.children.getByName("furniture:901");
        const bounds = sprite.getBounds();
        const hit = (x: number, y: number) => sprite.input.hitAreaCallback(sprite.input.hitArea, x, y, sprite);
        results.push({ kind, rotation,
          fits: bounds.left >= 224 && bounds.top >= 192 && bounds.right <= 224 + width * 32 && bounds.bottom <= 192 + height * 32,
          vertical: sprite.displayHeight > sprite.displayWidth,
          centerHits: hit(sprite.width / 2, sprite.height / 2),
          transparentCornerHits: hit(0, 0),
          undistorted: Math.abs(sprite.scaleX - sprite.scaleY) < 0.001 });
      }
    }
    await new Promise<void>(resolve => { game.events.once("destroy", resolve); game.destroy(true); });
    parent.remove();
    return results;
  });
  expect(results).toHaveLength(12);
  for (const result of results) {
    expect(result.fits, JSON.stringify(result)).toBe(true);
    expect(result.undistorted).toBe(true);
    expect(result.centerHits).toBe(true);
    expect(result.transparentCornerHits).toBeFalsy();
    if (result.kind === "tunnel") expect(result.vertical).toBe(result.rotation === 90 || result.rotation === 270);
  }
});
