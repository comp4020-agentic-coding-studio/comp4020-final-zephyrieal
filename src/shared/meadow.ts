import { CONSTRUCTION_SITES, MEADOW_WIDTH, MEADOW_HEIGHT } from "./interactions.ts";
import { CAMPFIRE, CAMPFIRE_LOGS } from "./campfire.ts";
export interface Obstacle { id: string; x: number; y: number; width: number; height: number }
export const SCENERY = [
  {x:120,y:150,kind:"tree"}, {x:370,y:130,kind:"pine"}, {x:760,y:130,kind:"pink"},
  {x:1100,y:150,kind:"tree"}, {x:1170,y:390,kind:"pine"}, {x:1130,y:650,kind:"pink"},
  {x:1160,y:900,kind:"tree"}, {x:880,y:900,kind:"pine"}, {x:390,y:900,kind:"tree"},
  {x:120,y:900,kind:"pink"}, {x:110,y:570,kind:"tree"}, {x:110,y:350,kind:"pine"},
  {x:390,y:440,kind:"tree"}, {x:880,y:340,kind:"tree"}, {x:840,y:710,kind:"pink"},
  {x:390,y:670,kind:"pine"}, {x:190,y:420,kind:"rock"}, {x:1030,y:600,kind:"rock"},
  {x:500,y:800,kind:"rock"}, {x:760,y:220,kind:"rock"},
  {x:215,y:140,kind:"tree"}, {x:470,y:135,kind:"pink"}, {x:610,y:140,kind:"tree"},
  {x:930,y:135,kind:"pine"}, {x:1180,y:150,kind:"pine"},
  {x:230,y:930,kind:"tree"}, {x:450,y:930,kind:"pink"}, {x:960,y:930,kind:"tree"},
  {x:100,y:265,kind:"tree"}, {x:100,y:455,kind:"pink"}, {x:100,y:750,kind:"pine"},
  {x:1180,y:270,kind:"tree"}, {x:1180,y:525,kind:"tree"}, {x:1180,y:770,kind:"pine"},
] as const;
// Feet-level rectangles, used by both the artwork and the authoritative simulation.
export const MEADOW_OBSTACLES: Obstacle[] = [
  ...SCENERY.map((s,i)=>({id:`scenery-${i}`,x:s.x-(s.kind==="rock"?19:10),y:s.y-10,width:s.kind==="rock"?38:20,height:20})),
  ...CONSTRUCTION_SITES.filter(s=>s.projectId!=="bridge").map(s=>({id:s.projectId,x:s.xPercent*MEADOW_WIDTH/100-48,y:s.yPercent*MEADOW_HEIGHT/100-52,width:96,height:49})),
  {id:"fire",x:CAMPFIRE.x-29,y:CAMPFIRE.y-18,width:58,height:36},
  ...CAMPFIRE_LOGS.map(log=>({id:log.id,x:log.x-log.width/2,y:log.y-log.height/2,width:log.width,height:log.height})),
];
export function blockedMeadow(x:number,y:number,radius=8, ignore?:string) {
  return MEADOW_OBSTACLES.some(o=>o.id!==ignore && x>o.x-radius && x<o.x+o.width+radius && y>o.y-radius && y<o.y+o.height+radius);
}
export function clearMeadowPath(ax:number,ay:number,bx:number,by:number,radius=14) {
  const steps=Math.max(1,Math.ceil(Math.hypot(bx-ax,by-ay)/4));
  return !MEADOW_OBSTACLES.some(o=>{
    // Allow an inhabitant already inside a newly introduced footprint to leave it.
    if(ax>o.x-radius && ax<o.x+o.width+radius && ay>o.y-radius && ay<o.y+o.height+radius) return false;
    for(let i=1;i<=steps;i++){const x=ax+(bx-ax)*i/steps,y=ay+(by-ay)*i/steps;
      if(x>o.x-radius && x<o.x+o.width+radius && y>o.y-radius && y<o.y+o.height+radius)return true;}
    return false;
  });
}
