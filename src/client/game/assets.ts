import sanctuaryGarden from "../assets/sprites/sanctuary-garden-v2.png";
import sanctuaryScenery from "../assets/sprites/sanctuary-scenery-v2.png";
import sanctuaryGround from "../assets/sprites/sanctuary-ground-v2.png";
import huahuaSleeping from "../assets/sprites/guinea-pig-huahua-sleeping.png";
import mochiSleeping from "../assets/sprites/guinea-pig-mochi-sleeping.png";
import biscuitSleeping from "../assets/sprites/guinea-pig-biscuit-sleeping.png";
import cloverSleeping from "../assets/sprites/guinea-pig-clover-sleeping.png";
import mochi from "../assets/sprites/guinea-pig-mochi.png";
import biscuit from "../assets/sprites/guinea-pig-biscuit.png";
import clover from "../assets/sprites/guinea-pig-clover.png";
import visitorGardener from "../assets/sprites/visitor-minimal.png";
import tileFloor from "../assets/sprites/tile-floor.png";
import tileWall from "../assets/sprites/tile-wall.png";
import grassTile from "../assets/sprites/grass-tile.png";
import flower from "../assets/sprites/flower.png";
import guineaPig from "../assets/sprites/guinea-pig-huahua-tricolour.png";
import hayBedFront from "../assets/sprites/furniture-cozy.png";
import iconRotate from "../assets/sprites/icon-rotate.png";
import iconMove from "../assets/sprites/icon-move.png";
import iconSave from "../assets/sprites/icon-save.png";
import iconStore from "../assets/sprites/icon-store.png";
import iconCancel from "../assets/sprites/icon-cancel.png";
import uiPanel from "../assets/sprites/ui-panel.png";
import guineaPigHouse0 from "../assets/sprites/guinea-pig-house-0.png";
import guineaPigHouse1 from "../assets/sprites/guinea-pig-house-1.png";
import guineaPigHouse2 from "../assets/sprites/guinea-pig-house-2.png";
import guineaPigHouse3 from "../assets/sprites/guinea-pig-house-3.png";
import guineaPigHouse4 from "../assets/sprites/guinea-pig-house-4.png";
import toolshed0 from "../assets/sprites/toolshed-0.png";
import toolshed1 from "../assets/sprites/toolshed-1.png";
import toolshed2 from "../assets/sprites/toolshed-2.png";
import toolshed3 from "../assets/sprites/toolshed-3.png";
import toolshed4 from "../assets/sprites/toolshed-4.png";
import greenhouse0 from "../assets/sprites/greenhouse-0.png";
import greenhouse1 from "../assets/sprites/greenhouse-1.png";
import greenhouse2 from "../assets/sprites/greenhouse-2.png";
import greenhouse3 from "../assets/sprites/greenhouse-3.png";
import greenhouse4 from "../assets/sprites/greenhouse-4.png";
import bridge0 from "../assets/sprites/bridge-0.png";
import bridge1 from "../assets/sprites/bridge-1.png";
import bridge2 from "../assets/sprites/bridge-2.png";
import bridge3 from "../assets/sprites/bridge-3.png";
import bridge4 from "../assets/sprites/bridge-4.png";
import greatHall0 from "../assets/sprites/great-hall-0.png";
import greatHall1 from "../assets/sprites/great-hall-1.png";
import greatHall2 from "../assets/sprites/great-hall-2.png";
import greatHall3 from "../assets/sprites/great-hall-3.png";
import greatHall4 from "../assets/sprites/great-hall-4.png";

// Real pixel art, hand-drawn to match the reference sheet's cozy palette ---
// replaces the crit-8/9 procedural Graphics placeholders. Vite imports each
// PNG as a hashed URL, so BootScene.preload() just needs key -> url.
export const SPRITE_ASSETS: Record<string, string> = {
  "sanctuary-garden-v2": sanctuaryGarden,
  "sanctuary-scenery-v2": sanctuaryScenery,
  "sanctuary-ground-v2": sanctuaryGround,
  mochi, biscuit, clover,
  "potato-sleeping": huahuaSleeping, "mochi-sleeping": mochiSleeping,
  "biscuit-sleeping": biscuitSleeping, "clover-sleeping": cloverSleeping,
  "visitor-gardener": visitorGardener,
  "furniture-sheet": hayBedFront,
  "tile-floor": tileFloor,
  "tile-wall": tileWall,
  "grass-tile": grassTile,
  flower,
  "guinea-pig": guineaPig,
  "icon-rotate": iconRotate,
  "icon-move": iconMove,
  "icon-save": iconSave,
  "icon-store": iconStore,
  "icon-cancel": iconCancel,
  "ui-panel": uiPanel,
  "guinea-pig-house-0": guineaPigHouse0,
  "guinea-pig-house-1": guineaPigHouse1,
  "guinea-pig-house-2": guineaPigHouse2,
  "guinea-pig-house-3": guineaPigHouse3,
  "guinea-pig-house-4": guineaPigHouse4,
  "toolshed-0": toolshed0,
  "toolshed-1": toolshed1,
  "toolshed-2": toolshed2,
  "toolshed-3": toolshed3,
  "toolshed-4": toolshed4,
  "greenhouse-0": greenhouse0,
  "greenhouse-1": greenhouse1,
  "greenhouse-2": greenhouse2,
  "greenhouse-3": greenhouse3,
  "greenhouse-4": greenhouse4,
  "bridge-0": bridge0,
  "bridge-1": bridge1,
  "bridge-2": bridge2,
  "bridge-3": bridge3,
  "bridge-4": bridge4,
  "great-hall-0": greatHall0,
  "great-hall-1": greatHall1,
  "great-hall-2": greatHall2,
  "great-hall-3": greatHall3,
  "great-hall-4": greatHall4,
};
