import Phaser from "phaser";
import { addWaterAnimation, shoreDistance } from "./WorldAmbience.ts";
import { MEADOW_WIDTH, MEADOW_HEIGHT, CONSTRUCTION_SITES, sitePosition } from "../../shared/interactions.ts";
import { SCENERY } from "../../shared/meadow.ts";
import { CAMPFIRE } from "../../shared/campfire.ts";
import { FARM_PLOTS } from "../../shared/farm.ts";
import { GIANT_CARROT } from "../../shared/carrot.ts";

const TILE=16;
const hash=(x:number,y:number)=>(Math.imul(x+7919,374761393)^Math.imul(y+104729,668265263))>>>0;
function distance(x:number,y:number,a:{x:number;y:number},b:{x:number;y:number}) {
  const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy||1)));
  return Math.hypot(x-a.x-dx*t,y-a.y-dy*t);
}
export function addMeadow(scene:Phaser.Scene) {
  const hubs=[...CONSTRUCTION_SITES.map(s=>sitePosition(s.projectId)!),...FARM_PLOTS,GIANT_CARROT];
  const pathDistance=(x:number,y:number)=>Math.min(Math.hypot(x-CAMPFIRE.x,y-CAMPFIRE.y)-150,
    ...hubs.map(hub=>Math.min(Math.hypot(x-hub.x,y-hub.y)-82,distance(x,y,CAMPFIRE,hub)-34)));
  const map=scene.make.tilemap({tileWidth:TILE,tileHeight:TILE,width:MEADOW_WIDTH/TILE,height:MEADOW_HEIGHT/TILE});
  const tiles=map.addTilesetImage("meadow-material-grass","meadow-material-grass",TILE,TILE)!;
  const layer=map.createBlankLayer("terrain",tiles)!.setVisible(false).setName("meadow-terrain");
  // Logical terrain remains independent of cached artwork and solid object footprints.
  for(let ty=0;ty<MEADOW_HEIGHT/TILE;ty++)for(let tx=0;tx<MEADOW_WIDTH/TILE;tx++)layer.putTileAt(0,tx,ty);
  const materials=["grass","path","water","cliff"].map(name=>{
    const canvas=scene.textures.get(`meadow-material-${name}`) as Phaser.Textures.CanvasTexture;
    return canvas.context.getImageData(0,0,256,256).data;
  });
  const sample=(material:number,x:number,y:number)=>{
    // Mirrored repeats join identical edge pixels, even if generated material edges vary.
    const wrap=(v:number)=>{const n=((Math.floor(v)%512)+512)%512;return n<256?n:511-n;};
    return (wrap(y)*256+wrap(x))*4;
  };
  const chunkSize=256;
  for(let cy=0;cy<MEADOW_HEIGHT;cy+=chunkSize)for(let cx=0;cx<MEADOW_WIDTH;cx+=chunkSize){
    const key=`meadow-rich-chunk-${cx}-${cy}`;
    if(!scene.textures.exists(key)){
      const width=Math.min(chunkSize,MEADOW_WIDTH-cx)+1,height=Math.min(chunkSize,MEADOW_HEIGHT-cy)+1;
      const chunk=scene.textures.createCanvas(key,width,height)!;
      const pixels=chunk.context.createImageData(width,height);
      for(let py=0;py<height;py+=2)for(let px=0;px<width;px+=2){
        const x=cx+px,y=cy+py;
        const left=42+Math.sin(y/23)*4+Math.sin(y/71)*4,right=1238+Math.sin(y/31)*5;
        const bottom=980+Math.sin(x/27)*5;
        const shore=shoreDistance(x,y);
        const water=shore<0;
        const cliff=!water&&(x-left<13||right-x<13||bottom-y<22);
        const material=water?2:cliff?3:0;
        const index=sample(material,x,y),base=materials[material];
        let r=base[index],g=base[index+1],b=base[index+2];
        if(!water&&!cliff){
          const d=pathDistance(x,y)+Math.sin(x*.21+y*.31)*2+(hash(Math.floor(x/4),Math.floor(y/4))%5)-2;
          const blend=Math.max(0,Math.min(1,(7-d)/14));
          const sand=materials[1],si=sample(1,x,y);
          r=r*(1-blend)+sand[si]*blend;g=g*(1-blend)+sand[si+1]*blend;b=b*(1-blend)+sand[si+2]*blend;
          // Grassy lip above the cliff gives the island a readable raised bank.
          if(shore<5){r=Math.min(255,r*1.08);g=Math.min(255,g*1.08);}
        }else if(water&&shore>-5){
          const foam=(hash(Math.floor(x/4),Math.floor(y/4))%4)!==0;
          if(foam){r=169;g=242;b=243;}
        }else if(cliff&&shore<3){r*=.72;g*=.72;b*=.72;}
        for(let oy=0;oy<2&&py+oy<height;oy++)for(let ox=0;ox<2&&px+ox<width;ox++){
          const target=((py+oy)*width+px+ox)*4;
          pixels.data[target]=r;pixels.data[target+1]=g;pixels.data[target+2]=b;pixels.data[target+3]=255;
        }
      }
      chunk.context.putImageData(pixels,0,0);chunk.refresh();chunk.setFilter(Phaser.Textures.FilterMode.NEAREST);
    }
    scene.add.image(cx,cy,key).setOrigin(0).setDepth(-10);
  }
  addWaterAnimation(scene);
  // Trunks and boulders line up with SCENERY's shared solid feet-level rectangles.
  // Foliage can overhang a path; the trunk, not the crown, is the physical obstacle.
  for(const [index,s] of SCENERY.entries())scene.add.image(s.x,s.y+10,`meadow-${s.kind}`).setOrigin(.5,1).setDepth(10+s.y/1000).setName(`scenery:${index}`);
  for(let n=0;n<210;n++){
    const x=80+hash(n,1)%1120,y=110+hash(n,2)%820;
    if(pathDistance(x,y)<32||SCENERY.some(s=>Math.hypot(x-s.x,y-s.y)<38))continue;
    scene.add.image(x,y,n%4===0?"meadow-bush":"meadow-flowers").setOrigin(.5,1).setDepth(-1);
  }
}
