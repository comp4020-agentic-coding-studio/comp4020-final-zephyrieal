import Phaser from "phaser";
import { EventBus } from "../eventBus.ts";
import { sanctuaryState, type FlowerRow } from "../sanctuaryState.ts";

// Free placement, 0-100 percent-of-box coordinates --- the exact space
// src/server/index.ts's /api/plant already clamps into, and what the old
// public/app.js's pointer-to-coordinate math already produced
// (((event.clientX - rect.left) / rect.width) * 100). This scene keeps that
// space; it is NOT unified with IndoorScene's integer tile grid.
export class OutdoorScene extends Phaser.Scene {
  private flowerSprites: Phaser.GameObjects.Image[] = [];
  private onFlowersUpdated = () => this.redrawFlowers();

  constructor() {
    super("OutdoorScene");
  }

  create() {
    const { width, height } = this.scale;
    this.add.tileSprite(width / 2, height / 2, width, height, "grass-tile");
    this.add
      .rectangle(width / 2, height / 2, width - 4, height - 4)
      .setStrokeStyle(2, 0x9ab98c);

    // Potato has no server-side position (no autonomous AI this week, per
    // CLAUDE.md) --- a fixed, calm spot is enough to put a face on the stats
    // text shown alongside the canvas.
    this.add.image((width * 50) / 100, (height * 50) / 100, "guinea-pig");

    this.redrawFlowers();
    EventBus.on("flowers-updated", this.onFlowersUpdated);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      EventBus.off("flowers-updated", this.onFlowersUpdated);
    });

    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      const x = (pointer.x / this.scale.width) * 100;
      const y = (pointer.y / this.scale.height) * 100;
      this.attemptPlant(x, y);
    });

    // A plain, always-available keyboard route to the same intent (CLAUDE.md:
    // "controls should be keyboard-operable where practical") --- mirrors the
    // old meadow div's Enter/Space handler, which planted at a random point
    // since there's no cursor position to read from a key press.
    EventBus.on("plant-random", () => {
      this.attemptPlant(20 + Math.random() * 60, 20 + Math.random() * 60);
    });
  }

  private attemptPlant(x: number, y: number) {
    EventBus.emit("attempt-plant", { x, y, requestId: crypto.randomUUID() });
  }

  private redrawFlowers() {
    for (const sprite of this.flowerSprites) sprite.destroy();
    this.flowerSprites = sanctuaryState.flowers.map((flower: FlowerRow) =>
      this.add.image(
        (this.scale.width * flower.x) / 100,
        (this.scale.height * flower.y) / 100,
        "flower",
      ),
    );
  }
}
