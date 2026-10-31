import { crispText } from "./crispText.ts";
import Phaser from "phaser";
import { CAMPFIRE, CAMPFIRE_LOGS } from "../../shared/campfire.ts";
import { EventBus } from "./eventBus.ts";
export function addCampfire(scene: Phaser.Scene) {
  const {x,y}=CAMPFIRE;
  const glow=scene.add.ellipse(x,y,130,90,0xffce72,.12).setDepth(-4);
  for(const log of CAMPFIRE_LOGS){
    scene.add.image(log.x,log.y,`campfire-log-${log.view}`).setDepth(1).setName(`log:${log.id}`);
  }
  scene.add.image(x,y+18,"meadow-fire").setOrigin(.5,1).setDepth(3).setName("campfire");
  crispText(scene.add.text(x,y+30,"Campfire · stay awhile",{fontFamily:"monospace",fontSize:"9px",color:"#57432d",backgroundColor:"#f6e9ce",padding:{x:4,y:3}})).setOrigin(.5,0).setDepth(2);
  const music=crispText(scene.add.text(x-91,y+34,"♫",{fontSize:"18px",color:"#fff3cc",backgroundColor:"#735440",padding:{x:7,y:4}})).setDepth(3).setInteractive();
  music.on("pointerdown",()=>EventBus.emit("open-campfire"));
  if(!window.matchMedia("(prefers-reduced-motion: reduce)").matches){
    scene.tweens.add({targets:glow,alpha:.22,duration:850,yoyo:true,repeat:-1,ease:"Sine.easeInOut"});
  }
}
