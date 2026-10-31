import {it,expect} from "vitest";
import {radioDistanceGain} from "../src/client/game/radioDistance.ts";
import {CAMPFIRE} from "../src/shared/campfire.ts";
const at=(distance:number)=>({room:"outdoor" as const,x:CAMPFIRE.x+distance,y:CAMPFIRE.y});
it("keeps gathering volume full and fades continuously across the interaction boundary",()=>{
 expect(radioDistanceGain(at(0))).toBe(1);
 expect(radioDistanceGain(at(CAMPFIRE.reach))).toBe(1);
 expect(radioDistanceGain(at(CAMPFIRE.reach+.01))).toBeCloseTo(1,6);
 let previous=1;
 for(let distance=CAMPFIRE.reach;distance<1200;distance++){
  const gain=radioDistanceGain(at(distance));
  expect(gain).toBeLessThanOrEqual(previous);expect(gain).toBeGreaterThanOrEqual(.15-Number.EPSILON);
  expect(Math.abs(previous-gain)).toBeLessThan(.004);previous=gain;
 }
});
it("retains quiet ambience far away and in interiors without invalid volume values",()=>{
 expect(radioDistanceGain(at(900))).toBeCloseTo(.15);
 expect(radioDistanceGain({...at(0),room:"indoor"})).toBe(.15);
 expect(radioDistanceGain(undefined)).toBe(.15);
 expect(radioDistanceGain({...at(0),x:NaN})).toBe(.15);
});
