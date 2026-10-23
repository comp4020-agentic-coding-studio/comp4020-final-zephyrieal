import type { Room } from "./rooms.ts";
import type { Player } from "./presence.ts";
export const MEADOW_WIDTH = 640;
export const MEADOW_HEIGHT = 512;
export const FEED_REACH = 64;
export const BUILD_REACH = 76;
export const CONSTRUCTION_SITES = [
  { projectId: "guinea-pig-house", xPercent: 78, yPercent: 22 },
  { projectId: "toolshed", xPercent: 15, yPercent: 20 },
  { projectId: "greenhouse", xPercent: 15, yPercent: 70 },
  { projectId: "bridge", xPercent: 78, yPercent: 70 },
  { projectId: "great-hall", xPercent: 50, yPercent: 85 },
];
export function inReach(player: Player | undefined, x: number, y: number, reach: number, room: Room = "outdoor"): boolean {
  return Boolean(player && player.room === room && Math.hypot(player.x - x, player.y - y) <= reach);
}
export function sitePosition(projectId: string) {
  const site = CONSTRUCTION_SITES.find(s => s.projectId === projectId);
  return site && { x: site.xPercent * MEADOW_WIDTH / 100, y: site.yPercent * MEADOW_HEIGHT / 100 };
}
