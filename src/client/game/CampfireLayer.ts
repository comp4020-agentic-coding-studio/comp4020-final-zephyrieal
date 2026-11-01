import Phaser from "phaser";
import { addFireAnimation } from "./WorldAmbience.ts";
import { CAMPFIRE, CAMPFIRE_LOGS } from "../../shared/campfire.ts";
export function addCampfire(scene: Phaser.Scene) {
  const {x,y}=CAMPFIRE;
  const glow=scene.add.ellipse(x,y,130,90,0xffce72,.12).setDepth(-4);
  for(const log of CAMPFIRE_LOGS){
    scene.add.image(log.x,log.y,`campfire-log-${log.view}`).setDepth(1).setName(`log:${log.id}`);
  }
  addFireAnimation(scene,x,y+18);
  if(!window.matchMedia("(prefers-reduced-motion: reduce)").matches){
    scene.tweens.add({targets:glow,alpha:.22,duration:850,yoyo:true,repeat:-1,ease:"Sine.easeInOut"});
  }
}
