import Phaser from "phaser";
import { generateTextures } from "../textures.ts";

// Runs once: generates every placeholder texture up front, then hands off to
// the outdoor meadow. Scene switching after this point is driven by
// PhaserGame.tsx listening for "switch-scene" on the EventBus, not by this
// scene.
export class BootScene extends Phaser.Scene {
  constructor() {
    super("BootScene");
  }

  create() {
    generateTextures(this);
    this.scene.start("OutdoorScene");
  }
}
