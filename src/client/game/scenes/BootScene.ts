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
    // Each view is trimmed to its opaque silhouette; sheet padding is never
    // part of the rendered size or the furniture's clickable area.
    for (const [row, kind] of ["hay_bed", "tunnel", "hideout"].entries()) {
      for (const [col, view] of ["front", "back", "left"].entries()) {
        const texture = this.textures.get(`furniture-${kind}-${view}`);
        const source = texture.getSourceImage() as HTMLImageElement;
        const canvas = document.createElement("canvas");
        canvas.width = source.width; canvas.height = source.height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(source, 0, 0);
        const { data } = ctx.getImageData(0, 0, source.width, source.height);
        let left = source.width, top = source.height, right = 0, bottom = 0;
        for (let y = Math.floor(row * source.height / 3); y < Math.floor((row + 1) * source.height / 3); y++) {
          for (let x = Math.floor(col * source.width / 3); x < Math.floor((col + 1) * source.width / 3); x++) {
            if (data[(y * source.width + x) * 4 + 3] < 32) continue;
            left = Math.min(left, x); right = Math.max(right, x);
            top = Math.min(top, y); bottom = Math.max(bottom, y);
          }
        }
        texture.add("furniture", 0, left, top, right - left + 1, bottom - top + 1);
      }
    }
    // Frames use the actual alpha bounds of the generated sheet, keeping feet
    // aligned across all four views without modifying or duplicating the art.
    this.textures.get("guinea-pig").add("potato", 0, 232, 260, 1035, 665);
    this.textures.get("mochi").add("pig", 0, 126, 164, 1216, 781);
    this.textures.get("biscuit").add("pig", 0, 223, 250, 1068, 675);
    this.textures.get("clover").add("pig", 0, 182, 269, 1107, 622);
    const visitor = this.textures.get("visitor-gardener");
    visitor.add("front", 0, 174, 120, 359, 471);
    visitor.add("back", 0, 723, 121, 349, 470);
    visitor.add("left", 0, 205, 674, 338, 468);
    visitor.add("right", 0, 711, 673, 336, 468);
    this.scene.start(this.registry.get("requestedRoom") && this.registry.get("requestedRoom") !== "outdoor" ? "IndoorScene" : "OutdoorScene");
  }
}
