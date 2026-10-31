import {it,expect} from "vitest";
import {MEADOW_OBSTACLES,SCENERY} from "../src/shared/meadow.ts";
import {stepPlayer,type Player} from "../src/shared/presence.ts";
import {SEATS} from "../src/shared/campfire.ts";
it("every tree, house, boulder and log blocks approaches from all four sides",()=>{
 for(const obstacle of MEADOW_OBSTACLES){
  const cases=[
   {x:obstacle.x-22,y:obstacle.y+obstacle.height/2,dx:1,dy:0,axis:"x",limit:obstacle.x-8,less:true},
   {x:obstacle.x+obstacle.width+22,y:obstacle.y+obstacle.height/2,dx:-1,dy:0,axis:"x",limit:obstacle.x+obstacle.width+8,less:false},
   {x:obstacle.x+obstacle.width/2,y:obstacle.y-22,dx:0,dy:1,axis:"y",limit:obstacle.y-8,less:true},
   {x:obstacle.x+obstacle.width/2,y:obstacle.y+obstacle.height+22,dx:0,dy:-1,axis:"y",limit:obstacle.y+obstacle.height+8,less:false},
  ] as const;
  for(const approach of cases){
   const p:Player={id:"collision",room:"outdoor",x:approach.x,y:approach.y,facing:1,moving:false,color:0};
   for(let step=0;step<20;step++)stepPlayer(p,approach.dx,approach.dy,.05);
   if(approach.less)expect(p[approach.axis],`${obstacle.id}: ${approach.axis} approach`).toBeLessThanOrEqual(approach.limit);
   else expect(p[approach.axis],`${obstacle.id}: ${approach.axis} approach`).toBeGreaterThanOrEqual(approach.limit);
  }
 }
});
it("every rendered solid scenery item and seat has an authoritative footprint",()=>{
 for(const [index] of SCENERY.entries())expect(MEADOW_OBSTACLES.some(o=>o.id===`scenery-${index}`)).toBe(true);
 for(const seat of SEATS)expect(MEADOW_OBSTACLES.some(o=>o.id===seat.id)).toBe(true);
});
