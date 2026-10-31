import { crispText } from "./crispText.ts";
import { onSceneExit } from "./onSceneExit.ts";
import Phaser from "phaser";
import { FARM_PLOTS } from "../../shared/farm.ts";
import { sanctuaryState } from "./sanctuaryState.ts";

export function addFarm(scene: Phaser.Scene) {
  const plots=FARM_PLOTS.map(plot=>{
    scene.add.image(plot.x,plot.y,"meadow-garden-bed").setDisplaySize(110,76).setName(`farm-bed:${plot.id}`).setDepth(0);
    crispText(scene.add.text(plot.x,plot.y-48,"HUAHUA’S GARDEN",{fontFamily:"monospace",fontSize:"9px",color:"#fff2d5",backgroundColor:"#76543a",padding:{x:5,y:3}})).setOrigin(.5).setDepth(2);
    const plants=Array.from({length:12},(_,i)=>scene.add.image(plot.x-33+(i%4)*22,plot.y-9+Math.floor(i/4)*14,"meadow-crop-sprout").setOrigin(.5,1).setDepth(1).setVisible(false));
    const ready=scene.add.graphics().setDepth(2).setVisible(false);
    ready.lineStyle(2,0xf4d98b).strokeRect(plot.x-55,plot.y-38,110,76);
    return {plot,plants,ready};
  });
  let last=-Infinity,signature="";
  const draw=(time:number)=>{
    if(time-last<250)return;last=time;
    const farm=sanctuaryState.farm;
    const now=farm?farm.serverNow+Date.now()-sanctuaryState.farmReceivedAt:Date.now();
    const next=JSON.stringify(farm?.plots.map(p=>[p.version,p.crop,p.readyAt!==null&&now>=p.readyAt,p.readyAt!==null&&p.plantedAt!==null&&now-p.plantedAt>(p.readyAt-p.plantedAt)/2]));
    if(next===signature)return;signature=next;
    for(const {plot,plants,ready} of plots){
      const state=farm?.plots.find(p=>p.id===plot.id);
      const mature=!!state?.crop&&now>=state.readyAt!;
      const grown=mature||!!state?.crop&&now-state.plantedAt!>(state.readyAt!-state.plantedAt!)/2;
      ready.setVisible(mature);
      for(const plant of plants){
        plant.setVisible(!!state?.crop);
        if(state?.crop)plant.setTexture(grown?`meadow-crop-${state.crop}`:"meadow-crop-sprout");
      }
    }
  };
  draw(0);scene.events.on(Phaser.Scenes.Events.UPDATE,draw);
  onSceneExit(scene,()=>scene.events.off(Phaser.Scenes.Events.UPDATE,draw));
}
