import Phaser from "phaser";
import { prepareMeadowArt, prepareGardenArt } from "../MeadowArt.ts";
import { SPRITE_ASSETS } from "../assets.ts";

// Runs once: loads every real sprite up front, then hands off to the outdoor
// meadow. Scene switching after this point is driven by PhaserGame.tsx
// listening for "switch-scene" on the EventBus, not by this scene.
export class BootScene extends Phaser.Scene {
  constructor() {
    super("BootScene");
  }

  preload() {
    for (const [key, url] of Object.entries(SPRITE_ASSETS)) {
      this.load.image(key, url);
    }
  }

  create() {
    prepareMeadowArt(this);
    prepareGardenArt(this);
    // Each view is trimmed to its opaque silhouette; sheet padding is never
    // part of the rendered size or the furniture's clickable area.
    const sheet=this.textures.get("furniture-sheet").getSourceImage() as HTMLImageElement;
    const scan=document.createElement("canvas");scan.width=sheet.width;scan.height=sheet.height;
    const scanContext=scan.getContext("2d")!;scanContext.drawImage(sheet,0,0);
    const sheetData=scanContext.getImageData(0,0,sheet.width,sheet.height).data;
    for (const [row, kind] of ["hay_bed", "tunnel", "hideout"].entries()) {
      for (const [col, view] of ["front", "back", "left"].entries()) {
        const source=sheet, data=sheetData;
        let left = source.width, top = source.height, right = 0, bottom = 0;
        for (let y = Math.floor(row * source.height / 3); y < Math.floor((row + 1) * source.height / 3); y++) {
          for (let x = Math.floor(col * source.width / 3); x < Math.floor((col + 1) * source.width / 3); x++) {
            if (data[(y * source.width + x) * 4 + 3] < 32) continue;
            left = Math.min(left, x); right = Math.max(right, x);
            top = Math.min(top, y); bottom = Math.max(bottom, y);
          }
        }
        const width=right-left+1,height=bottom-top+1;
        const tile=this.textures.createCanvas(`furniture-${kind}-${view}`,128,Math.max(1,Math.round(height/width*128)))!;
        tile.context.imageSmoothingEnabled=false;
        tile.context.drawImage(source,left,top,width,height,0,0,tile.width,tile.height);
        tile.refresh();tile.add("furniture",0,0,0,tile.width,tile.height);
      }
    }
    this.textures.remove("furniture-sheet");
    // Frames use the actual alpha bounds of the generated sheet, keeping feet
    // aligned across all four views without modifying or duplicating the art.
    this.textures.get("guinea-pig").add("potato", 0, 232, 260, 1035, 665);
    this.textures.get("mochi").add("pig", 0, 126, 164, 1216, 781);
    this.textures.get("biscuit").add("pig", 0, 223, 250, 1068, 675);
    this.textures.get("clover").add("pig", 0, 182, 269, 1107, 622);
    // Trim transparent padding in the alternate poses without changing the assets.
    for (const id of ["potato", "mochi", "biscuit", "clover"]) {
      const texture = this.textures.get(`${id}-sleeping`);
      const source = texture.getSourceImage() as HTMLImageElement;
      const canvas = document.createElement("canvas");
      canvas.width = source.width; canvas.height = source.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(source, 0, 0);
      const { data } = ctx.getImageData(0, 0, source.width, source.height);
      let left=source.width, top=source.height, right=-1, bottom=-1;
      for (let y=0;y<source.height;y++) for (let x=0;x<source.width;x++) {
        if (data[(y*source.width+x)*4+3]<32) continue;
        left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
      }
      if (right>=left) texture.add("sleeping",0,left,top,right-left+1,bottom-top+1);
    }
    for(const [key,frame] of [["guinea-pig","potato"],["mochi","pig"],["biscuit","pig"],["clover","pig"],...(["potato","mochi","biscuit","clover"].map(id=>[`${id}-sleeping`,"sleeping"]))]) {
      const texture=this.textures.get(key),f=texture.get(frame);
      const canvas=document.createElement("canvas");canvas.width=152;canvas.height=Math.max(1,Math.round(f.height/f.width*152));
      const ctx=canvas.getContext("2d")!;ctx.imageSmoothingEnabled=false;
      ctx.drawImage(texture.getSourceImage() as HTMLImageElement,f.cutX,f.cutY,f.cutWidth,f.cutHeight,0,0,canvas.width,canvas.height);
      this.textures.remove(key);this.textures.addCanvas(key,canvas)!.add(frame,0,0,0,canvas.width,canvas.height);
    }
    const visitor = this.textures.get("visitor-gardener");
    visitor.add("front", 0, 174, 120, 359, 471);
    visitor.add("back", 0, 723, 121, 349, 470);
    visitor.add("left", 0, 205, 674, 338, 468);
    visitor.add("right", 0, 711, 673, 336, 468);
    this.scene.start(this.registry.get("requestedRoom") && this.registry.get("requestedRoom") !== "outdoor" ? "IndoorScene" : "OutdoorScene");
  }
}
