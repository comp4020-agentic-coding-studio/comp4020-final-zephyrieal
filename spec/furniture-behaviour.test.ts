import { expect, it } from "vitest";
import { visitHouse, tickInhabitant, inhabitantPosition, clearIndoorPoint } from "../src/server/indoor-guinea-pigs.ts";
for (const [kind, activity] of [["hay_bed","resting"],["hideout","hiding"],["tunnel","exploring"]] as const) {
  it(`autonomously uses ${kind}, shares its current activity, then leaves`, () => {
    const start = 100000;
    const piece = { id: 1, kind, tile_x: 4, tile_y: 4, width: kind === "tunnel" ? 3 : 2, height: kind === "tunnel" ? 1 : 2, rotation: 0 as const, version: 0 };
    const visit = visitHouse("indoor", [piece], start)!;
    expect(visit).toBeDefined();
    const approach = tickInhabitant(visit.guineaPigId, () => [piece], start+2000, () => 0)!;
    expect(approach.durationMs).toBeGreaterThan(0);
    const arrived = approach.startedAt + approach.durationMs;
    expect(tickInhabitant(visit.guineaPigId, () => [piece], arrived, () => 0)?.activity).toBe(activity);
    expect(inhabitantPosition(visit.guineaPigId, arrived+3000).activity).toBe(activity);
    const leaving = tickInhabitant(visit.guineaPigId, () => [piece], arrived+6000, () => 0)!;
    expect(leaving.activity).toBeUndefined();
    expect(clearIndoorPoint(leaving.targetX*6.4, leaving.targetY*5.12, [piece])).toBe(true);
    tickInhabitant(visit.guineaPigId, () => [piece], leaving.startedAt+leaving.durationMs, () => 0);
    expect(inhabitantPosition(visit.guineaPigId, leaving.startedAt+leaving.durationMs).activity).toBeUndefined();
    tickInhabitant(visit.guineaPigId, () => [], start+91000);
  });
}
it("storing furniture interrupts use and clears the activity in snapshots", () => {
  const start=300000, piece={ id: 1, kind: "hideout", tile_x:4,tile_y:4,width:2,height:2 };
  const visit=visitHouse("indoor",[piece],start)!;
  const approach=tickInhabitant(visit.guineaPigId,()=>[piece],start+2000,()=>0)!;
  const arrived=approach.startedAt+approach.durationMs;
  tickInhabitant(visit.guineaPigId,()=>[piece],arrived,()=>0);
  expect(tickInhabitant(visit.guineaPigId,()=>[],arrived+100)?.activity).toBeUndefined();
  expect(inhabitantPosition(visit.guineaPigId,arrived+100).activity).toBeUndefined();
  tickInhabitant(visit.guineaPigId,()=>[],start+91000);
});
