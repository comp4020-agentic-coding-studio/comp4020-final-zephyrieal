import { test, expect } from "@playwright/test";
import { walkTo, presence } from "./walk-helper.ts";
import { SEATS, CAMPFIRE_LOGS } from "../src/shared/campfire.ts";
import { blockedMeadow } from "../src/shared/meadow.ts";

test("perspective logs support every seated pose with clear standing exits", async ({ page }) => {
  test.setTimeout(120000);
  await page.goto("/");
  await expect(page.getByRole("button", {name:"Wave",exact:true})).toBeEnabled();
  for (const seat of SEATS) {
    await walkTo(page,{x:seat.x,y:seat.y+22},15);
    await page.keyboard.press("e");
    await expect.poll(async()=>{
      const state=await presence(page);return state.players.find(p=>p.id===state.selfId)?.seatId;
    }).toBe(seat.id);
    const log=CAMPFIRE_LOGS.find(log=>log.id===seat.id)!;
    expect(blockedMeadow(log.x,log.y,0)).toBe(true);
    const art=await page.evaluate(async id=>{
      const path="/game/gameRuntime.ts";
      const game=(await import(path)).gameRuntime.current;
      const scene=game.scene.getScene("OutdoorScene");
      const image=scene.children.getByName(`log:${id}`);
      return {texture:image.texture.key,angle:image.angle,width:image.displayWidth};
    },seat.id);
    expect(art).toEqual({texture:`campfire-log-${log.view}`,angle:0,width:log.view==="flat"?68:64});
    if(seat.id==="north") {
      await expect.poll(()=>page.evaluate(async()=>{
        const runtime="/game/gameRuntime.ts",presencePath="/game/presenceState.ts";
        const game=(await import(runtime)).gameRuntime.current;
        const state=(await import(presencePath)).presenceState;
        const root=game.scene.getScene("OutdoorScene").children.getByName(`visitor:${state.selfId}`);
        return root.list.find((child:any)=>child.texture?.key==="visitor-seated")?.frame.name;
      })).toBe("front");
      await page.screenshot({path:"/tmp/fifth-log.png"});
    }
    if(seat.id==="west") await page.screenshot({path:"/tmp/log-perspective.png"});
    await page.keyboard.press("e");
    await expect.poll(async()=>{
      const state=await presence(page);return state.players.find(p=>p.id===state.selfId)?.seatId;
    }).toBeUndefined();
    const state=await presence(page),self=state.players.find(p=>p.id===state.selfId)!;
    expect(blockedMeadow(self.x,self.y,8)).toBe(false);
  }
});
