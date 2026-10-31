import Phaser from "phaser";
import { CAMPFIRE, SEATS } from "../../shared/campfire.ts";
import { EventBus } from "./eventBus.ts";
export function addCampfire(scene: Phaser.Scene) {
  const {x,y} = CAMPFIRE;
  scene.add.ellipse(x,y+15,180,126,0xb79e72,0.36).setDepth(-5);
  for (let i=4;i>0;i--) scene.add.ellipse(x,y,45+i*24,30+i*18,0xffce72,0.035).setDepth(-4);
  for (const seat of SEATS) {
    scene.add.ellipse(seat.x,seat.y+3,49,17,0x453d29,0.16).setDepth(-2);
    scene.add.rectangle(seat.x,seat.y-2,44,14,0x886246).setStrokeStyle(2,0x634b37).setDepth(1);
    scene.add.circle(seat.x-20,seat.y-2,7,0xc49a66).setStrokeStyle(2,0x77573e).setDepth(1);
    scene.add.rectangle(seat.x,seat.y-4,27,2,0xbb8d5b).setDepth(2);
  }
  for (let i=0;i<10;i++) {
    const a=i*Math.PI/5;
    scene.add.ellipse(x+Math.cos(a)*24,y+Math.sin(a)*15,11,8,0x8e8b7a).setStrokeStyle(1,0x686f60).setDepth(1);
  }
  scene.add.rectangle(x,y+4,33,8,0x73503a).setAngle(24).setDepth(2);
  scene.add.rectangle(x,y+4,33,8,0x5a412f).setAngle(-24).setDepth(2);
  const flame=scene.add.container(x,y-3).setDepth(3).setName("campfire");
  flame.add([scene.add.ellipse(0,-8,23,32,0xe88a41),scene.add.ellipse(2,-10,13,24,0xffc369),scene.add.ellipse(0,-5,7,14,0xffe4a0)]);
  scene.add.text(x,y+25,"Campfire · stay awhile",{fontFamily:"monospace",fontSize:"9px",color:"#57432d",backgroundColor:"#f6e9ce",padding:{x:4,y:3}}).setOrigin(.5,0).setDepth(2);
  const music=scene.add.text(x-91,y+34,"♫",{fontSize:"18px",color:"#fff3cc",backgroundColor:"#735440",padding:{x:7,y:4}}).setDepth(3).setInteractive();
  music.on("pointerdown",()=>EventBus.emit("open-campfire"));
  if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    scene.tweens.add({targets:flame,scaleX:.9,scaleY:1.08,duration:850,yoyo:true,repeat:-1,ease:"Sine.easeInOut"});
  }
}
