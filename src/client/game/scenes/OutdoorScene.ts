import Phaser from "phaser";
import { EventBus } from "../eventBus.ts";
import { sanctuaryState, type FlowerRow } from "../sanctuaryState.ts";

// Free placement, 0-100 percent-of-box coordinates --- the exact space
// src/server/index.ts's /api/plant already clamps into, and what the old
// public/app.js's pointer-to-coordinate math already produced
// (((event.clientX - rect.left) / rect.width) * 100). This scene keeps that
// space; it is NOT unified with IndoorScene's integer tile grid.
//
// The construction site (added alongside the cooperative minigame, see
// docs/decisions/0003-construction-concurrency.md) lives at a fixed spot in
// this same percent-space and is the first *interactive* object this scene
// has ever had --- everything else here is either fixed scenery or driven by
// the scene-wide "click anywhere plants a flower" handler below.
const CONSTRUCTION_SITE_X_PERCENT = 78;
const CONSTRUCTION_SITE_Y_PERCENT = 22;

function stageKeyFor(construction: { progressUnits: number; targetUnits: number; status: string } | null): string {
  if (!construction) return "construction-0";
  if (construction.status === "completed") return "construction-4";
  const percent = (construction.progressUnits / construction.targetUnits) * 100;
  const stage = Math.min(3, Math.floor(percent / 25)); // 0-24->0, 25-49->1, 50-74->2, 75-99->3
  return `construction-${stage}`;
}

export class OutdoorScene extends Phaser.Scene {
  private flowerSprites: Phaser.GameObjects.Image[] = [];
  private constructionSite?: Phaser.GameObjects.Image;
  // Set by the construction site's own pointerdown just before it opens the
  // panel, so the scene-wide pointerdown (which would otherwise try to plant
  // a flower at that same click) ignores it once and clears the flag --- the
  // same one-shot pattern IndoorScene already uses for its furniture menu.
  private suppressNextSceneClick = false;
  private onFlowersUpdated = () => this.redrawFlowers();
  private onConstructionUpdated = () => this.redrawConstructionSite();
  private onConstructionCelebrate = () => this.playCompletionEffect();

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
    this.redrawConstructionSite();
    EventBus.on("flowers-updated", this.onFlowersUpdated);
    EventBus.on("construction-updated", this.onConstructionUpdated);
    EventBus.on("construction-celebrate", this.onConstructionCelebrate);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      EventBus.off("flowers-updated", this.onFlowersUpdated);
      EventBus.off("construction-updated", this.onConstructionUpdated);
      EventBus.off("construction-celebrate", this.onConstructionCelebrate);
    });

    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (this.suppressNextSceneClick) {
        this.suppressNextSceneClick = false;
        return;
      }
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

  private redrawConstructionSite() {
    const key = stageKeyFor(sanctuaryState.construction);
    const x = (this.scale.width * CONSTRUCTION_SITE_X_PERCENT) / 100;
    const y = (this.scale.height * CONSTRUCTION_SITE_Y_PERCENT) / 100;

    if (!this.constructionSite) {
      this.constructionSite = this.add.image(x, y, key).setInteractive();
      this.constructionSite.on("pointerdown", () => {
        this.suppressNextSceneClick = true;
        EventBus.emit("open-construction-panel");
      });
    } else {
      this.constructionSite.setTexture(key);
    }
  }

  // Simple and brief on purpose (CLAUDE.md: respect reduced-motion for
  // anything that isn't load-bearing; the brief itself asks to "prioritise
  // visual clarity over elaborate animation") --- a quick scale pulse on the
  // finished building, nothing that blocks or distracts from the sprite swap
  // redrawConstructionSite() already did via the construction-updated event.
  private playCompletionEffect() {
    if (!this.constructionSite) return;
    const sprite = this.constructionSite;
    this.tweens.add({
      targets: sprite,
      scale: { from: 1, to: 1.25 },
      duration: 220,
      yoyo: true,
      ease: "Quad.easeOut",
    });
  }
}
