import {test,expect} from "@playwright/test";
import {walkTo,presence} from "./walk-helper.ts";
import {sitePosition} from "../src/shared/interactions.ts";
import {SEATS} from "../src/shared/campfire.ts";

test("rich scenery keeps trees, houses and seating logs solid during real movement",async({page})=>{
 test.setTimeout(90000);
 const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
 await page.goto('/');
 await expect.poll(async()=>(await presence(page)).connected).toBe(true);
 const self=async()=>{const p=await presence(page);return p.players.find(v=>v.id===p.selfId)!;};
 const hold=async(key:string)=>{await page.locator('.game-container').focus();await page.keyboard.down(key);await page.waitForTimeout(850);await page.keyboard.up(key);await page.waitForTimeout(120);};
 await walkTo(page,{x:350,y:440},8);await hold('d');expect((await self()).x).toBeLessThanOrEqual(373);
 const shed=sitePosition('toolshed')!;
 await walkTo(page,{x:shed.x-74,y:shed.y-27},10);await hold('d');expect((await self()).x).toBeLessThanOrEqual(shed.x-55);
 const seat=SEATS[1];
 await walkTo(page,{x:seat.x+52,y:seat.y},10);await hold('a');expect((await self()).x).toBeGreaterThanOrEqual(seat.x+30);
 await page.keyboard.press('e');await expect.poll(async()=>(await self()).seatId).toBe(seat.id);
 await hold('d');await expect.poll(async()=>(await self()).seatId).toBeUndefined();expect((await self()).x).toBeGreaterThan(seat.x+10);
 const art=await page.evaluate(async()=>{const path='/game/gameRuntime.ts';const g=(await import(path)).gameRuntime.current;const scene=g.scene.getScene('OutdoorScene');return {treeWidth:g.textures.get('meadow-tree').getSourceImage().width,logWidth:g.textures.get('meadow-log').getSourceImage().width,atlasReleased:!g.textures.exists('sanctuary-scenery-v2'),solidSprites:scene.children.list.filter((o:any)=>o.name?.startsWith('scenery:')).length};});
 expect(art.treeWidth).toBeGreaterThan(80);expect(art.logWidth).toBeGreaterThanOrEqual(46);expect(art.logWidth).toBeLessThanOrEqual(54);expect(art.atlasReleased).toBe(true);expect(art.solidSprites).toBeGreaterThan(30);
 await page.screenshot({path:'/tmp/sanctuary-art/solid-props.png'});expect(errors).toEqual([]);
});
