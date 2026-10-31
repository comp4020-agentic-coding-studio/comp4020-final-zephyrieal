import Phaser from "phaser";
import { MEADOW_WIDTH, MEADOW_HEIGHT } from "../../shared/interactions.ts";
import { onSceneExit } from "./onSceneExit.ts";

// The static terrain and animated foam use exactly the same island outline.
export function shoreDistance(x:number,y:number) {
  const left=42+Math.sin(y/23)*4+Math.sin(y/71)*4,right=1238+Math.sin(y/31)*5;
  const top=72+Math.sin(x/36)*5,bottom=980+Math.sin(x/27)*5;
  return Math.min(x-left,right-x,y-top,bottom-y);
}
const reduced=()=>window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function addWaterAnimation(scene:Phaser.Scene) {
  if(reduced())return;
  const water=scene.add.graphics().setDepth(-9).setName("water-ripples");
  const points:{x:number;y:number;foam:boolean;phase:number}[]=[];
  for(let y=4;y<MEADOW_HEIGHT;y+=8)for(let x=4;x<MEADOW_WIDTH;x+=8) {
    const shore=shoreDistance(x,y);
    if(shore< -2 && shore> -9)points.push({x,y,foam:true,phase:(x*7+y*13)%37});
    else if(shore< -14 && x%32===4 && y%24===4)points.push({x,y,foam:false,phase:(x*3+y*7)%43});
  }
  let last=-Infinity;
  const update=(time:number)=>{
    // One batched overlay, eight updates a second, only inside the camera.
    if(!water.active||time-last<125)return;last=time;
    const view=scene.cameras.main.worldView;
    water.clear();
    for(const point of points) {
      if(point.x<view.left-16||point.x>view.right+16||point.y<view.top-12||point.y>view.bottom+12)continue;
      const wave=(Math.sin(time/800+point.phase)+1)/2;
      const x=point.x+Math.round(Math.sin(time/1200+point.phase)*2)*2;
      const y=point.y+Math.round(Math.sin(time/1600+point.phase)*1)*2;
      if(shoreDistance(x,y)>-1)continue;
      water.fillStyle(point.foam?0xd4ffff:0x9beaf1,point.foam?.18+wave*.48:.12+wave*.24);
      water.fillRect(x,y,point.foam?4:8,2);
      if(!point.foam && wave>.65)water.fillRect(x+2,y-2,4,2);
    }
  };
  scene.events.on(Phaser.Scenes.Events.UPDATE,update);
  onSceneExit(scene,()=>scene.events.off(Phaser.Scenes.Events.UPDATE,update));
}

export function addFireAnimation(scene:Phaser.Scene,x:number,y:number) {
  if(reduced()) {
    scene.add.image(x,y,"meadow-fire").setOrigin(.5,1).setDepth(3).setName("campfire");
    return;
  }
  const key="campfire-flicker-frames";
  if(!scene.textures.exists(key)) {
    const source=scene.textures.get("meadow-fire").getSourceImage() as HTMLCanvasElement;
    const width=source.width,height=source.height;
    const base=document.createElement("canvas"),flame=document.createElement("canvas");
    base.width=flame.width=width;base.height=flame.height=height;
    const ctx=base.getContext("2d")!,fctx=flame.getContext("2d")!;
    ctx.drawImage(source,0,0);
    const pixels=ctx.getImageData(0,0,width,height),hot=fctx.createImageData(width,height);
    // Overlay warm flame pixels on the intact source. Removing them first
    // exposes transparent seams when pixel rows move in opposite directions.
    for(let py=0;py<height*.72;py++)for(let px=0;px<width;px++) {
      const i=(Math.floor(py)*width+px)*4,r=pixels.data[i],g=pixels.data[i+1],b=pixels.data[i+2];
      if(r>155 && r>g*1.06 && g>b*1.55) {
        hot.data.set(pixels.data.subarray(i,i+4),i);
      }
    }
    fctx.putImageData(hot,0,0);
    const sheet=scene.textures.createCanvas(key,width*8,height)!;
    sheet.context.imageSmoothingEnabled=false;
    for(let frame=0;frame<8;frame++) {
      const phase=frame*Math.PI/4;
      sheet.context.drawImage(base,frame*width,0);
      // Pixel-row drift changes the flame silhouette without wobbling the stone ring.
      for(let row=0;row<height;row+=2) {
        const drift=Math.round(Math.sin(phase+row*.2)*(1-row/height)*2);
        const lift=Math.round(Math.sin(phase)*2*(1-row/height));
        sheet.context.drawImage(flame,0,row,width,2,frame*width+drift,row-lift,width,2);
      }
      sheet.add(frame,0,frame*width,0,width,height);
    }
    sheet.refresh();sheet.setFilter(Phaser.Textures.FilterMode.NEAREST);
  }
  if(!scene.anims.exists("campfire-flicker"))scene.anims.create({key:"campfire-flicker",frames:Array.from({length:8},(_,frame)=>({key,frame})),frameRate:10,repeat:-1});
  scene.add.sprite(x,y,key,0).setOrigin(.5,1).setDepth(3).setName("campfire").play("campfire-flicker");
  // Reuse a fixed set of embers instead of allocating particles every frame.
  for(let i=0;i<6;i++) {
    const ember=scene.add.rectangle(x-9+i*4,y-25,2,i%2?2:4,i%2?0xffda70:0xffa542).setDepth(4).setAlpha(0).setName(`fire-ember:${i}`);
    scene.tweens.add({targets:ember,x:ember.x+(i%2?7:-6),y:y-55-i*2,alpha:{from:.8,to:0},duration:1100+i*130,delay:i*220,repeat:-1});
  }
}
