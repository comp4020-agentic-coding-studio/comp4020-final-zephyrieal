import Phaser from "phaser";
import { BootScene } from "./scenes/BootScene.ts";
import { OutdoorScene } from "./scenes/OutdoorScene.ts";
import { IndoorScene } from "./scenes/IndoorScene.ts";

export function createGameConfig(parent: HTMLElement): Phaser.Types.Core.GameConfig {
  return {
    type: Phaser.AUTO,
    parent,
    width: parent.clientWidth || 960,
    height: parent.clientHeight || 640,
    pixelArt: true, // nearest-neighbour rendering, no blur on scaled sprites
    backgroundColor: "#dcebd4",
    scene: [BootScene, OutdoorScene, IndoorScene],
  };
}

export function startGame(parent: HTMLElement) { return new Phaser.Game(createGameConfig(parent)); }
