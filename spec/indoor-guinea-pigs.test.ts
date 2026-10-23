import { expect, it } from "vitest";
import { clearIndoorPath, clearIndoorPoint, visitHouse, tickInhabitant, inhabitantPosition } from "../src/server/indoor-guinea-pigs.ts";
it("keeps indoor paths inside walls and outside furniture, including crossing paths", () => {
  const pieces = [{ tile_x: 4, tile_y: 3, width: 2, height: 2 }];
  expect(clearIndoorPoint(200, 200, [])).toBe(false);
  expect(clearIndoorPoint(320, 240, pieces)).toBe(false);
  expect(clearIndoorPath({x: 240,y: 240},{x: 400,y: 240},pieces)).toBe(false);
  expect(clearIndoorPath({x: 240,y: 180},{x: 400,y: 180},pieces)).toBe(true);
});
it("visits one shared room, wanders, and returns without creating duplicate inhabitants", () => {
  const start = Date.now();
  const visit = visitHouse("indoor", [], start)!;
  expect(visit).toBeDefined();
  expect(visitHouse("indoor", [], start)).toBeUndefined();
  expect(inhabitantPosition(visit.guineaPigId, start).room).toBe("indoor");
  const walk = tickInhabitant(visit.guineaPigId, () => [], start + 2000, () => 0)!;
  expect(walk.durationMs).toBeGreaterThan(0);
  expect(clearIndoorPath({x: walk.x * 6.4,y: walk.y * 5.12}, {x: walk.targetX * 6.4,y: walk.targetY * 5.12}, [])).toBe(true);
  const other = visitHouse("house:toolshed", [], start)!;
  expect(other.guineaPigId).not.toBe(visit.guineaPigId);
  expect(tickInhabitant(visit.guineaPigId, () => [], start + 91000)?.room).toBe("outdoor");
  tickInhabitant(other.guineaPigId, () => [], start + 91000);
});
