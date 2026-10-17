import tileFloor from "../assets/sprites/tile-floor.png";
import tileWall from "../assets/sprites/tile-wall.png";
import grassTile from "../assets/sprites/grass-tile.png";
import flower from "../assets/sprites/flower.png";
import guineaPig from "../assets/sprites/guinea-pig.png";
import hayBedFront from "../assets/sprites/furniture-hay_bed-front.png";
import hayBedBack from "../assets/sprites/furniture-hay_bed-back.png";
import hayBedLeft from "../assets/sprites/furniture-hay_bed-left.png";
import tunnelFront from "../assets/sprites/furniture-tunnel-front.png";
import tunnelBack from "../assets/sprites/furniture-tunnel-back.png";
import tunnelLeft from "../assets/sprites/furniture-tunnel-left.png";
import hideoutFront from "../assets/sprites/furniture-hideout-front.png";
import hideoutBack from "../assets/sprites/furniture-hideout-back.png";
import hideoutLeft from "../assets/sprites/furniture-hideout-left.png";
import iconRotate from "../assets/sprites/icon-rotate.png";
import iconMove from "../assets/sprites/icon-move.png";
import iconSave from "../assets/sprites/icon-save.png";
import iconStore from "../assets/sprites/icon-store.png";
import iconCancel from "../assets/sprites/icon-cancel.png";
import uiPanel from "../assets/sprites/ui-panel.png";
import construction0 from "../assets/sprites/construction-0.png";
import construction1 from "../assets/sprites/construction-1.png";
import construction2 from "../assets/sprites/construction-2.png";
import construction3 from "../assets/sprites/construction-3.png";
import construction4 from "../assets/sprites/construction-4.png";

// Real pixel art, hand-drawn to match the reference sheet's cozy palette ---
// replaces the crit-8/9 procedural Graphics placeholders. Vite imports each
// PNG as a hashed URL, so BootScene.preload() just needs key -> url.
export const SPRITE_ASSETS: Record<string, string> = {
  "tile-floor": tileFloor,
  "tile-wall": tileWall,
  "grass-tile": grassTile,
  flower,
  "guinea-pig": guineaPig,
  "furniture-hay_bed-front": hayBedFront,
  "furniture-hay_bed-back": hayBedBack,
  "furniture-hay_bed-left": hayBedLeft,
  "furniture-tunnel-front": tunnelFront,
  "furniture-tunnel-back": tunnelBack,
  "furniture-tunnel-left": tunnelLeft,
  "furniture-hideout-front": hideoutFront,
  "furniture-hideout-back": hideoutBack,
  "furniture-hideout-left": hideoutLeft,
  "icon-rotate": iconRotate,
  "icon-move": iconMove,
  "icon-save": iconSave,
  "icon-store": iconStore,
  "icon-cancel": iconCancel,
  "ui-panel": uiPanel,
  "construction-0": construction0,
  "construction-1": construction1,
  "construction-2": construction2,
  "construction-3": construction3,
  "construction-4": construction4,
};
