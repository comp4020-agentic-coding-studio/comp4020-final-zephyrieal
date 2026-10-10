import Phaser from "phaser";
import { EventBus } from "../eventBus.ts";
import { sanctuaryState } from "../sanctuaryState.ts";
import {
  TILE_SIZE,
  HOUSE_WIDTH,
  HOUSE_HEIGHT,
  BLOCKED_TILES,
  FURNITURE_CATALOG,
  isValidPlacement,
  type FurnitureKind,
  type FurnitureRow,
} from "../../../server/furniture.ts";
import { GAME_WIDTH, GAME_HEIGHT, HOUSE_ORIGIN_X, HOUSE_ORIGIN_Y } from "../layout.ts";

// Grid-snapped placement, integer tile coordinates --- a different system
// from OutdoorScene's free percent-space, deliberately not unified (see the
// brief). The catalog, tile grid and isValidPlacement are imported straight
// from the server module: `import type { DatabaseSync }` in furniture.ts is
// elided at build time (verbatimModuleSyntax), so this carries no Node
// runtime dependency --- just the one shared source of truth for what's
// buyable and what counts as a legal placement. The server re-validates
// everything anyway; this is a preview only.
export class IndoorScene extends Phaser.Scene {
  private furnitureSprites: Phaser.GameObjects.Image[] = [];
  private preview?: Phaser.GameObjects.Image;
  private message?: Phaser.GameObjects.Text;
  private selectedKind?: FurnitureKind;
  private previewTile = { x: 0, y: 0 };
  private onFurnitureUpdated = () => this.redrawFurniture();
  private onSelectFurniture = (kind: FurnitureKind) => this.selectFurniture(kind);
  private onPlacementResult = (result: { ok: boolean; reason?: string }) =>
    this.handlePlacementResult(result);

  constructor() {
    super("IndoorScene");
  }

  create() {
    this.drawFloorAndWalls();
    this.redrawFurniture();

    EventBus.on("furniture-updated", this.onFurnitureUpdated);
    EventBus.on("select-furniture", this.onSelectFurniture);
    EventBus.on("placement-result", this.onPlacementResult);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      EventBus.off("furniture-updated", this.onFurnitureUpdated);
      EventBus.off("select-furniture", this.onSelectFurniture);
      EventBus.off("placement-result", this.onPlacementResult);
    });

    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      this.previewTile = {
        x: Math.floor((pointer.x - HOUSE_ORIGIN_X) / TILE_SIZE),
        y: Math.floor((pointer.y - HOUSE_ORIGIN_Y) / TILE_SIZE),
      };
      this.updatePreview();
    });
    this.input.on("pointerdown", () => this.confirmPlacement());

    const cursors = this.input.keyboard?.createCursorKeys();
    this.input.keyboard?.on("keydown", (event: KeyboardEvent) => {
      if (!this.selectedKind) return;
      const def = FURNITURE_CATALOG[this.selectedKind];
      const maxX = HOUSE_WIDTH - def.width;
      const maxY = HOUSE_HEIGHT - def.height;
      if (event.key === "ArrowLeft") this.previewTile.x = Math.max(0, this.previewTile.x - 1);
      else if (event.key === "ArrowRight") this.previewTile.x = Math.min(maxX, this.previewTile.x + 1);
      else if (event.key === "ArrowUp") this.previewTile.y = Math.max(0, this.previewTile.y - 1);
      else if (event.key === "ArrowDown") this.previewTile.y = Math.min(maxY, this.previewTile.y + 1);
      else if (event.key === "Enter") {
        this.confirmPlacement();
        return;
      } else return;
      this.updatePreview();
    });
    void cursors; // registered via `.on("keydown", ...)` above for a single handler across all four arrows
  }

  private drawFloorAndWalls() {
    for (let x = 0; x < HOUSE_WIDTH; x++) {
      for (let y = 0; y < HOUSE_HEIGHT; y++) {
        const blocked = BLOCKED_TILES.has(`${x},${y}`);
        this.add
          .image(
            HOUSE_ORIGIN_X + x * TILE_SIZE + TILE_SIZE / 2,
            HOUSE_ORIGIN_Y + y * TILE_SIZE + TILE_SIZE / 2,
            blocked ? "tile-wall" : "tile-floor",
          )
          .setDepth(-1);
      }
    }
  }

  private selectFurniture(kind: FurnitureKind) {
    this.selectedKind = kind;
    this.updatePreview();
  }

  private currentFootprint() {
    return sanctuaryState.furniture.map((f: FurnitureRow) => ({
      tile_x: f.tile_x,
      tile_y: f.tile_y,
      width: f.width,
      height: f.height,
    }));
  }

  private updatePreview() {
    this.preview?.destroy();
    this.preview = undefined;
    if (!this.selectedKind) return;

    const kind = this.selectedKind;
    const { x, y } = this.previewTile;
    const check = isValidPlacement(kind, x, y, this.currentFootprint());
    const def = FURNITURE_CATALOG[kind];

    this.preview = this.add
      .image(
        HOUSE_ORIGIN_X + x * TILE_SIZE + (def.width * TILE_SIZE) / 2,
        HOUSE_ORIGIN_Y + y * TILE_SIZE + (def.height * TILE_SIZE) / 2,
        `furniture-${kind}`,
      )
      .setAlpha(0.6)
      .setTint(check.ok ? 0x88ff88 : 0xff8888);
  }

  private confirmPlacement() {
    if (!this.selectedKind) return;
    const { x, y } = this.previewTile;
    EventBus.emit("attempt-placement", {
      kind: this.selectedKind,
      tileX: x,
      tileY: y,
      requestId: crypto.randomUUID(),
    });
  }

  private handlePlacementResult(result: { ok: boolean; reason?: string }) {
    this.message?.destroy();
    if (result.ok) {
      this.selectedKind = undefined;
      this.preview?.destroy();
      this.preview = undefined;
      return;
    }
    this.message = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 16, result.reason ?? "that didn't work", {
        fontSize: "12px",
        color: "#ffffff",
        backgroundColor: "#a04040",
        padding: { x: 6, y: 3 },
      })
      .setOrigin(0.5, 1);
    this.time.delayedCall(2500, () => this.message?.destroy());
  }

  private redrawFurniture() {
    for (const sprite of this.furnitureSprites) sprite.destroy();
    this.furnitureSprites = sanctuaryState.furniture.map((row: FurnitureRow) =>
      this.add.image(
        HOUSE_ORIGIN_X + row.tile_x * TILE_SIZE + (row.width * TILE_SIZE) / 2,
        HOUSE_ORIGIN_Y + row.tile_y * TILE_SIZE + (row.height * TILE_SIZE) / 2,
        `furniture-${row.kind}`,
      ),
    );
  }
}
