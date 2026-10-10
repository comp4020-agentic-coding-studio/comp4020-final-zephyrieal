import { TILE_SIZE, HOUSE_WIDTH, HOUSE_HEIGHT } from "../../server/furniture.ts";

// The canvas is deliberately bigger than the house's own fixed grid (10x8
// tiles at 32px each --- that's the furniture spec, not a rendering choice).
// Decoupling the two gives the outdoor meadow real room to move around in,
// and the house a visible margin instead of filling the whole frame edge to
// edge. Kept in its own module (not game/config.ts) so both config.ts and
// the Scenes can import it without a circular dependency.
export const GAME_WIDTH = 640;
export const GAME_HEIGHT = 512;

export const HOUSE_PIXEL_WIDTH = HOUSE_WIDTH * TILE_SIZE;
export const HOUSE_PIXEL_HEIGHT = HOUSE_HEIGHT * TILE_SIZE;
export const HOUSE_ORIGIN_X = Math.round((GAME_WIDTH - HOUSE_PIXEL_WIDTH) / 2);
export const HOUSE_ORIGIN_Y = Math.round((GAME_HEIGHT - HOUSE_PIXEL_HEIGHT) / 2);
