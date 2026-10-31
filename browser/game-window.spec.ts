import { test, expect } from "@playwright/test";
import { presence, walkTo } from "./walk-helper.ts";

test("game fills the window, sidebar resizes the canvas and controls keep focus", async ({page}) => {
  await page.setViewportSize({width:1280,height:800});
  const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
  await page.goto("/");await expect(page.getByRole("button",{name:"Wave",exact:true})).toBeEnabled();
  const layout=()=>page.evaluate(()=>{
    const canvas=document.querySelector("canvas")!;
    const rect=canvas.getBoundingClientRect();
    const side=document.querySelector(".game-sidebar")!.getBoundingClientRect();
    return {width:rect.width,height:rect.height,renderWidth:canvas.width,renderHeight:canvas.height,
      sideX:side.x,canvasRight:rect.right,scrollHeight:document.documentElement.scrollHeight,viewport:innerHeight};
  });
  await expect.poll(async()=>{const l=await layout();return Math.abs(l.width-l.renderWidth)+Math.abs(l.height-l.renderHeight);}).toBeLessThan(2);
  const initial=await layout();expect(initial.height).toBe(790);expect(initial.canvasRight).toBeLessThan(initial.sideX);
  expect(initial.scrollHeight).toBe(initial.viewport);
  await page.getByRole("button",{name:"Hide sidebar ›",exact:true}).click();
  await expect.poll(async()=>(await layout()).width).toBeGreaterThan(initial.width+300);
  await page.getByRole("button",{name:"‹ Open sidebar",exact:true}).click();
  await walkTo(page,{x:246,y:320},20);
  const self=async()=>{const ps=await presence(page);return ps.players.find(p=>p.id===ps.selfId)!;};
  const before=await self();const volume=page.getByRole("slider",{name:"Music volume",exact:true});
  await volume.focus();await page.keyboard.press("ArrowRight");await page.waitForTimeout(200);
  const after=await self();expect(Math.hypot(after.x-before.x,after.y-before.y)).toBeLessThan(2);
  await page.getByRole("button",{name:"Go inside",exact:true}).click();
  await expect(page.getByRole("region",{name:"Furnish this house"})).toBeVisible();
  expect(await page.locator("#game-sidebar .interior-furnishing").count()).toBe(1);
  await page.getByRole("button",{name:"Go back outside",exact:true}).click();
  await expect.poll(async()=>(await self()).room).toBe("outdoor");
  await page.setViewportSize({width:1084,height:1175});
  await expect.poll(async()=>{const l=await layout();return Math.abs(l.height-l.renderHeight);}).toBeLessThan(2);
  await page.locator(".sidebar-scroll").evaluate(el=>{el.scrollTop=0;});
  await page.screenshot({path:"/tmp/sanctuary-game-window.png"});
  expect(errors).toEqual([]);
});

test("small screens keep the map full-size with an accessible sidebar overlay", async ({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto("/");
  const open=page.getByRole("button",{name:"‹ Open sidebar",exact:true});await expect(open).toBeVisible();
  await expect(page.locator(".game-sidebar")).toBeHidden();
  const map=await page.locator("canvas").boundingBox();expect(map!.width).toBe(380);
  await open.click();await expect(page.getByRole("button",{name:"Wave",exact:true})).toBeEnabled();
  const side=await page.locator(".game-sidebar").boundingBox();expect(side!.x).toBeGreaterThanOrEqual(0);expect(side!.x+side!.width).toBeLessThanOrEqual(390);
  const volume=page.getByRole("slider",{name:"Music volume",exact:true});await volume.scrollIntoViewIfNeeded();await volume.fill("0.3");
  await page.screenshot({path:"/tmp/sanctuary-game-window-mobile.png"});
  await page.getByRole("button",{name:"Hide sidebar ›",exact:true}).click();await expect(page.locator(".game-sidebar")).toBeHidden();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
});
