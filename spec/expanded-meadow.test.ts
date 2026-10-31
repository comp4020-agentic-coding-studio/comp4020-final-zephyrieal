import {it,expect} from "vitest";
import {meadowRoute} from "./meadow-route.ts";
import {CONSTRUCTION_SITES,sitePosition,roomDimensions,MEADOW_WIDTH,MEADOW_HEIGHT} from "../src/shared/interactions.ts";
import {CAMPFIRE,SEATS} from "../src/shared/campfire.ts";
import {FARM_PLOTS} from "../src/shared/farm.ts";
import {GIANT_CARROT} from "../src/shared/carrot.ts";
import {MEADOW_OBSTACLES,blockedMeadow,clearMeadowPath} from "../src/shared/meadow.ts";
import {pickNextTarget} from "../src/server/guinea-pig.ts";
import {spawnIn,stepPlayer,type Player} from "../src/shared/presence.ts";
it("doubles actual world dimensions while preserving the indoor grid",()=>{
 expect([MEADOW_WIDTH,MEADOW_HEIGHT]).toEqual([1280,1024]);expect(roomDimensions("indoor")).toEqual({width:640,height:512});
});
it("keeps all activities, logs, and four far corners reachable from arrival",()=>{
 const destinations=[...CONSTRUCTION_SITES.map(s=>sitePosition(s.projectId)!),...FARM_PLOTS,GIANT_CARROT,...SEATS,CAMPFIRE,{x:80,y:112},{x:1200,y:112},{x:80,y:944},{x:1200,y:944}];
 for(const target of destinations){const route=meadowRoute(spawnIn("outdoor"),target,40);expect(Math.hypot(route.at(-1)!.x-target.x,route.at(-1)!.y-target.y)).toBeLessThanOrEqual(40);for(const point of route.slice(1))expect(blockedMeadow(point.x,point.y,14)).toBe(false);}
});
it("blocks visible footprints without tunnelling and permits sliding",()=>{
 for(const o of MEADOW_OBSTACLES){
 const player:Player={id:"test",room:"outdoor",x:o.x-9,y:o.y+o.height/2,facing:1,moving:false,color:0};
 stepPlayer(player,1,0,.1);expect(player.x).toBe(o.x-9);
 const beforeY=player.y;stepPlayer(player,1,1,.1);expect(player.y).toBeGreaterThan(beforeY);
 }
});
it("animals avoid every solid footprint across 2000 decisions in expanded coordinates",()=>{
 let seed=23;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 let x=50,y=62,moves=0;
 for(let i=0;i<2000;i++){const t=pickNextTarget(x,y,random);expect(clearMeadowPath(x*12.8,y*10.24,t.targetX*12.8,t.targetY*10.24)).toBe(true);if(Math.hypot(t.targetX-x,t.targetY-y)>1)moves++;x=t.targetX;y=t.targetY;}
 expect(moves).toBeGreaterThan(1900);
});
