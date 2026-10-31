import { test, expect } from "@playwright/test";
import { walkTo, presence } from "./walk-helper.ts";
test("campfire seats, shared queue, personal audio and return to exploration", async ({browser})=>{
 test.setTimeout(120000);
 const ca=await browser.newContext(),cb=await browser.newContext();
 const a=await ca.newPage(),b=await cb.newPage();const errors:string[]=[];
 for(const p of [a,b])p.on("pageerror",e=>errors.push(e.message));
 try {
  for(const p of [a,b]){await p.goto("/");await p.getByRole("button",{name:/Campfire Radio/}).click();await expect(p.getByRole("button",{name:"Wave",exact:true})).toBeEnabled();}
  await walkTo(a,{x:554,y:514},15);await walkTo(b,{x:726,y:514},15);
  await a.locator(".game-container").focus(); await a.keyboard.press("e");
  await b.locator(".game-container").focus(); await b.keyboard.press("e");
  await expect.poll(async()=> (await presence(b)).players.filter(p=>p.seatId).length).toBe(2);
  const id=(await presence(a)).selfId;
  const queue=async(page:typeof a,title:string)=>{await page.getByLabel("YouTube or YouTube Music link").fill("https://youtu.be/M7lc1UVf-VE");await page.getByLabel("Track name (optional)").fill(title);await page.getByRole("button",{name:"Queue YouTube track",exact:true}).click();};
  await expect.poll(async()=> (await presence(b)).players.find(p=>p.id===id)?.gesture).toBe("sit");
  await queue(a,"Ember lullaby");
  await expect(b.getByRole("status").filter({hasText:"Now playing: Ember lullaby"})).toBeVisible();
  await queue(b,"Under the stars");
  await expect(a.locator(".campfire-panel li")).toHaveText(["Under the stars"]);
  await expect(b.getByRole("button",{name:"Queue YouTube track",exact:true})).toBeDisabled();
  await queue(a,"Meadow afterglow");
  await expect(b.locator(".campfire-panel li")).toHaveText(["Under the stars · yours","Meadow afterglow"]);
  await a.getByRole("button",{name:"Mute music",exact:true}).click();
  await expect(a.getByRole("button",{name:"Unmute music",exact:true})).toHaveAttribute("aria-pressed","true");
  await expect(b.getByRole("button",{name:"Mute music",exact:true})).toHaveAttribute("aria-pressed","false");
  await a.getByRole("slider",{name:"Music volume",exact:true}).fill("0.12");
  await expect(b.getByRole("slider",{name:"Music volume",exact:true})).toHaveValue("0.25");
  await a.screenshot({path:"/tmp/campfire-gathering.png",fullPage:true});
  const late=await ca.newPage();await late.goto("/");await late.getByRole("button",{name:/Campfire Radio/}).click();
  await expect(late.locator(".campfire-panel li")).toHaveCount(2);
  await expect(late.getByRole("status").filter({hasText:"Now playing: Ember lullaby"})).toBeVisible();
  await a.getByRole("button",{name:"Skip my current YouTube track"}).click();
  await expect(a.getByRole("status").filter({hasText:"Now playing: Under the stars"})).toBeVisible({timeout:35000});
  await expect(b.getByRole("status").filter({hasText:"Now playing: Under the stars"})).toBeVisible();
  await expect(a.locator(".campfire-panel li")).toHaveText(["Meadow afterglow · yours"]);
  await late.close();
  await a.locator(".game-container").focus(); await a.keyboard.press("e");
  await expect.poll(async()=> (await presence(b)).players.find(p=>p.id===id)?.seatId).toBeUndefined();
  await walkTo(a,{x:480,y:200},20);
  await expect(a.getByRole("button",{name:"Sit on log 1",exact:true})).toHaveCount(0);
  await expect.poll(async()=> (await presence(b)).players.find(p=>p.id===id)?.x ?? 0).toBeGreaterThan(450);
  expect(errors).toEqual([]);
 }finally{
  for(const page of [a,b]) {
   await walkTo(page,{x:640,y:640},20);
   await page.getByRole("button",{name:"Remove my waiting track",exact:true}).click();
  }
  for(const page of [a,b]) {
   const skip=page.getByRole("button",{name:"Skip my current YouTube track",exact:true});
   if(await skip.count()) await skip.click();
  }
  await ca.close();await cb.close();
 }
});
