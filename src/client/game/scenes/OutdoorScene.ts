import { addMeadow } from "../MeadowLayer.ts";
import { addCampfire } from "../CampfireLayer.ts";
import { configureCamera } from "../FollowCamera.ts";
import { onSceneExit } from "../onSceneExit.ts";
import { addGuineaPigs } from "../GuineaPigLayer.ts";
import { addCarrot } from "../CarrotLayer.ts";
import { addFarm } from "../FarmLayer.ts";
import Phaser from "phaser";
import { CONSTRUCTION_SITES, inReach, BUILD_REACH, MEADOW_WIDTH, MEADOW_HEIGHT } from "../../../shared/interactions.ts";
import { presenceState } from "../presenceState.ts";
import { addPlayers } from "../PlayerLayer.ts";
import { EventBus } from "../eventBus.ts";
import { sanctuaryState } from "../sanctuaryState.ts";

// Outdoor objects share meadow coordinates; interactions require nearby players.

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
  private constructionSites = new Map<string, Phaser.GameObjects.Image>();
  // CLAUDE.md's Accessibility section asks to "respect reduced-motion
  // preferences for animation that isn't load-bearing" --- Huahua's own
  // position update is load-bearing (it's the server's authoritative
  // state), but the glide between two points is purely cosmetic, so this is
  // the one thing actually gated on it. Read once in create(): a live
  // preference change mid-session would need its own matchMedia listener,
  // which isn't worth the complexity for a setting visitors set once in
  // their OS/browser, not mid-visit.
  private reducedMotion = false;
  private onConstructionUpdated = (projectId: string) => this.redrawConstructionSite(projectId);
  private lastDust = new Map<string, number>();
  private onConstructionDust = (projectId: string) => this.playConstructionDust(projectId);
  private onConstructionCelebrate = (projectId: string) => this.playCompletionEffect(projectId);


  constructor() {
    super("OutdoorScene");
  }

  create() {
    addPlayers(this, "outdoor");
    configureCamera(this, true);
    addMeadow(this);

    this.reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

    addCampfire(this);
    addGuineaPigs(this);

    this.lastDust.clear();
    addFarm(this);
    addCarrot(this);
    for (const site of CONSTRUCTION_SITES) this.redrawConstructionSite(site.projectId);
    EventBus.on("construction-dust", this.onConstructionDust);
    EventBus.on("construction-updated", this.onConstructionUpdated);
    EventBus.on("construction-celebrate", this.onConstructionCelebrate);
    onSceneExit(this, () => {
      EventBus.off("construction-dust", this.onConstructionDust);
      EventBus.off("construction-updated", this.onConstructionUpdated);
      EventBus.off("construction-celebrate", this.onConstructionCelebrate);
    });

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
    if (!this.sys?.displayList) return;
    this.constructionSites.get(projectId)?.destroy();

    const site = CONSTRUCTION_SITES.find((s) => s.projectId === projectId);
    if (!site) return; // an unknown projectId in an event payload --- nothing to draw

    const key = stageKeyFor(projectId, sanctuaryState.construction[projectId]);
    const x = (MEADOW_WIDTH * site.xPercent) / 100;
    const y = (MEADOW_HEIGHT * site.yPercent) / 100;

    const sprite = this.add.image(x, y - 30, key).setDisplaySize(112, 96).setName(`construction:${projectId}`).setInteractive();
    sprite.on("pointerdown", () => {
      const self = presenceState.players.find(p => p.id === presenceState.selfId);
      if (inReach(self, x, y, BUILD_REACH)) EventBus.emit("open-construction-panel", projectId);
      else EventBus.emit("interaction-rejected", "Walk up to this building to help build it.");
    });
    this.constructionSites.set(projectId, sprite);
  }

  // All clients receive this only after an accepted contribution. A short
  // per-site throttle keeps cooperative clicking from flooding the meadow.
  private playConstructionDust(projectId: string) {
    const site = this.constructionSites.get(projectId);
    if (!site || this.reducedMotion) return;
    const now = this.time.now;
    if (now - (this.lastDust.get(projectId) ?? -Infinity) < 180) return;
    this.lastDust.set(projectId, now);
    for (let i = 0; i < 5; i++) {
      const offset = (i - 2) * 7;
      const puff = this.add.graphics().setPosition(site.x + offset, site.y + 5).setDepth(9);
      puff.fillStyle(i % 2 ? 0xe2d3b9 : 0xf4ead6, 0.85);
      puff.fillRoundedRect(-5, -4, 10, 8, 3);
      puff.fillRoundedRect(-3, -7, 7, 9, 3);
      puff.setScale(0.6);
      this.tweens.add({
        targets: puff, x: puff.x + offset * 0.6, y: puff.y - 22 - (i % 2) * 8,
        alpha: 0, scaleX: 1.5, scaleY: 1.5, duration: 650 + i * 45,
        ease: "Sine.easeOut", onComplete: () => puff.destroy(),
      });
    }
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
