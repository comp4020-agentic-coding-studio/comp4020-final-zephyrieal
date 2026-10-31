import { test, expect } from "@playwright/test";
import { walkTo } from "./walk-helper.ts";
test("camera follows movement and farm click target stays aligned", async ({ page }) => {
  await page.goto("/");
  const camera = () => page.evaluate(async()=>{const path="/game/cameraState.ts";return (await import(path)).cameraState;});
  await walkTo(page,{x:1040,y:500});
  await expect.poll(async()=>(await camera()).x).toBeGreaterThan(100);
  await walkTo(page,{x:470,y:320},20);
  const plot=page.getByRole("button",{name:"Shared farm",exact:true});
  // Read both projections in one browser turn: the camera keeps easing after
  // key-up, so separate automation calls can observe different frames.
  await expect.poll(() => page.evaluate(async () => {
    const path = "/game/cameraState.ts";
    const c = (await import(path)).cameraState;
    const box = document.querySelector('[aria-label="Shared farm"]')!.getBoundingClientRect();
    const canvas = document.querySelector("canvas")!.getBoundingClientRect();
    return Math.abs(box.x + box.width / 2 - (canvas.x + (470 - c.x) * c.zoom / c.width * canvas.width));
  })).toBeLessThan(3);
  await plot.click();
  await expect(page.getByRole("dialog",{name:"Shared farm options"})).toBeVisible();
  await page.screenshot({path:"/tmp/sanctuary-follow-camera.png",fullPage:true});
});
