import Phaser from "phaser";
import { EventBus } from "../eventBus.ts";
import { sanctuaryState, type FlowerRow } from "../sanctuaryState.ts";

// Free placement, 0-100 percent-of-box coordinates --- the exact space
// src/server/index.ts's /api/plant already clamps into, and what the old
// public/app.js's pointer-to-coordinate math already produced
// (((event.clientX - rect.left) / rect.width) * 100). This scene keeps that
// space; it is NOT unified with IndoorScene's integer tile grid.
//
// The construction sites (added alongside the cooperative minigame, see
// docs/decisions/0003-construction-concurrency.md and
// docs/decisions/0004-multiple-construction-projects.md) live at fixed
// spots in this same percent-space and are the first *interactive* objects
// this scene has ever had --- everything else here is either fixed scenery
// or driven by the scene-wide "click anywhere plants a flower" handler
// below. Positions are picked to avoid the guinea pig (50/50) and each
// other; adjust by eye if a sprite's footprint turns out to overlap.
const CONSTRUCTION_SITES: { projectId: string; xPercent: number; yPercent: number }[] = [
  { projectId: "guinea-pig-house", xPercent: 78, yPercent: 22 },
  { projectId: "toolshed", xPercent: 15, yPercent: 20 },
  { projectId: "greenhouse", xPercent: 15, yPercent: 70 },
  { projectId: "bridge", xPercent: 78, yPercent: 70 },
  { projectId: "great-hall", xPercent: 50, yPercent: 85 },
];

function stageKeyFor(
  projectId: string,
  construction: { progressUnits: number; targetUnits: number; status: string } | undefined,
): string {
  if (!construction) return `${projectId}-0`;
  if (construction.status === "completed") return `${projectId}-4`;
  const percent = (construction.progressUnits / construction.targetUnits) * 100;
  const stage = Math.min(3, Math.floor(percent / 25)); // 0-24->0, 25-49->1, 50-74->2, 75-99->3
  return `${projectId}-${stage}`;
}

export class OutdoorScene extends Phaser.Scene {
  private flowerSprites: Phaser.GameObjects.Image[] = [];
  private constructionSites = new Map<string, Phaser.GameObjects.Image>();
  // Set by a construction site's own pointerdown just before it opens the
  // panel, so the scene-wide pointerdown (which would otherwise try to
  // plant a flower at that same click) ignores it once and clears the flag
  // --- the same one-shot pattern IndoorScene already uses for its
  // furniture menu.
  private suppressNextSceneClick = false;
  private onFlowersUpdated = () => this.redrawFlowers();
  private onConstructionUpdated = (projectId: string) => this.redrawConstructionSite(projectId);
  private onConstructionCelebrate = (projectId: string) => this.playCompletionEffect(projectId);
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
    for (const site of CONSTRUCTION_SITES) this.redrawConstructionSite(site.projectId);
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
  // an earlier "create once, then just setTexture" version kept a site's
  // sprite reference pointing at a sprite from the *previous* time this
  // Scene ran. Phaser reuses the same Scene instance across stop()/start()
  // (switching views doesn't construct a fresh OutdoorScene), but stop()
  // destroys every GameObject the Scene owned --- so the old sprite was
  // already dead by the time this ran again, and calling setTexture() on it
  // threw, aborting the rest of create() (including the click-to-plant and
  // keyboard handlers registered further down). See PROCESS.md, "the house
  // disappeared after going back outside."
  private redrawConstructionSite(projectId: string) {
    this.constructionSites.get(projectId)?.destroy();

    const site = CONSTRUCTION_SITES.find((s) => s.projectId === projectId);
    if (!site) return; // an unknown projectId in an event payload --- nothing to draw

    const key = stageKeyFor(projectId, sanctuaryState.construction[projectId]);
    const x = (this.scale.width * site.xPercent) / 100;
    const y = (this.scale.height * site.yPercent) / 100;

    const sprite = this.add.image(x, y, key).setInteractive();
    console.log("DEBUG created site", projectId, "at", x, y, "key", key);
    sprite.on("pointerdown", () => {
      console.log("DEBUG pointerdown fired for", projectId);
      this.suppressNextSceneClick = true;
      EventBus.emit("open-construction-panel", projectId);
    });
    this.constructionSites.set(projectId, sprite);
  }

  // Simple and brief on purpose (CLAUDE.md: respect reduced-motion for
  // anything that isn't load-bearing; the brief itself asks to "prioritise
  // visual clarity over elaborate animation") --- a quick scale pulse on the
  // finished building, nothing that blocks or distracts from the sprite swap
  // redrawConstructionSite() already did via the construction-updated event.
  private playCompletionEffect(projectId: string) {
    const sprite = this.constructionSites.get(projectId);
    if (!sprite) return;
    this.tweens.add({
      targets: sprite,
      scale: { from: 1, to: 1.25 },
      duration: 220,
      yoyo: true,
      ease: "Quad.easeOut",
    });
  }
}
