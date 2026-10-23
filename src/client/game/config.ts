import Phaser from "phaser";
import { GAME_WIDTH, GAME_HEIGHT } from "./layout.ts";
import { BootScene } from "./scenes/BootScene.ts";
import { OutdoorScene } from "./scenes/OutdoorScene.ts";
import { IndoorScene } from "./scenes/IndoorScene.ts";

export function createGameConfig(parent: HTMLElement): Phaser.Types.Core.GameConfig {
  return {
    type: Phaser.AUTO,
    parent,
    width: 960,
    height: 640,
    pixelArt: true, // nearest-neighbour rendering, no blur on scaled sprites
    backgroundColor: "#dcebd4",
    scene: [BootScene, OutdoorScene, IndoorScene],
  };
}

export function startGame(parent: HTMLElement) { return new Phaser.Game(createGameConfig(parent)); }
