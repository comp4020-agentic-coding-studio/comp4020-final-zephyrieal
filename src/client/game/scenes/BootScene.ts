import Phaser from "phaser";
import { SPRITE_ASSETS } from "../assets.ts";

// Runs once: loads every real sprite up front, then hands off to the outdoor
// meadow. Scene switching after this point is driven by PhaserGame.tsx
// listening for "switch-scene" on the EventBus, not by this scene.
export class BootScene extends Phaser.Scene {
  constructor() {
    super("BootScene");
  }

  preload() {
    for (const [key, url] of Object.entries(SPRITE_ASSETS)) {
      this.load.image(key, url);
    }
  }

  create() {
    this.scene.start("OutdoorScene");
  }
}
