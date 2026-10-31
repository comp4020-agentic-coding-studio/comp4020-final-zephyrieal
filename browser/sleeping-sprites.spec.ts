import { test, expect } from "@playwright/test";
import { walkTo, presence } from "./walk-helper.ts";

test("resting swaps all four sprites indoors and outdoors, then restores them on waking",async({page})=>{
 await page.goto("/");await expect(page.getByRole("button",{name:"Wave",exact:true})).toBeEnabled();
 const results=await page.evaluate(async()=>{
  const configPath="/game/config.ts",statePath="/game/sanctuaryState.ts";
  const {startGame}=await import(configPath),{sanctuaryState}=await import(statePath);
  const parent=document.createElement("div");parent.style.cssText="width:640px;height:512px";document.body.append(parent);
  const game=startGame(parent);const frame=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
  while(!game.scene.isActive("OutdoorScene"))await frame();
  const results=[];
  for(const room of ["outdoor","indoor"]){
   const sceneKey=room==="outdoor"?"OutdoorScene":"IndoorScene";
   if(room==="indoor"){game.scene.stop("OutdoorScene");sanctuaryState.room="indoor";game.scene.start("IndoorScene");}
   const scene=game.scene.getScene(sceneKey);
   for(const p of Object.values(sanctuaryState.guineaPigs) as any[])p.movement={...p.movement,room,activity:"resting",durationMs:0};
   await frame();
   for(const id of ["potato","mochi","biscuit","clover"]){const body=scene.children.getByName(`guinea-pig:${id}`);results.push({room,id,sleeping:body.texture.key===`${id}-sleeping`,compact:body.texture.getSourceImage().width<=152});}
   results.push({room,noRestText:scene.children.list.every((o:any)=>!o.text?.includes("Resting"))});
   for(const p of Object.values(sanctuaryState.guineaPigs) as any[])p.movement={...p.movement,activity:undefined};
   await frame();
   results.push({room,awake:["potato","mochi","biscuit","clover"].every(id=>scene.children.getByName(`guinea-pig:${id}`).texture.key===(id==="potato"?"guinea-pig":id))});
  }
  await new Promise<void>(resolve=>{game.events.once("destroy",resolve);game.destroy(true);});parent.remove();return results;
 });
 for(const result of results){if("sleeping"in result){expect(result.sleeping).toBe(true);expect(result.compact).toBe(true);}if("awake"in result)expect(result.awake).toBe(true);if("noRestText"in result)expect(result.noRestText).toBe(true);}
});

test("E uses one seat prompt, stands up immediately and sidebar has no sitting buttons",async({page})=>{
 await page.goto("/");await walkTo(page,{x:554,y:514},10);
 await expect(page.locator("#game-sidebar").getByRole("button",{name:/Sit|Stand up|Leave seat|Your seat|Occupied/})).toHaveCount(0);
 await expect(page.locator(".world-bubble").filter({hasText:"· E"})).toHaveCount(1);
 const self=async()=>{const s=await presence(page);return s.players.find(p=>p.id===s.selfId);};
 await page.locator(".game-container").focus();await page.keyboard.press("e");await expect.poll(async()=>(await self())?.seatId).toBe("west");
 await expect(page.getByRole("button",{name:"Stand up",exact:true})).toHaveText("Stand up · E");
 await page.keyboard.press("e");await expect.poll(async()=>(await self())?.seatId).toBeUndefined();
 await page.keyboard.press("e");await expect.poll(async()=>(await self())?.seatId).toBe("west");
 await page.keyboard.press("e");await expect.poll(async()=>(await self())?.seatId).toBeUndefined();
 await page.screenshot({path:"/tmp/sanctuary-sleeping-and-seating.png"});
});
