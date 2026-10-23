import { test, expect } from "@playwright/test";
import { DatabaseSync } from "node:sqlite";
import { walkTo, presence } from "./walk-helper.ts";

test("completed buildings have separate public rooms, furniture and entrances", async ({ browser }) => {
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
  async function enter(p: typeof a, id: string, x: number, y: number) {
    await walkTo(p,{x,y},40);
    await p.getByRole("button",{name:`Enter ${id}`,exact:true}).click();
    await expect.poll(()=>room(p)).toBe(`house:${id}`);
  }
  try {
    await a.goto("/"); await b.goto("/");
    await expect.poll(async () => (await presence(a)).connected).toBe(true);
    const aid = (await presence(a)).selfId;
    expect((await a.request.post("/api/room",{headers:{"X-Player-Id":aid},data:{room:"house:guinea-pig-house"}})).status()).toBe(403);
    await enter(a,"guinea-pig-house",499.2,112.64);
    await enter(b,"toolshed",96,102.4);
    await expect(a.getByRole("status")).toContainText("Other visitors will appear");
    await expect(b.getByRole("status")).toContainText("Other visitors will appear");
    // Grant test-only funds directly in the disposable database.
    const cookie = (await ca.cookies()).find(c=>c.name==="visitor")!.value.split(".")[0];
    const funds = new DatabaseSync(process.env.SANCTUARY_TEST_DB!);
    funds.prepare("INSERT INTO care_point_transactions(visitor_id,delta,reason,request_id) VALUES (?,100,'test fixture',?)").run(cookie,crypto.randomUUID());funds.close();
    const placed = await a.request.post("/api/furniture/place",{headers:{"X-Player-Id":aid},data:{kind:"hay_bed",tileX:1,tileY:1,requestId:crypto.randomUUID()}});
    expect(placed.status()).toBe(200);
    const item = (await placed.json()).furniture;
    expect(item.room_id).toBe("house:guinea-pig-house");
    const other = await b.request.get("/api/state?room=house:toolshed").then(r=>r.json());
    expect(other.furniture.some((f:{id:number})=>f.id===item.id)).toBe(false);
    const bid=(await presence(b)).selfId;
    expect((await b.request.post("/api/furniture/store",{headers:{"X-Player-Id":bid},data:{id:item.id,version:item.version,requestId:crypto.randomUUID()}})).status()).toBe(403);
    await b.getByRole("button",{name:"Go back outside"}).click();
    await expect.poll(()=>room(b)).toBe("outdoor");
    const outside=(await presence(b)).players.find(p=>p.id===bid)!;
    expect(Math.hypot(outside.x-96,outside.y-142.4)).toBeLessThan(5);
    await enter(b,"guinea-pig-house",499.2,112.64);
    await expect(b.getByRole("status")).toContainText("1 other visitor");
    await expect.poll(()=>b.evaluate(async()=>{const path="/game/sanctuaryState.ts";return (await import(path)).sanctuaryState.furniture.length;})).toBe(1);
    expect(errors).toEqual([]);
  } finally { await ca.close();await cb.close(); }
});
