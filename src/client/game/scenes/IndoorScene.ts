import { addGuineaPigs } from "../GuineaPigLayer.ts";
import { configureCamera } from "../FollowCamera.ts";
import { roomName } from "../../../shared/rooms.ts";
import { onSceneExit } from "../onSceneExit.ts";
import Phaser from "phaser";
import { addPlayers } from "../PlayerLayer.ts";
import { EventBus } from "../eventBus.ts";
import { sanctuaryState } from "../sanctuaryState.ts";
import {
  TILE_SIZE,
  HOUSE_WIDTH,
  HOUSE_HEIGHT,
  BLOCKED_TILES,
  isValidPlacement,
  footprintFor,
  viewFor,
  type FurnitureKind,
  type FurnitureRow,
  type Rotation,
} from "../../../server/furniture.ts";
import { GAME_WIDTH, GAME_HEIGHT, HOUSE_ORIGIN_X, HOUSE_ORIGIN_Y } from "../layout.ts";

// Three things can be "in hand" at once: buying a new piece from the shop,
// retrieving a stored one, or editing (moving/rotating/storing) one already
// on the floor. One discriminated union instead of three loosely-related
// optional fields, so opening one always cleanly replaces whichever (if any)
// was active before.
type ActiveOp =
  | { mode: "buy"; kind: FurnitureKind }
  | { mode: "retrieve"; item: FurnitureRow }
  | {
      mode: "edit";
      id: number;
      kind: FurnitureKind;
      phase: "menu" | "moving" | "confirm-store";
      original: { tileX: number; tileY: number; rotation: Rotation; version: number };
      draftTile: { x: number; y: number };
      draftRotation: Rotation;
    };

const ROTATIONS: Rotation[] = [0, 90, 180, 270];

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
  private previewFootprint?: Phaser.GameObjects.Rectangle;
  private message?: Phaser.GameObjects.Text;
  private activeOp?: ActiveOp;
  private previewTile = { x: 0, y: 0 };
  // Set by a furniture sprite's own pointerdown just before it opens the
  // edit menu, so the scene-level pointerdown (which would otherwise try to
  // place/move on that same click) ignores it once and clears the flag.
  private suppressNextSceneClick = false;

  private menuPanel?: Phaser.GameObjects.Image;
  private menuIcons: Phaser.GameObjects.Image[] = [];
  private menuTooltip?: Phaser.GameObjects.Text;
  private selectionOutline?: Phaser.GameObjects.Rectangle;

  private onFurnitureUpdated = () => this.redrawFurniture();
  private onSelectFurniture = (kind: FurnitureKind) => this.selectFurniture(kind);
  private onSelectStoredFurniture = (item: FurnitureRow) => this.selectStoredFurniture(item);
  private onPlacementResult = (result: { ok: boolean; reason?: string }) =>
    this.handlePlacementResult(result);
  private onFurnitureEditResult = (result: {
    ok: boolean;
    reason?: string;
    current?: FurnitureRow;
  }) => this.handleEditResult(result);
  private onStoreResult = (result: { ok: boolean; reason?: string }) =>
    this.handleSimpleResult(result);
  private onRetrieveResult = (result: { ok: boolean; reason?: string }) =>
    this.handleSimpleResult(result);

  constructor() {
    super("IndoorScene");
  }

  create() {
    configureCamera(this, false);
    this.activeOp = undefined;
    addPlayers(this, sanctuaryState.room === "outdoor" ? "indoor" : sanctuaryState.room, () => Boolean(this.activeOp));
    this.drawFloorAndWalls();
    addGuineaPigs(this, sanctuaryState.room === "outdoor" ? "indoor" : sanctuaryState.room);
    this.add.text(320, 100, roomName(sanctuaryState.room), { fontFamily: "monospace", fontSize: "16px", color: "#3d4934", backgroundColor: "#fff6df", padding: { x: 10, y: 6 } }).setOrigin(0.5);
    this.redrawFurniture();

    EventBus.on("furniture-updated", this.onFurnitureUpdated);
    EventBus.on("select-furniture", this.onSelectFurniture);
    EventBus.on("select-stored-furniture", this.onSelectStoredFurniture);
    EventBus.on("placement-result", this.onPlacementResult);
    EventBus.on("furniture-edit-result", this.onFurnitureEditResult);
    EventBus.on("store-result", this.onStoreResult);
    EventBus.on("retrieve-result", this.onRetrieveResult);
    onSceneExit(this, () => {
      EventBus.off("furniture-updated", this.onFurnitureUpdated);
      EventBus.off("select-furniture", this.onSelectFurniture);
      EventBus.off("select-stored-furniture", this.onSelectStoredFurniture);
      EventBus.off("placement-result", this.onPlacementResult);
      EventBus.off("furniture-edit-result", this.onFurnitureEditResult);
      EventBus.off("store-result", this.onStoreResult);
      EventBus.off("retrieve-result", this.onRetrieveResult);
    });

    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      const tile = {
        x: Math.floor((pointer.worldX - HOUSE_ORIGIN_X) / TILE_SIZE),
        y: Math.floor((pointer.worldY - HOUSE_ORIGIN_Y) / TILE_SIZE),
      };
      if (this.activeOp?.mode === "edit") {
        // The menu is rebuilt (destroyed + recreated) on almost every click,
        // which can happen while the cursor sits right on top of it ---
        // relying on pointerover/pointerout to track "is the cursor over the
        // menu" is fragile across that destroy/recreate, so this checks the
        // current panel's bounds directly instead. Otherwise, crossing the
        // menu on the way to Save would also drag the piece to whatever tile
        // the menu happens to sit over.
        if (this.activeOp.phase === "moving" && !this.isPointerOverMenu(pointer)) {
          this.activeOp.draftTile = tile;
          // The whole menu (panel, icons, selection outline), not just the
          // ghost --- Save has to stay reachable near wherever the piece
          // actually is while dragging, not back where "Move" was clicked.
          this.renderMenu();
        }
        return;
      }
      this.previewTile = tile;
      this.updatePreview();
    });

    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      // A tap can arrive without a pointermove (especially on touch screens).
      if (this.activeOp && this.activeOp.mode !== "edit") {
        const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
        this.previewTile = { x: Math.floor((world.x - HOUSE_ORIGIN_X) / TILE_SIZE),
          y: Math.floor((world.y - HOUSE_ORIGIN_Y) / TILE_SIZE) };
        this.updatePreview();
      }
      if (this.suppressNextSceneClick) {
        this.suppressNextSceneClick = false;
        return;
      }
      if (this.activeOp?.mode === "edit") {
        // Closes a menu that's just being looked at. While actively dragging
        // a move, a click on a valid tile confirms the move right there ---
        // same as clicking Save --- so choosing the spot and clicking it is
        // one action; a click on an invalid tile is ignored so the drag can
        // continue. Confirming a store still needs its own explicit button,
        // to avoid losing an in-progress edit to a stray click.
        if (this.activeOp.phase === "menu") this.closeEditMenu();
        else if (this.activeOp.phase === "moving") this.tryConfirmMove();
        return;
      }
      this.confirmPlacement();
    });

    const cursors = this.input.keyboard?.createCursorKeys();
    this.input.keyboard?.on("keydown", (event: KeyboardEvent) => {
      if (event.key === "Escape" && this.activeOp?.mode === "edit") {
        this.closeEditMenu();
        return;
      }
      if (!this.activeOp || this.activeOp.mode === "edit") return;
      const kind =
        this.activeOp.mode === "buy" ? this.activeOp.kind : (this.activeOp.item.kind as FurnitureKind);
      const rotation = this.activeOp.mode === "retrieve" ? (this.activeOp.item.rotation as Rotation) : 0;
      const { width, height } = footprintFor(kind, rotation);
      const maxX = HOUSE_WIDTH - width;
      const maxY = HOUSE_HEIGHT - height;
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
    this.closeEditMenu();
    this.activeOp = { mode: "buy", kind };
    this.updatePreview();
  }

  private selectStoredFurniture(item: FurnitureRow) {
    this.closeEditMenu();
    this.activeOp = { mode: "retrieve", item };
    this.updatePreview();
  }

  private currentFootprint(excludeId?: number) {
    return sanctuaryState.furniture
      .filter((f: FurnitureRow) => f.id !== excludeId)
      .map((f: FurnitureRow) => ({
        tile_x: f.tile_x,
        tile_y: f.tile_y,
        width: f.width,
        height: f.height,
      }));
  }

  // Shared tinted ghost for the buy/retrieve preview and for an in-progress
  // edit (shown at the piece's own draft tile/rotation, whether or not it's
  // actively being dragged) --- validated with `excludeId`'s own current
  // tiles left out, so moving a piece never collides with itself.
  private renderGhost(
    kind: FurnitureKind,
    rotation: Rotation,
    tile: { x: number; y: number },
    excludeId?: number,
  ) {
    this.preview?.destroy();
    this.previewFootprint?.destroy();
    const check = isValidPlacement(kind, tile.x, tile.y, this.currentFootprint(excludeId), rotation);
    const { width, height } = footprintFor(kind, rotation);
    const view = viewFor(kind, rotation);
    this.preview = this.add
      .image(
        HOUSE_ORIGIN_X + tile.x * TILE_SIZE + (width * TILE_SIZE) / 2,
        HOUSE_ORIGIN_Y + tile.y * TILE_SIZE + (height * TILE_SIZE) / 2,
        view.key, "furniture",
      )
      .setFlipX(view.flipX)
      .setAlpha(0.6)
      .setTint(check.ok ? 0x88ff88 : 0xff8888);
    this.fitFurniture(this.preview, width, height);
    this.previewFootprint = this.add.rectangle(this.preview.x, this.preview.y,
      width * TILE_SIZE, height * TILE_SIZE, check.ok ? 0x88bb77 : 0xcc6666, 0.12)
      .setStrokeStyle(1, check.ok ? 0x527a45 : 0xaa4444);

  }

  private updatePreview() {
    if (!this.activeOp || this.activeOp.mode === "edit") {
      this.preview?.destroy();
    this.previewFootprint?.destroy();
      this.preview = undefined;
      return;
    }
    if (this.activeOp.mode === "buy") {
      this.renderGhost(this.activeOp.kind, 0, this.previewTile);
    } else {
      const item = this.activeOp.item;
      this.renderGhost(item.kind as FurnitureKind, item.rotation as Rotation, this.previewTile);
    }
  }

  private confirmPlacement() {
    if (!this.activeOp || this.activeOp.mode === "edit") return;
    const { x, y } = this.previewTile;
    if (this.activeOp.mode === "buy") {
      EventBus.emit("attempt-placement", {
        kind: this.activeOp.kind,
        tileX: x,
        tileY: y,
        requestId: crypto.randomUUID(),
      });
    } else {
      const item = this.activeOp.item;
      EventBus.emit("attempt-retrieve-furniture", {
        id: item.id,
        tileX: x,
        tileY: y,
        rotation: item.rotation,
        version: item.version,
        requestId: crypto.randomUUID(),
      });
    }
  }

  private handlePlacementResult(result: { ok: boolean; reason?: string }) {
    this.showMessageIfRejected(result);
    if (result.ok) {
      this.activeOp = undefined;
      this.preview?.destroy();
    this.previewFootprint?.destroy();
      this.preview = undefined;
    }
  }

  private handleSimpleResult(result: { ok: boolean; reason?: string }) {
    this.showMessageIfRejected(result);
    if (result.ok) {
      this.activeOp = undefined;
      this.closeEditMenu();
      return;
    }
    // A failed store/retrieve while editing drops back to the plain menu
    // rather than leaving it stuck in "confirm-store" or mid-move.
    if (this.activeOp?.mode === "edit") {
      this.activeOp.phase = "menu";
      this.renderMenu();
    }
  }

  private showMessageIfRejected(result: { ok: boolean; reason?: string }) {
    this.message?.destroy();
    if (result.ok) return;
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

  private fitFurniture(sprite: Phaser.GameObjects.Image, width: number, height: number) {
    // Preserve the artwork's proportions while keeping every visible pixel
    // inside the same server-validated tile footprint used by the preview.
    sprite.setScale(Math.min((width * TILE_SIZE - 4) / sprite.width,
      (height * TILE_SIZE - 4) / sprite.height));
  }

  private redrawFurniture() {
    for (const sprite of this.furnitureSprites) sprite.destroy();
    this.furnitureSprites = sanctuaryState.furniture.map((row: FurnitureRow) => {
      const view = viewFor(row.kind as FurnitureKind, row.rotation as Rotation);
      const sprite = this.add
        .image(
          HOUSE_ORIGIN_X + row.tile_x * TILE_SIZE + (row.width * TILE_SIZE) / 2,
          HOUSE_ORIGIN_Y + row.tile_y * TILE_SIZE + (row.height * TILE_SIZE) / 2,
          view.key, "furniture",
        )
        .setFlipX(view.flipX)
        .setName(`furniture:${row.id}`)
        .setInteractive({ pixelPerfect: true, alphaTolerance: 32, useHandCursor: true });
      this.fitFurniture(sprite, row.width, row.height);
      sprite.on("pointerdown", () => {
        this.suppressNextSceneClick = true;
        this.openEditMenu(row);
      });
      return sprite;
    });
  }

  // --- Editing an existing piece: open the menu, move/rotate as a local
  // draft, commit both together on Save. See
  // docs/decisions/0002-furniture-editing-concurrency.md for why this is
  // guarded by a version field rather than a lock.

  private openEditMenu(row: FurnitureRow) {
    this.preview?.destroy();
    this.previewFootprint?.destroy();
    this.preview = undefined;
    this.activeOp = {
      mode: "edit",
      id: row.id,
      kind: row.kind as FurnitureKind,
      phase: "menu",
      original: {
        tileX: row.tile_x,
        tileY: row.tile_y,
        rotation: row.rotation as Rotation,
        version: row.version,
      },
      draftTile: { x: row.tile_x, y: row.tile_y },
      draftRotation: row.rotation as Rotation,
    };
    this.renderMenu();
  }

  private closeEditMenu() {
    this.menuPanel?.destroy();
    this.menuPanel = undefined;
    for (const icon of this.menuIcons) icon.destroy();
    this.menuIcons = [];
    this.menuTooltip?.destroy();
    this.menuTooltip = undefined;
    this.selectionOutline?.destroy();
    this.selectionOutline = undefined;
    this.preview?.destroy();
    this.previewFootprint?.destroy();
    this.preview = undefined;
    if (this.activeOp?.mode === "edit") this.activeOp = undefined;
  }

  private isPointerOverMenu(pointer: Phaser.Input.Pointer): boolean {
    if (!this.menuPanel) return false;
    return Phaser.Geom.Rectangle.Contains(this.menuPanel.getBounds(), pointer.worldX, pointer.worldY);
  }

  private renderEditGhost() {
    if (this.activeOp?.mode !== "edit") return;
    const op = this.activeOp;
    this.renderGhost(op.kind, op.draftRotation, op.draftTile, op.id);
  }

  private rotateDraft() {
    if (this.activeOp?.mode !== "edit") return;
    const next = ROTATIONS[(ROTATIONS.indexOf(this.activeOp.draftRotation) + 1) % ROTATIONS.length];
    this.activeOp.draftRotation = next;
    this.renderMenu();
  }

  // Clicking a valid tile while dragging a move confirms it immediately,
  // the same as clicking Save --- an invalid tile is ignored so the drag can
  // continue rather than clicking do nothing with no feedback.
  private tryConfirmMove() {
    if (this.activeOp?.mode !== "edit" || this.activeOp.phase !== "moving") return;
    const op = this.activeOp;
    const check = isValidPlacement(
      op.kind,
      op.draftTile.x,
      op.draftTile.y,
      this.currentFootprint(op.id),
      op.draftRotation,
    );
    if (!check.ok) return;
    this.saveEdit();
  }

  private saveEdit() {
    if (this.activeOp?.mode !== "edit") return;
    const op = this.activeOp;
    EventBus.emit("attempt-furniture-edit", {
      id: op.id,
      tileX: op.draftTile.x,
      tileY: op.draftTile.y,
      rotation: op.draftRotation,
      version: op.original.version,
      requestId: crypto.randomUUID(),
    });
  }

  private confirmStore() {
    if (this.activeOp?.mode !== "edit") return;
    const op = this.activeOp;
    EventBus.emit("attempt-store-furniture", {
      id: op.id,
      version: op.original.version,
      requestId: crypto.randomUUID(),
    });
  }

  private handleEditResult(result: { ok: boolean; reason?: string; current?: FurnitureRow }) {
    this.showMessageIfRejected(result);
    if (result.ok) {
      this.closeEditMenu();
      return;
    }
    if (this.activeOp?.mode !== "edit") return;
    const current = result.current;
    if (!current || current.status !== "placed") {
      // Someone stored it (or it's otherwise gone) out from under this edit
      // --- nothing left here to keep editing.
      this.closeEditMenu();
      return;
    }
    // Resync the draft from the authoritative row and let the visitor retry.
    this.activeOp.original = {
      tileX: current.tile_x,
      tileY: current.tile_y,
      rotation: current.rotation as Rotation,
      version: current.version,
    };
    this.activeOp.draftTile = { x: current.tile_x, y: current.tile_y };
    this.activeOp.draftRotation = current.rotation as Rotation;
    this.activeOp.phase = "menu";
    this.renderMenu();
  }

  private renderMenu() {
    if (this.activeOp?.mode !== "edit") return;
    const op = this.activeOp;

    this.menuPanel?.destroy();
    for (const icon of this.menuIcons) icon.destroy();
    this.menuIcons = [];
    this.menuTooltip?.destroy();
    this.menuTooltip = undefined;
    this.selectionOutline?.destroy();

    this.renderEditGhost();

    const { width, height } = footprintFor(op.kind, op.draftRotation);
    const cx = HOUSE_ORIGIN_X + op.draftTile.x * TILE_SIZE + (width * TILE_SIZE) / 2;
    const cy = HOUSE_ORIGIN_Y + op.draftTile.y * TILE_SIZE + (height * TILE_SIZE) / 2;

    this.selectionOutline = this.add
      .rectangle(cx, cy, width * TILE_SIZE, height * TILE_SIZE)
      .setStrokeStyle(2, 0xffe08a);

    const panelWidth = 88;
    const panelHeight = 26;
    const panelX = Phaser.Math.Clamp(
      cx - panelWidth / 2,
      0,
      GAME_WIDTH - panelWidth,
    );
    const panelY = Phaser.Math.Clamp(
      cy - (height * TILE_SIZE) / 2 - panelHeight - 6,
      0,
      GAME_HEIGHT - panelHeight,
    );

    this.menuPanel = this.add.image(panelX + panelWidth / 2, panelY + panelHeight / 2, "ui-panel");

    const icons: { key: string; label: string; onClick: () => void }[] =
      op.phase === "confirm-store"
        ? [
            { key: "icon-save", label: "Store for everyone", onClick: () => this.confirmStore() },
            {
              key: "icon-cancel",
              label: "Keep it here",
              onClick: () => {
                op.phase = "menu";
                this.renderMenu();
              },
            },
          ]
        : [
            { key: "icon-rotate", label: "Rotate", onClick: () => this.rotateDraft() },
            {
              key: "icon-move",
              label: "Move",
              onClick: () => {
                op.phase = "moving";
                this.renderMenu();
              },
            },
            { key: "icon-save", label: "Save", onClick: () => this.saveEdit() },
            {
              key: "icon-store",
              label: "Store",
              onClick: () => {
                op.phase = "confirm-store";
                this.renderMenu();
              },
            },
            { key: "icon-cancel", label: "Cancel", onClick: () => this.closeEditMenu() },
          ];

    const iconSize = 16;
    const gap = 2;
    const totalIconsWidth = icons.length * iconSize + (icons.length - 1) * gap;
    let iconX = panelX + (panelWidth - totalIconsWidth) / 2 + iconSize / 2;
    const iconY = panelY + panelHeight / 2;

    for (const def of icons) {
      const icon = this.add.image(iconX, iconY, def.key).setInteractive();
      icon.on("pointerdown", () => {
        this.suppressNextSceneClick = true;
        def.onClick();
      });
      icon.on("pointerover", () => this.showTooltip(icon.x, panelY, def.label));
      icon.on("pointerout", () => {
        this.menuTooltip?.destroy();
        this.menuTooltip = undefined;
      });
      this.menuIcons.push(icon);
      iconX += iconSize + gap;
    }
  }

  private showTooltip(x: number, panelY: number, label: string) {
    this.menuTooltip?.destroy();
    this.menuTooltip = this.add
      .text(x, panelY - 4, label, {
        fontSize: "10px",
        color: "#ffffff",
        backgroundColor: "#2c2016",
        padding: { x: 4, y: 2 },
      })
      .setOrigin(0.5, 1);
  }
}
