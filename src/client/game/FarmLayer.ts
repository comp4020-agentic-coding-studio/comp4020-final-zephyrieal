import { onSceneExit } from "./onSceneExit.ts";
import Phaser from "phaser";
import { FARM_PLOTS, CROPS } from "../../shared/farm.ts";
import { sanctuaryState } from "./sanctuaryState.ts";

// Native pixel shapes keep the garden legible alongside the chunky sprites.
export function addFarm(scene: Phaser.Scene) {
  const graphics = scene.add.graphics().setDepth(1);
  const title = scene.add.text(FARM_PLOTS[0].x, FARM_PLOTS[0].y - 48, "HUAHUA’S GARDEN", { fontFamily: "monospace", fontSize: "9px", color: "#fff2d5", backgroundColor: "#76543a", padding: { x: 5, y: 3 } }).setOrigin(0.5);
  title.setDepth(2);
  let last = -Infinity, signature="";
  const draw = (time: number) => {
    if (time - last < 250) return;
    last = time;
    const farm = sanctuaryState.farm;
    const now = farm ? farm.serverNow + Date.now() - sanctuaryState.farmReceivedAt : Date.now();
    const next=JSON.stringify(farm?.plots.map(p=>[p.version,p.crop,p.readyAt!==null&&now>=p.readyAt,p.readyAt!==null&&p.plantedAt!==null&&now-p.plantedAt>(p.readyAt-p.plantedAt)/2]));
    if(next===signature)return;signature=next;graphics.clear();
    for (const plot of FARM_PLOTS) {
      const x = plot.x - 53, y = plot.y - 36;
      graphics.fillStyle(0x68442e).fillRect(x - 2, y - 2, 110, 76);
      graphics.fillStyle(0xa7774e).fillRect(x, y, 106, 72);
      for (let row = 0; row < 6; row++) graphics.fillStyle(0x815638).fillRect(x + 3, y + 7 + row * 10, 100, 3);
      const state = farm?.plots.find(p => p.id === plot.id);
      if (!state?.crop) continue;
      const ready = now >= state.readyAt!;
      const grown = ready || now - state.plantedAt! > (state.readyAt! - state.plantedAt!) / 2;
      for (let i = 0; i < 12; i++) {
        const cx = x + 13 + (i % 4) * 26, cy = y + 21 + Math.floor(i / 4) * 22;
        graphics.fillStyle(0x426b39).fillRect(cx, cy - (grown ? 12 : 5), 3, grown ? 15 : 8);
        graphics.fillStyle(0x80a65a).fillRect(cx - 4, cy - 6, 5, 4).fillRect(cx + 2, cy - 10, 5, 4);
        if (grown) {
          graphics.fillStyle(CROPS[state.crop].color);
          if (state.crop === "hay") graphics.fillRect(cx - 2, cy - 17, 3, 9).fillRect(cx + 2, cy - 15, 3, 8);
          else if (state.crop === "lettuce") graphics.fillRect(cx - 5, cy - 12, 12, 9).fillRect(cx - 3, cy - 15, 8, 15);
          else graphics.fillRect(cx - 3, cy - 10, state.crop === "cucumber" ? 5 : 8, state.crop === "cucumber" ? 13 : 8);
        }
      }
      if (ready) graphics.lineStyle(2, 0xf4d98b).strokeRect(x - 1, y - 1, 108, 74);
    }
  };
  scene.events.on(Phaser.Scenes.Events.UPDATE, draw);
  onSceneExit(scene, () => scene.events.off(Phaser.Scenes.Events.UPDATE, draw));
}
