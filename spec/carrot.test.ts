import { afterEach, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createCarrot } from "../src/server/carrot.ts";
import { GIANT_CARROT as C } from "../src/shared/carrot.ts";
import type { Player } from "../src/shared/presence.ts";
import { changeFarm } from "../src/server/farm.ts";
const databases: DatabaseSync[] = [], folders: string[] = [];
afterEach(() => { for (const db of databases) db.close(); databases.length=0; for (const p of folders) rmSync(p,{recursive:true,force:true}); folders.length=0; });
function fixture(path = ":memory:") {
  const db = new DatabaseSync(path); databases.push(db);
  db.exec("CREATE TABLE IF NOT EXISTS farm_food(crop TEXT PRIMARY KEY, quantity INTEGER NOT NULL DEFAULT 0)");
  const players = new Map<string, Player>();
  const add = (visitor: string, id = visitor) => {
    players.set(visitor+":"+id,{ id, room:"outdoor",x:C.x,y:C.y,facing:1,moving:false,color:0 });
  };
  add("a"); add("b");
  const controller = createCarrot(db,(visitor,id)=>players.get(visitor+":"+id));
  return {db,players,add,controller};
}
function finish(c: ReturnType<typeof createCarrot>, start=0) { for (let n=100;n<=C.pullMs;n+=100) c.tick(start+n); }
it("requires distinct visitors even when one opens two tabs",()=>{
  const {controller:c,add,db}=fixture(); add("a","second");
  c.act("a","a",1,"join",0); c.act("a","second",1,"join",0); finish(c);
  expect(c.state(3000).pullers).toEqual(["second"]); expect(c.state(3000).harvests).toBe(0);
  expect(db.prepare("SELECT * FROM farm_food").all()).toEqual([]);
});
it("commits one shared reward, rejects stale retries and respects regrowth",()=>{
  const {controller:c,db}=fixture();
  c.act("a","a",1,"join",0); c.act("b","b",1,"join",0); finish(c);
  expect(c.state(3000)).toMatchObject({round:2,harvests:1,readyAt:33000,pullers:[],progressMs:0});
  expect(db.prepare("SELECT quantity FROM farm_food WHERE crop='carrot'").get()).toMatchObject({quantity:3});
  expect(c.act("a","a",1,"join",3001).ok).toBe(false);
  expect(c.act("b","b",2,"join",3001).ok).toBe(false);
  finish(c,4000);
  expect(c.state(7000).harvests).toBe(1);
  expect(c.act("a","a",2,"join",33000).ok).toBe(true);
});
it("resets progress on departure and does not credit time spent alone",()=>{
  const {controller:c,players}=fixture();
  c.act("a","a",1,"join",0); c.act("b","b",1,"join",1000); c.tick(1100);
  expect(c.state(1100).progressMs).toBe(100);
  players.get("b:b")!.x=0; c.tick(1200);
  expect(c.state(1200).progressMs).toBe(0);
  players.get("b:b")!.x=C.x; c.act("b","b",1,"join",5000); c.tick(5100);
  expect(c.state(5100).progressMs).toBe(100);
  players.delete("b:b"); c.tick(5200); expect(c.state(5200).pullers).toEqual(["a"]);
  expect(c.state(15000).pullers).toEqual([]);
});
it("rejects forged avatars and indoor participation; leaving cancels readiness",()=>{
  const {controller:c,players}=fixture();
  expect(c.act("a","b",1,"join",0).ok).toBe(false);
  players.get("a:a")!.room="indoor"; expect(c.act("a","a",1,"join",0).ok).toBe(false);
  players.get("a:a")!.room="outdoor"; c.act("a","a",1,"join",0);
  c.act("a","a",1,"leave",100); expect(c.state(100).pullers).toEqual([]);
});
it("retains reward and cooldown across a database reopen but drops unfinished presence",()=>{
  const dir=mkdtempSync(join(tmpdir(),"sanctuary-carrot-")); folders.push(dir);
  const path=join(dir,"world.db"), f=fixture(path);
  f.controller.act("a","a",1,"join",0); f.controller.act("b","b",1,"join",0); finish(f.controller);
  f.db.close(); databases.splice(databases.indexOf(f.db),1);
  const next=fixture(path);
  expect(next.controller.state(4000)).toMatchObject({round:2,harvests:1,readyAt:33000,pullers:[],progressMs:0});
  expect(next.db.prepare("SELECT quantity FROM farm_food WHERE crop='carrot'").get()).toMatchObject({quantity:3});
});
it("does not allow solo garden planting of carrots",()=>{
  const {db}=fixture(); expect(changeFarm(db,"a","plant",0,"carrot",1,"plant",0).ok).toBe(false);
});
