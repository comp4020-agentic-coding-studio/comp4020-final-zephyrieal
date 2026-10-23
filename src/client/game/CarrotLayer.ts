import type Phaser from "phaser";
import { GIANT_CARROT as C } from "../../shared/carrot.ts";
import { sanctuaryState } from "./sanctuaryState.ts";
import { onSceneExit } from "./onSceneExit.ts";
export function addCarrot(scene: Phaser.Scene) {
  const g = scene.add.graphics().setPosition(C.x,C.y).setDepth(2).setName("giant-carrot");
  const draw = () => {
    const state = sanctuaryState.carrot;
    const ready = !state || state.serverNow + Date.now() - sanctuaryState.carrotReceivedAt >= state.readyAt;
    g.clear();
    g.fillStyle(0x745138).fillEllipse(0,10,48,17);
    if (ready) {
      g.fillStyle(0xe78a38).fillTriangle(-14,-9,14,-9,0,22);
      g.lineStyle(3,0xbb602d).lineBetween(-7,1,4,1).lineBetween(-3,8,3,8);
    }
    const scale = ready ? 1 : .4;
    g.lineStyle(5,0x4d7e3f).lineBetween(0,-7,0,-30*scale).lineBetween(0,-7,-17*scale,-23*scale).lineBetween(0,-7,17*scale,-25*scale);
  };
  draw(); scene.events.on("update",draw);
  onSceneExit(scene,()=>scene.events.off("update",draw));
}
