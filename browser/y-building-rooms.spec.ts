import { test, expect } from "@playwright/test";
import { DatabaseSync } from "node:sqlite";
import { walkTo, presence, leaveRoom } from "./walk-helper.ts";
import { sitePosition } from "../src/shared/interactions.ts";

test("the shelter building opens the shared shelter; other buildings keep separate rooms", async ({ browser }) => {
  test.skip(!process.env.SANCTUARY_TEST_DB, "Requires the isolated integration database fixture");
  test.setTimeout(60000);
  const db = new DatabaseSync(process.env.SANCTUARY_TEST_DB!);
  db.prepare("UPDATE construction_projects SET progress_units = 10000, status = 'completed' WHERE id = 'guinea-pig-house'").run();
  db.prepare("UPDATE construction_projects SET progress_units = 50000, status = 'completed' WHERE id = 'toolshed'").run();
  db.close();
  const ca = await browser.newContext(), cb = await browser.newContext();
  const a = await ca.newPage(), b = await cb.newPage();
  const errors: string[] = [];
  for (const p of [a,b]) p.on("pageerror", e => errors.push(e.message));
  const room = async (p: typeof a) => {const s = await presence(p);return s.players.find(v=>v.id===s.selfId)?.room;};
  async function enter(p: typeof a, id: string) {
    await p.bringToFront();
    await walkTo(p,sitePosition(id)!,40);
    await p.getByRole("button",{name:`Enter ${id}`,exact:true}).click();
    await expect.poll(()=>room(p)).toBe(id === "guinea-pig-house" ? "indoor" : `house:${id}`);
  }
  try {
    await a.goto("/"); await b.goto("/");
    await expect.poll(async () => (await presence(a)).connected).toBe(true);
    const aid = (await presence(a)).selfId;
    expect((await a.request.post("/api/room",{headers:{"X-Player-Id":aid},data:{room:"indoor"}})).status()).toBe(403);
    expect((await a.request.post("/api/room",{headers:{"X-Player-Id":aid},data:{room:"house:guinea-pig-house"}})).status()).toBe(403);
    await enter(a,"guinea-pig-house");
    await enter(b,"toolshed");
    await expect(a.locator(".presence-status")).toContainText("Other visitors will appear");
    await expect(b.locator(".presence-status")).toContainText("Other visitors will appear");
    // Grant test-only funds directly in the disposable database.
    const cookie = (await ca.cookies()).find(c=>c.name==="visitor")!.value.split(".")[0];
    const funds = new DatabaseSync(process.env.SANCTUARY_TEST_DB!);
    funds.prepare("INSERT INTO care_point_transactions(visitor_id,delta,reason,request_id) VALUES (?,100,'test fixture',?)").run(cookie,crypto.randomUUID());funds.close();
    const placed = await a.request.post("/api/furniture/place",{headers:{"X-Player-Id":aid},data:{kind:"hay_bed",tileX:1,tileY:1,requestId:crypto.randomUUID()}});
    expect(placed.status()).toBe(200);
    const item = (await placed.json()).furniture;
    expect(item.room_id).toBe("indoor");
    const other = await b.request.get("/api/state?room=house:toolshed").then(r=>r.json());
    expect(other.furniture.some((f:{id:number})=>f.id===item.id)).toBe(false);
    const bid=(await presence(b)).selfId;
    expect((await b.request.post("/api/furniture/store",{headers:{"X-Player-Id":bid},data:{id:item.id,version:item.version,requestId:crypto.randomUUID()}})).status()).toBe(403);
    await leaveRoom(b);
    await expect.poll(()=>room(b)).toBe("outdoor");
    const outside=(await presence(b)).players.find(p=>p.id===bid)!;
    const shed=sitePosition("toolshed")!;
    expect(Math.hypot(outside.x-shed.x,outside.y-shed.y-40)).toBeLessThan(60);
    await enter(b,"guinea-pig-house");
    await expect(b.locator(".presence-status")).toContainText("1 other visitor");
    await expect.poll(()=>b.evaluate(async(id)=>{const path="/game/sanctuaryState.ts";return (await import(path)).sanctuaryState.furniture.some((f:{id:number})=>f.id===id);},item.id)).toBe(true);
    expect(errors).toEqual([]);
  } finally { await ca.close();await cb.close(); }
});
