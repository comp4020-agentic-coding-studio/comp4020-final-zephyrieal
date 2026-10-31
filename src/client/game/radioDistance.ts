import { CAMPFIRE } from "../../shared/campfire.ts";
import type { Player } from "../../shared/presence.ts";

// Listening is local ambience, independent of the server's range checks for queuing.
// Keep the gathering at full volume, then fade over 400 pixels to a quiet floor.
export function radioDistanceGain(player: Pick<Player,"room"|"x"|"y"> | undefined): number {
  const quiet=.15;
  if(!player || player.room!=="outdoor" || !Number.isFinite(player.x) || !Number.isFinite(player.y))return quiet;
  const distance=Math.hypot(player.x-CAMPFIRE.x,player.y-CAMPFIRE.y);
  const t=Math.max(0,Math.min(1,(distance-CAMPFIRE.reach)/400));
  return 1-(1-quiet)*t*t*(3-2*t);
}
