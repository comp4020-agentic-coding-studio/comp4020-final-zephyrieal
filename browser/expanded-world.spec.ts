import {test,expect} from "@playwright/test";
import WebSocket from "ws";
import {randomUUID} from "node:crypto";
import {cookieFor} from "../spec/identity.ts";
import {walkTo,presence} from "./walk-helper.ts";
import {SEATS} from "../src/shared/campfire.ts";
import {FARM_PLOTS} from "../src/shared/farm.ts";
import {sitePosition} from "../src/shared/interactions.ts";
test("expanded meadow: six visitors, far travel, camera, seats, activities and frame profile",async({page})=>{
 test.setTimeout(180000);
 const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
 const peers:WebSocket[]=[],snapshots:any[][]=[];
 try{
  for(let i=0;i<5;i++){
   const ws=new WebSocket((process.env.APP_URL ?? 'http://localhost:8080').replace('http','ws')+'/ws',{headers:{cookie:cookieFor(randomUUID())}});peers.push(ws);ws.on('message',raw=>{const message=JSON.parse(raw.toString());if(message.players)snapshots[i]=message.players;});
   await new Promise<void>((resolve,reject)=>{ws.once('open',()=>resolve());ws.once('error',reject);});
  }
  await page.goto('/');await expect.poll(async()=>(await presence(page)).players.length).toBeGreaterThanOrEqual(6);
  await page.getByRole('button',{name:'Hide sidebar ›',exact:true}).click();
  await page.waitForFunction(async()=>{const path='/game/gameRuntime.ts';return (await import(path)).gameRuntime.current?.scene.isActive('OutdoorScene');});
  const inspect=()=>page.evaluate(async()=>{const path='/game/gameRuntime.ts';const g=(await import(path)).gameRuntime.current;const c=g.scene.getScene('OutdoorScene').cameras.main;const textures=Object.values(g.textures.list) as any[];return{camera:{x:c.worldView.x,y:c.worldView.y,width:c.worldView.width,height:c.worldView.height,zoom:c.zoom},textureBytes:textures.reduce((n,t)=>n+t.source.reduce((m:number,s:any)=>m+s.width*s.height*4,0),0),largest:Math.max(...textures.flatMap(t=>t.source.map((s:any)=>Math.max(s.width,s.height)))),fps:g.loop.actualFps,terrain:g.scene.getScene('OutdoorScene').children.getByName('meadow-terrain')?.type};});
  await expect.poll(async()=>(await inspect()).terrain).toBe('TilemapLayer');
  for(const target of [{x:1190,y:920},{x:1190,y:112},{x:80,y:112},{x:80,y:920}]){
   await walkTo(page,target,30);
   const ps=await presence(page),self=ps.players.find(p=>p.id===ps.selfId)!;
   expect(Math.hypot(self.x-target.x,self.y-target.y)).toBeLessThan(35);
   await expect.poll(()=>{const seen=snapshots[0]?.find(p=>p.id===self.id);return seen?Math.hypot(seen.x-self.x,seen.y-self.y):Infinity;}).toBeLessThan(15);
   const {camera:c}=await inspect();expect(c.x).toBeGreaterThanOrEqual(-1);expect(c.y).toBeGreaterThanOrEqual(-1);expect(c.x+c.width).toBeLessThanOrEqual(1281);expect(c.y+c.height).toBeLessThanOrEqual(1025);
  }
  await walkTo(page,{x:SEATS[0].x,y:SEATS[0].y+22},14);
  await page.locator('.game-container').focus();await page.keyboard.press('e');
  await expect.poll(async()=>{const p=await presence(page);return p.players.find(v=>v.id===p.selfId)?.seatId;}).toBe('west');
  await page.keyboard.press('e');await expect.poll(async()=>{const p=await presence(page);return p.players.find(v=>v.id===p.selfId)?.gesture;}).toBeUndefined();
  await page.keyboard.down('d');await page.waitForTimeout(250);await page.keyboard.up('d');
  await walkTo(page,FARM_PLOTS[0],80);await page.getByRole('button',{name:'Shared farm',exact:true}).click();await expect(page.getByRole('dialog',{name:'Shared farm options'})).toBeVisible();await page.getByRole('button',{name:'Close farm',exact:true}).click();
  await walkTo(page,sitePosition('toolshed')!,60);await expect(page.getByRole('button',{name:'Build toolshed',exact:true})).toBeVisible();
  await walkTo(page,{x:640,y:640},25);
  const profile=await page.evaluate(async()=>{const samples:number[]=[];let last=performance.now();await new Promise<void>(resolve=>{const sample=(t:number)=>{samples.push(t-last);last=t;if(samples.length<120)requestAnimationFrame(sample);else resolve();};requestAnimationFrame(sample);});samples.sort((a,b)=>a-b);return{median:samples[60],p95:samples[114],over33:samples.filter(t=>t>33.4).length};});
  const metrics=await inspect();expect(metrics.textureBytes).toBeLessThan(18*1024*1024);expect(metrics.largest).toBeLessThanOrEqual(1254);
  console.log('MEADOW_PROFILE',JSON.stringify({...profile,...metrics,players:(await presence(page)).players.length}));
  await page.screenshot({path:'/tmp/sanctuary-pass/playable.png'});
  await page.setViewportSize({width:390,height:844});await expect(page.getByRole('button',{name:/Campfire Radio/})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({path:'/tmp/sanctuary-pass/mobile.png'});
  expect(errors).toEqual([]);
 }finally{for(const ws of peers)ws.close();}
});
