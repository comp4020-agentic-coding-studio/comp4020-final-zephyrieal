import { test,expect } from "@playwright/test";
import { presence } from "./walk-helper.ts";

test("fire and coast animate with six visitors and stop cleanly on scene exit",async({page,context})=>{
 test.setTimeout(90000);
 const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
 await page.goto("/");
 await expect.poll(async()=>(await presence(page)).connected).toBe(true);
 const snapshot=()=>page.evaluate(async()=>{
  const path="/game/gameRuntime.ts",game=(await import(path)).gameRuntime.current;
  const scene=game.scene.getScene("OutdoorScene"),fire=scene.children.getByName("campfire"),water=scene.children.getByName("water-ripples");
  return {frame:fire?.frame.name,playing:fire?.anims?.isPlaying,water:water?.commandBuffer.slice(),embers:scene.children.list.filter((o:any)=>o.name.startsWith("fire-ember:")).length};
 });
 await expect.poll(async()=>(await snapshot()).playing).toBe(true);
 const initial=await snapshot();await page.waitForTimeout(250);
 expect((await snapshot()).frame).not.toBe(initial.frame);
 expect((await snapshot()).embers).toBe(6);
 const others=[];
 for(let i=0;i<5;i++){const other=await context.newPage();await other.goto("/");others.push(other);}
 await page.bringToFront();
 await expect.poll(async()=>(await presence(page)).players.length).toBe(6);
 // Keep all six real sockets present, but profile one player's viewport rather
 // than six complete game renderers competing on the same test machine.
 for(const other of others)await other.evaluate(async()=>{const path="/game/gameRuntime.ts";const g=(await import(path)).gameRuntime.current;g.loop.sleep();});
 const measure=()=>page.evaluate(()=>new Promise<{median:number;p95:number;over33:number}>(resolve=>{
  const samples:number[]=[];let last=performance.now();
  const frame=(now:number)=>{samples.push(now-last);last=now;if(samples.length<120)requestAnimationFrame(frame);else{const sorted=[...samples].sort((a,b)=>a-b);resolve({median:sorted[60],p95:sorted[114],over33:samples.filter(n=>n>33).length});}};
  requestAnimationFrame(frame);
 }));
 const timing=await measure();
 await page.evaluate(async()=>{const path="/game/gameRuntime.ts",g=(await import(path)).gameRuntime.current;const s=g.scene.getScene("OutdoorScene");s.children.getByName("water-ripples").setActive(false).setVisible(false);s.children.getByName("campfire").anims.pause();s.tweens.pauseAll();});
 const baseline=await measure();
 await page.evaluate(async()=>{const path="/game/gameRuntime.ts",g=(await import(path)).gameRuntime.current;const s=g.scene.getScene("OutdoorScene");s.children.getByName("water-ripples").setActive(true).setVisible(true);s.children.getByName("campfire").anims.resume();s.tweens.resumeAll();});
 console.log("Six-player ambience frame timing",JSON.stringify({animated:timing,pausedBaseline:baseline}));
 expect(timing.p95).toBeLessThanOrEqual(baseline.p95+17);
 // Fit the island to inspect the ocean overlay and fire together.
 await page.evaluate(async()=>{const path="/game/gameRuntime.ts",g=(await import(path)).gameRuntime.current;const camera=g.scene.getScene("OutdoorScene").cameras.main;camera.setZoom(Math.min(camera.width/1280,camera.height/1024));});
 await page.waitForTimeout(160);
 const coast=(await snapshot()).water;
 expect(coast?.length).toBeGreaterThan(0);
 await page.waitForTimeout(400);expect((await snapshot()).water).not.toEqual(coast);
 await page.screenshot({path:"/tmp/animated-island.png"});
 for(const other of others)await other.close();
 // Restart the rendering scene directly: verifies cleanup independently of doorway state.
 await page.evaluate(async()=>{const path="/game/gameRuntime.ts",g=(await import(path)).gameRuntime.current;g.scene.stop("OutdoorScene");g.scene.start("OutdoorScene");});
 await expect.poll(async()=>(await snapshot()).embers).toBe(6);
 expect(errors).toEqual([]);
});

test("reduced motion keeps the fire and ocean still",async({page})=>{
 await page.emulateMedia({reducedMotion:"reduce"});await page.goto("/");
 await expect.poll(async()=>(await presence(page)).connected).toBe(true);
 await expect.poll(()=>page.evaluate(async()=>{const path="/game/gameRuntime.ts",g=(await import(path)).gameRuntime.current;return !!g?.scene.getScene("OutdoorScene").children.getByName("campfire");})).toBe(true);
 const result=await page.evaluate(async()=>{
  const path="/game/gameRuntime.ts",game=(await import(path)).gameRuntime.current;
  const scene=game.scene.getScene("OutdoorScene"),fire=scene.children.getByName("campfire");
  return {texture:fire.texture.key,water:!!scene.children.getByName("water-ripples"),embers:scene.children.list.filter((o:any)=>o.name.startsWith("fire-ember:")).length};
 });
 expect(result).toEqual({texture:"meadow-fire",water:false,embers:0});
});
