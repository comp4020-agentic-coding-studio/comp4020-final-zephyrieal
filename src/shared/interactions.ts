import type { Room } from "./rooms.ts";
import type { Player } from "./presence.ts";
export const MEADOW_WIDTH = 1280;
export const MEADOW_HEIGHT = 1024;
export const FEED_REACH = 64;
export const BUILD_REACH = 76;
export const CONSTRUCTION_SITES = [
  { projectId: "guinea-pig-house", xPercent: 80, yPercent: 24 },
  { projectId: "toolshed", xPercent: 19, yPercent: 24 },
  { projectId: "greenhouse", xPercent: 20, yPercent: 73 },
  { projectId: "bridge", xPercent: 81, yPercent: 72 },
  { projectId: "great-hall", xPercent: 50, yPercent: 84 },
];
export function inReach(player: Player | undefined, x: number, y: number, reach: number, room: Room = "outdoor"): boolean {
  return Boolean(player && player.room === room && Math.hypot(player.x - x, player.y - y) <= reach);
}
export function sitePosition(projectId: string) {
  const site = CONSTRUCTION_SITES.find(s => s.projectId === projectId);
  return site && { x: site.xPercent * MEADOW_WIDTH / 100, y: site.yPercent * MEADOW_HEIGHT / 100 };
}

// Indoor coordinates retain their established furniture grid.
export const roomDimensions = (room: Room = "outdoor") => room === "outdoor"
  ? { width: MEADOW_WIDTH, height: MEADOW_HEIGHT } : { width: 640, height: 512 };
