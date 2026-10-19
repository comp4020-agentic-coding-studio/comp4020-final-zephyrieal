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
  private guineaPigSprite?: Phaser.GameObjects.Image;
  // CLAUDE.md's Accessibility section asks to "respect reduced-motion
  // preferences for animation that isn't load-bearing" --- Potato's own
  // position update is load-bearing (it's the server's authoritative
  // state), but the glide between two points is purely cosmetic, so this is
  // the one thing actually gated on it. Read once in create(): a live
  // preference change mid-session would need its own matchMedia listener,
  // which isn't worth the complexity for a setting visitors set once in
  // their OS/browser, not mid-visit.
  private reducedMotion = false;
  // Set by a construction site's own pointerdown just before it opens the
  // panel, so the scene-wide pointerdown (which would otherwise try to
  // plant a flower at that same click) ignores it once and clears the flag
  // --- the same one-shot pattern IndoorScene already uses for its
  // furniture menu.
  private suppressNextSceneClick = false;
  private onFlowersUpdated = () => this.redrawFlowers();
  private onConstructionUpdated = (projectId: string) => this.redrawConstructionSite(projectId);
  private onConstructionCelebrate = (projectId: string) => this.playCompletionEffect(projectId);
  private onGuineaPigMoved = () => this.animateGuineaPigToTarget();
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

    this.reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

    // Potato wanders the meadow on her own (CLAUDE.md: "the guinea pig
    // decides what it does" --- never direct player control) --- the server
    // decides where and when (src/server/guinea-pig.ts), this scene only
    // ever renders wherever sanctuaryState.guineaPigMovement already says
    // she is, same as every other piece of shared state here. Starting from
    // whatever's already known (not a hardcoded 50/50) means a visitor who
    // switches back from IndoorScene sees her already correctly placed,
    // mid-walk or paused, not snapped back to a default spot.
    const start = sanctuaryState.guineaPigMovement ?? { x: 50, y: 50, targetX: 50, targetY: 50, startedAt: Date.now(), durationMs: 0 };
    this.guineaPigSprite = this.add.image(
      (width * start.x) / 100,
      (height * start.y) / 100,
      "guinea-pig",
    );
    this.animateGuineaPigToTarget();

    this.redrawFlowers();
    for (const site of CONSTRUCTION_SITES) this.redrawConstructionSite(site.projectId);
    EventBus.on("flowers-updated", this.onFlowersUpdated);
    EventBus.on("construction-updated", this.onConstructionUpdated);
    EventBus.on("construction-celebrate", this.onConstructionCelebrate);
    EventBus.on("guinea-pig-moved", this.onGuineaPigMoved);
    EventBus.on("plant-random", this.onPlantRandom);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      EventBus.off("flowers-updated", this.onFlowersUpdated);
      EventBus.off("construction-updated", this.onConstructionUpdated);
      EventBus.off("construction-celebrate", this.onConstructionCelebrate);
      EventBus.off("guinea-pig-moved", this.onGuineaPigMoved);
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

  // Walks the sprite from wherever it currently is to the server's latest
  // target, over whatever time is left in that walk --- not the walk's full
  // original duration, since this fires again mid-walk every time a fresh
  // "guinea-pig-moved" broadcast arrives (every ~1s while she's moving), and
  // restarting the full duration each time would make her drift slower than
  // the server actually intends. Under prefers-reduced-motion, skip the
  // glide entirely and just place her exactly where the server says she is
  // right now (CLAUDE.md's Accessibility section).
  private animateGuineaPigToTarget() {
    const sprite = this.guineaPigSprite;
    const movement = sanctuaryState.guineaPigMovement;
    if (!sprite || !movement) return;

    const targetPixelX = (this.scale.width * movement.targetX) / 100;
    const targetPixelY = (this.scale.height * movement.targetY) / 100;

    if (movement.targetX < movement.x) sprite.setFlipX(true);
    else if (movement.targetX > movement.x) sprite.setFlipX(false);

    this.tweens.killTweensOf(sprite);

    if (this.reducedMotion || movement.durationMs <= 0) {
      sprite.setPosition(targetPixelX, targetPixelY);
      return;
    }

    const remainingMs = Math.max(0, movement.durationMs - (Date.now() - movement.startedAt));
    this.tweens.add({
      targets: sprite,
      x: targetPixelX,
      y: targetPixelY,
      duration: remainingMs,
      ease: "Linear",
    });
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
    sprite.on("pointerdown", () => {
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
