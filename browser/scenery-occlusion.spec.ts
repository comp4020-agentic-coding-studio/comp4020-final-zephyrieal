import {test,expect} from "@playwright/test";
import {writeFile} from "node:fs/promises";
import {walkTo,presence} from "./walk-helper.ts";
import {SCENERY} from "../src/shared/meadow.ts";

test("tree canopies occlude visitors behind them and trunks stay solid",async({page})=>{
 test.setTimeout(90000);await page.goto("/");
 const tree=SCENERY.find(s=>s.x===840 && s.y===710)!;
 const index=SCENERY.indexOf(tree);
 const depths=()=>page.evaluate(async i=>{
  const runtime="/game/gameRuntime.ts",presencePath="/game/presenceState.ts";
  const game=(await import(runtime)).gameRuntime.current,state=(await import(presencePath)).presenceState;
  const scene=game.scene.getScene("OutdoorScene");
  return {tree:scene.children.getByName(`scenery:${i}`).depth,player:scene.children.getByName(`visitor:${state.selfId}`).depth};
 },index);
 await walkTo(page,{x:tree.x,y:tree.y-30},14);
 await expect.poll(async()=>{const d=await depths();return d.player<d.tree;}).toBe(true);
 await page.screenshot({path:"/tmp/tree-behind.png"});
 await walkTo(page,{x:tree.x,y:tree.y+35},14);
 await expect.poll(async()=>{const d=await depths();return d.player>d.tree;}).toBe(true);
 await page.keyboard.down("w");await page.waitForTimeout(650);await page.keyboard.up("w");
 const state=await presence(page),self=state.players.find(p=>p.id===state.selfId)!;
 expect(self.y).toBeGreaterThanOrEqual(tree.y+18);
 await page.screenshot({path:"/tmp/tree-front.png"});
 const house=await page.evaluate(async()=>{const path="/game/gameRuntime.ts",game=(await import(path)).gameRuntime.current;return game.textures.get("meadow-house").getSourceImage().toDataURL();});
 await writeFile("/tmp/clean-house.png",Buffer.from(house.split(",")[1],"base64"));
});
