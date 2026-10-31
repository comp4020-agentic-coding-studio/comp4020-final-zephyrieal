import { meadowRoute } from "../spec/meadow-route.ts";
import { roomDimensions } from "../src/shared/interactions.ts";
import { sitePosition } from "../src/shared/interactions.ts";
import { roomBuilding, SHELTER_BUILDING } from "../src/shared/rooms.ts";
import { expect, type Page } from "@playwright/test";
export async function presence(page: Page) {
  return page.evaluate(async () => { const path = "/game/presenceState.ts"; return (await import(path)).presenceState; });
}
export async function walkTo(page: Page, target: string | { x: number; y: number }, reach = 35) {
  await expect.poll(async () => (await presence(page)).connected).toBe(true);
  if (typeof target === "string") {
    const state = await page.request.get("/api/state").then(r => r.json());
    const pig = state.guineaPigs.find((p: {id: string}) => p.id === (target === "feed" ? "potato" : target));
    const room = pig?.movement.room ?? "outdoor";
    const ps = await presence(page);
    const current = ps.players.find(p => p.id === ps.selfId)?.room;
    if (current !== room) {
      if (current !== "outdoor") await leaveRoom(page);
      if (room !== "outdoor") await enterBuilding(page, roomBuilding(room)!);
      await expect.poll(async () => { const ps = await presence(page); return ps.players.find(p => p.id === ps.selfId)?.room; }).toBe(room);
    }
  }
  await page.locator(".game-container").focus();
  const initial=await presence(page),visitor=initial.players.find(v=>v.id===initial.selfId);
  if(visitor?.seatId){await page.keyboard.down("s");await page.waitForTimeout(150);await page.keyboard.up("s");}
  let held: string[] = [];
  let route:{x:number;y:number}[]=[];
  try {
    for (let i = 0; i < 600; i++) {
      const state = await presence(page), self = state.players.find(p => p.id === state.selfId);
      const destination = typeof target === "string"
        ? await page.request.get("/api/state").then(r => r.json()).then(s => ({ x: (target === "feed" ? s.guineaPigMovement : s.guineaPigs.find((p: { id: string }) => p.id === target).movement).x * (roomDimensions(self.room).width/100), y: (target === "feed" ? s.guineaPigMovement : s.guineaPigs.find((p: { id: string }) => p.id === target).movement).y * (roomDimensions(self.room).height/100) })) : target;
      if (Math.hypot(destination.x-self.x,destination.y-self.y)<=reach) return;
      if(self.room==="outdoor" && !route.length)route=meadowRoute(self,destination,Math.max(8,reach-8));
      while(route.length>1 && Math.hypot(route[0].x-self.x,route[0].y-self.y)<5)route.shift();
      const waypoint=self.room==="outdoor"?(route[0]??destination):destination;
      const dx = waypoint.x - self.x, dy = waypoint.y - self.y;
      if(route.length===1 && Math.hypot(dx,dy)<14 && typeof target==="string")route=[];
      const next = Math.abs(dx)>Math.abs(dy)
        ? (Math.abs(dx)>3?[dx<0?"a":"d"]:[])
        : (Math.abs(dy)>3?[dy<0?"w":"s"]:[]);
      for (const key of held.filter(k => !next.includes(k))) await page.keyboard.up(key);
      for (const key of next.filter(k => !held.includes(k))) await page.keyboard.down(key);
      held = next;
      await page.waitForTimeout(50);
    }
    throw new Error(`Could not walk to ${JSON.stringify(target)}: ${JSON.stringify(await presence(page))}; route ${JSON.stringify(route)}`);
  } finally { for (const key of held) await page.keyboard.up(key); }
}
export async function feedHuahua(page: Page) {
  await walkTo(page, "feed");
  await page.getByRole("button", { name: "Feed Huahua", exact: true }).click();
  const response = page.waitForResponse(r => r.url().endsWith("/api/feed") && r.request().method() === "POST");
  await page.getByRole("dialog", { name: "Feed Huahua food choices" }).getByRole("button", { name: "Hay", exact: true }).click();
  expect((await response).status()).toBe(200);
}
async function selfRoom(page: Page) { const ps = await presence(page); return ps.players.find(p => p.id === ps.selfId)?.room; }
// Buildings are entered on foot: walk to the doorway, then take its Enter action.
export async function enterBuilding(page: Page, project: string) {
  await walkTo(page, sitePosition(project)!, 40);
  await page.getByRole("button", { name: `Enter ${project}`, exact: true }).click();
  await expect.poll(() => selfRoom(page)).not.toBe("outdoor");
}
export const enterShelter = (page: Page) => enterBuilding(page, SHELTER_BUILDING);
// Indoor spawn sits just above the doorway, so walking down leaves the room.
export async function leaveRoom(page: Page) {
  await page.locator(".game-container").focus();
  await page.keyboard.down("s");
  try { await expect.poll(() => selfRoom(page), { timeout: 10000 }).toBe("outdoor"); }
  finally { await page.keyboard.up("s"); }
}
