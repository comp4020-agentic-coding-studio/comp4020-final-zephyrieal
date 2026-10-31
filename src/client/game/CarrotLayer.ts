import type Phaser from "phaser";
import { GIANT_CARROT as C } from "../../shared/carrot.ts";
import { sanctuaryState } from "./sanctuaryState.ts";
import { onSceneExit } from "./onSceneExit.ts";
export function addCarrot(scene: Phaser.Scene) {
  const carrot=scene.add.image(C.x,C.y+20,"meadow-carrot").setOrigin(.5,1).setDepth(2).setName("giant-carrot");
  let lastReady:boolean|undefined;
  const draw=()=>{
    const state=sanctuaryState.carrot;
    const ready=!state||state.serverNow+Date.now()-sanctuaryState.carrotReceivedAt>=state.readyAt;
    if(ready!==lastReady){carrot.setScale(ready?1:.4);lastReady=ready;}
  };
  draw();scene.events.on("update",draw);
  onSceneExit(scene,()=>scene.events.off("update",draw));
}
