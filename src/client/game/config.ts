import Phaser from "phaser";
import { TILE_SIZE, HOUSE_WIDTH, HOUSE_HEIGHT } from "../../server/furniture.ts";
import { BootScene } from "./scenes/BootScene.ts";
import { OutdoorScene } from "./scenes/OutdoorScene.ts";
import { IndoorScene } from "./scenes/IndoorScene.ts";

export const GAME_WIDTH = TILE_SIZE * HOUSE_WIDTH;
export const GAME_HEIGHT = TILE_SIZE * HOUSE_HEIGHT;

export function createGameConfig(parent: HTMLElement): Phaser.Types.Core.GameConfig {
  return {
    type: Phaser.AUTO,
    parent,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    pixelArt: true, // nearest-neighbour rendering, no blur on scaled sprites
    backgroundColor: "#dcebd4",
    scene: [BootScene, OutdoorScene, IndoorScene],
  };
}
