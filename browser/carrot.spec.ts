import { test, expect } from "@playwright/test";
import { walkTo, presence } from "./walk-helper.ts";
import { GIANT_CARROT as C } from "../src/shared/carrot.ts";
test("two visitors pull a carrot, share food and keep the result on reload", async ({browser})=>{
  const ca=await browser.newContext(), cb=await browser.newContext();
  const a=await ca.newPage(), b=await cb.newPage();
  const errors:string[]=[];
  for (const page of [a,b]) page.on("pageerror",e=>errors.push(e.message));
  try {
    await a.goto("/"); await b.goto("/");
    const state=()=>a.request.get("/api/state").then(r=>r.json());
    await expect.poll(async()=>Date.now()>=(await state()).carrot.readyAt,{timeout:35000}).toBe(true);
    await walkTo(a,{x:C.x-20,y:C.y},15); await walkTo(b,{x:C.x+20,y:C.y},15);
    const before=await state();
    await a.getByRole("button",{name:"Pull giant carrot",exact:true}).click();
    await expect(b.getByText("One visitor pulling · join in!",{exact:true})).toBeVisible({timeout:1000});
    await a.waitForTimeout(1200); expect((await state()).carrot.harvests).toBe(before.carrot.harvests);
    await b.getByRole("button",{name:"Pull giant carrot",exact:true}).click();
    await expect(a.getByText(/Pulling together/)).toBeVisible({timeout:1000});
    await expect.poll(async()=>(await state()).carrot.harvests,{timeout:5000}).toBe(before.carrot.harvests+1);
    await expect(b.getByText(/Pulled together! \+3 carrots/)).toBeVisible({timeout:1000});
    expect((await state()).farm.food.carrot).toBe(before.farm.food.carrot+3);
    await b.reload(); await expect.poll(async()=>(await presence(b)).connected).toBe(true);
    await expect(b.getByText(/Pulled together! \+3 carrots/)).toBeVisible();
    expect(await b.locator(".carrot-caption").evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThan(20);
    await b.screenshot({path:"/tmp/sanctuary-cooperative-carrot.png",fullPage:true});
    expect(errors).toEqual([]);
  } finally {await ca.close();await cb.close();}
});
