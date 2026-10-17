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
  private onPlantRandom = () => this.attemptPlant(20 + Math.random() * 60, 20 + Math.random() * 60);

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
    EventBus.on("plant-random", this.onPlantRandom);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      EventBus.off("flowers-updated", this.onFlowersUpdated);
      EventBus.off("construction-updated", this.onConstructionUpdated);
      EventBus.off("construction-celebrate", this.onConstructionCelebrate);
      EventBus.off("plant-random", this.onPlantRandom);
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
    // "plant-random" itself is registered above with the other EventBus
    // listeners this Scene cleans up on SHUTDOWN --- it's the plain,
    // always-available keyboard route to the same intent (CLAUDE.md:
    // "controls should be keyboard-operable where practical"), mirroring the
    // old meadow div's Enter/Space handler, which planted at a random point
    // since there's no cursor position to read from a key press.
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

  // Always destroys and recreates, like redrawFlowers/redrawFurniture ---
  // the earlier "create once, then just setTexture" version kept
  // `this.constructionSite` pointing at a sprite from the *previous* time
  // this Scene ran. Phaser reuses the same Scene instance across
  // stop()/start() (switching views doesn't construct a fresh OutdoorScene),
  // but stop() destroys every GameObject the Scene owned --- so the old
  // sprite was already dead by the time this ran again, and calling
  // setTexture() on it threw, aborting the rest of create() (including the
  // click-to-plant and keyboard handlers registered further down).
  private redrawConstructionSite() {
    this.constructionSite?.destroy();

    const key = stageKeyFor(sanctuaryState.construction);
    const x = (this.scale.width * CONSTRUCTION_SITE_X_PERCENT) / 100;
    const y = (this.scale.height * CONSTRUCTION_SITE_Y_PERCENT) / 100;

    this.constructionSite = this.add.image(x, y, key).setInteractive();
    this.constructionSite.on("pointerdown", () => {
      this.suppressNextSceneClick = true;
      EventBus.emit("open-construction-panel");
    });
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
