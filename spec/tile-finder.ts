// Fixed tile coordinates would only be safe for one clean run against a
// fresh database (CI always gets one, via --tmpfs /data) --- a local dev
// loop that reruns `pnpm check` against the same persisted
// data/sanctuary.db would accumulate furniture across runs and eventually
// find "its" tile already taken. Scanning for whatever's actually free right
// now, reusing the server's own isValidPlacement, makes these tests robust
// to either.
import { HOUSE_WIDTH, HOUSE_HEIGHT, isValidPlacement } from "../src/server/furniture.ts";

interface Footprint {
  tile_x: number;
  tile_y: number;
  width: number;
  height: number;
}

export function findFreeTile(
  existing: Footprint[],
  kind: string,
): { tileX: number; tileY: number } {
  for (let y = 0; y < HOUSE_HEIGHT; y++) {
    for (let x = 0; x < HOUSE_WIDTH; x++) {
      if (isValidPlacement(kind, x, y, existing).ok) return { tileX: x, tileY: y };
    }
  }
  throw new Error(`no free tile for "${kind}" --- the house (${HOUSE_WIDTH}x${HOUSE_HEIGHT}) is full`);
}
