import Phaser from "phaser";
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
function textures(scene:Phaser.Scene) {
  if(scene.textures.exists("meadow-tiles"))return;
  const canvas=scene.textures.createCanvas("meadow-tiles",TILE*12,TILE)!;
  const ctx=canvas.context;
  const bases=["#a6bd69","#a6bd69","#a6bd69","#a6bd69","#ddbd7d","#ddbd7d","#ddbd7d","#ddbd7d","#46b8c4","#46b8c4","#91744c","#c3cc80"];
  bases.forEach((base,i)=>{
    ctx.fillStyle=base;ctx.fillRect(i*TILE,0,TILE,TILE);
    for(let n=0;n<28;n++){
      const h=hash(i,n),x=i*TILE+(h%8)*2,y=((h>>>8)%8)*2;
      ctx.fillStyle=i<4?(n%3?"#acc571":"#97b461"):i<8?(n%3?"#e3c587":"#d4b274"):i<10?(n%3?"#50c0cd":"#71d2d8"):"#a08756";
      ctx.fillRect(x,y,n%4===0?4:2,2);
    }
  });canvas.refresh();
  // Tiny native pixel sprites: one fixed art scale, independently reusable.
  for(const kind of ["tree","pink","pine","rock","flowers"]) {
    const tex=scene.textures.createCanvas(`meadow-${kind}`,80,96)!;
    const c=tex.context;c.imageSmoothingEnabled=false;
    const rect=(color:string,x:number,y:number,w:number,h:number)=>{c.fillStyle=color;c.fillRect(x,y,w,h);};
    if(kind==="flowers"){
      for(let n=0;n<7;n++){const x=8+(hash(n,7)%15)*4,y=20+(hash(n,8)%14)*4;rect("#547d44",x,y,4,10);rect(n%2?"#fff1c2":"#e6a5b2",x-4,y-4,12,4);rect("#f2d16b",x,y-4,4,4);}
    }else if(kind==="rock"){
      rect("#676f5c",20,65,44,22);rect("#8f9780",16,61,44,20);rect("#abb098",24,53,28,22);rect("#c3c6ab",28,53,16,6);rect("#79866a",46,71,18,12);
    }else{
      rect("#567a45",20,80,44,8);rect("#765237",32,48,16,36);rect("#b3874c",36,50,6,32);rect("#765237",24,80,32,4);
      const dark=kind==="pink"?"#a85e7d":"#365f42",mid=kind==="pink"?"#dc8d9e":"#5c8d47",light=kind==="pink"?"#efb1b9":"#8caf55",shine=kind==="pink"?"#f7d1c6":"#b3c666";
      for(let y=4;y<78;y+=2)for(let x=4;x<76;x+=2){
        const h=hash(x,y),cx=x-40;
        const shape=kind==="pine"
          ? [16,32,48].some((top,i)=>y>=top && y<top+26 && Math.abs(cx)<(y-top)*.8+4+i*3)
          : [[28,30,22],[48,29,23],[20,47,17],[42,47,27],[59,47,17]].some(([bx,by,r])=>Math.hypot(x-bx,(y-by)*1.1)<r+(h%3)-1);
        if(!shape)continue;
        const shade=(x*.4+y*.6+(h%11));
        rect(shade>62?dark:shade>43?mid:shade>29?light:shine,x,y,2,2);
      }
    }
    tex.refresh();
  }
}
export function addMeadow(scene:Phaser.Scene) {
  textures(scene);
  const hubs=[...CONSTRUCTION_SITES.map(s=>sitePosition(s.projectId)!),...FARM_PLOTS,GIANT_CARROT];
  const map=scene.make.tilemap({tileWidth:TILE,tileHeight:TILE,width:MEADOW_WIDTH/TILE,height:MEADOW_HEIGHT/TILE});
  const tiles=map.addTilesetImage("meadow-tiles","meadow-tiles",TILE,TILE)!;
  const layer=map.createBlankLayer("terrain",tiles)!.setDepth(-10).setName("meadow-terrain");
  for(let ty=0;ty<MEADOW_HEIGHT/TILE;ty++)for(let tx=0;tx<MEADOW_WIDTH/TILE;tx++){
    const x=tx*TILE+TILE/2,y=ty*TILE+TILE/2,h=hash(tx,ty);
    const water=tx<2||tx>=78||ty<4||ty>=62;
    const cliff=!water&&(tx===2||tx===77||ty===61);
    const path=Math.hypot(x-CAMPFIRE.x,y-CAMPFIRE.y)<155||hubs.some(hub=>Math.hypot(x-hub.x,y-hub.y)<82||distance(x,y,CAMPFIRE,hub)<30);
    const index=water?8+h%2:cliff?10:ty===4?11:path?4+h%4:h%4;
    layer.putTileAt(index,tx,ty);
  }
  // The six-renderer profile exposed tile submission cost. Bake static tiles once
  // into bounded chunks; keep the tilemap as layout data, not thousands of draw quads.
  layer.setVisible(false);
  const atlas=scene.textures.get("meadow-tiles").getSourceImage() as HTMLCanvasElement;
  const chunkSize=256;
  for(let cy=0;cy<MEADOW_HEIGHT;cy+=chunkSize)for(let cx=0;cx<MEADOW_WIDTH;cx+=chunkSize){
    const key=`meadow-chunk-overlap-${cx}-${cy}`;
    if(!scene.textures.exists(key)){
      const chunk=scene.textures.createCanvas(key,Math.min(chunkSize,MEADOW_WIDTH-cx)+1,Math.min(chunkSize,MEADOW_HEIGHT-cy)+1)!;
      chunk.context.imageSmoothingEnabled=false;
      for(let y=0;y<chunk.height;y+=TILE)for(let x=0;x<chunk.width;x+=TILE){
        const tile=layer.getTileAt((cx+x)/TILE,(cy+y)/TILE);
        chunk.context.drawImage(atlas,(tile?.index ?? 8)*TILE,0,TILE,TILE,x,y,TILE,TILE);
      }
      chunk.refresh();
    }
    scene.add.image(cx,cy,key).setOrigin(0).setDepth(-10);
  }
  for(const site of CONSTRUCTION_SITES.filter(s=>s.projectId!=="bridge")) {
    const p=sitePosition(site.projectId)!;
    const pad=scene.add.graphics().setDepth(-2);
    pad.fillStyle(0x777761).fillRect(p.x-48,p.y-52,96,49);
    for(let row=0;row<3;row++)for(let col=0;col<6;col++)pad.fillStyle((row+col)%2?0xa7a58a:0x95977c).fillRect(p.x-46+col*16,p.y-50+row*16,14,13);
  }
  // Decoration is never interactive. Only solid trunks/rocks appear in shared collision data.
  for(const s of SCENERY)scene.add.image(s.x,s.y+10,`meadow-${s.kind}`).setOrigin(.5,1).setDepth(7);
  for(let n=0;n<100;n++) {
    const x=80+hash(n,1)%1120,y=110+hash(n,2)%820;
    if(Math.hypot(x-CAMPFIRE.x,y-CAMPFIRE.y)<170||hubs.some(hub=>distance(x,y,CAMPFIRE,hub)<75))continue;
    scene.add.image(x,y,"meadow-flowers").setOrigin(.5,1).setDepth(-1).setScale(.5);
  }
}
