import Phaser from "phaser";

// Generated atlas cells are deliberately cropped independently: transparent gutters
// aren't part of an object's size, origin, clickable area or physical footprint.
const ROWS = [0, 370, 610, 951, 1254];
const COLUMNS = [0, 316, 630, 944, 1254];
const OBJECTS = [
  ["tree",104,120], ["pine",96,124], ["pink",110,120], ["rock",54,40],
  ["bush",46,38], ["flowers",34,28], ["log",54,26], ["fire",64,68],
  ["shed",128,128], ["greenhouse",128,128], ["house",128,128], ["hall",140,128],
  ["foundation",112,58], ["frame",112,110], ["bridge",112,62], ["carrot",58,70],
] as const;

export function prepareMeadowArt(scene: Phaser.Scene) {
  // Trim and bake each drawn perspective once at the game's pixel scale.
  for(const [key,views] of [["campfire-logs",["rising","falling"]],["campfire-log-flat-sheet",["flat"]]] as const) {
  const logs=scene.textures.get(key).getSourceImage() as HTMLImageElement;
  const logScan=document.createElement("canvas");logScan.width=logs.width;logScan.height=logs.height;
  const logContext=logScan.getContext("2d")!;logContext.drawImage(logs,0,0);
  const logPixels=logContext.getImageData(0,0,logs.width,logs.height).data;
  for(const [index,view] of views.entries()) {
    let left=logs.width,top=logs.height,right=-1,bottom=-1;
    for(let y=0;y<logs.height;y++)for(let x=Math.floor(index*logs.width/views.length);x<Math.floor((index+1)*logs.width/views.length);x++) {
      if(logPixels[(y*logs.width+x)*4+3]<40)continue;
      left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
    }
    if(right<left)throw new Error(`Missing campfire log: ${view}`);
    const width=right-left+1,height=bottom-top+1;
    // Preserve each drawn view's proportions at the same world scale.
    const displayWidth=view==="flat"?68:64;
    const texture=scene.textures.createCanvas(`campfire-log-${view}`,displayWidth,Math.round(height/width*displayWidth))!;
    texture.context.imageSmoothingEnabled=false;
    texture.context.drawImage(logs,left,top,width,height,0,0,texture.width,texture.height);
    texture.refresh();texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
  }
  scene.textures.remove(key);
  }
  const texture=scene.textures.get("sanctuary-scenery-v2");
  const source=texture.getSourceImage() as HTMLImageElement;
  const scan=document.createElement("canvas");scan.width=source.width;scan.height=source.height;
  const ctx=scan.getContext("2d",{willReadFrequently:true})!;ctx.drawImage(source,0,0);
  const alpha=ctx.getImageData(0,0,source.width,source.height).data;
  OBJECTS.forEach(([name,maxWidth,maxHeight],i)=>{
    const row=Math.floor(i/4),col=i%4;
    const columns=row===2?[0,318,624,906,1254]:COLUMNS;
    const x0=Math.round(columns[col]/1254*source.width),x1=Math.round(columns[col+1]/1254*source.width);
    const y0=Math.round(ROWS[row]/1254*source.height),y1=Math.round(ROWS[row+1]/1254*source.height);
    let left=x1,top=y1,right=-1,bottom=-1;
    for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)if(alpha[(y*source.width+x)*4+3]>=40){
      left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
    }
    if(right<left)throw new Error(`Missing meadow sprite: ${name}`);
    const width=right-left+1,height=bottom-top+1;
    const scale=Math.min(maxWidth/width,maxHeight/height);
    const sprite=scene.textures.createCanvas(`meadow-${name}`,Math.max(1,Math.round(width*scale)),Math.max(1,Math.round(height*scale)))!;
    sprite.context.imageSmoothingEnabled=false;
    sprite.context.drawImage(source,left,top,width,height,0,0,sprite.width,sprite.height);
    sprite.refresh();sprite.setFilter(Phaser.Textures.FilterMode.NEAREST);
  });
  scene.textures.remove("sanctuary-scenery-v2");

  const ground=scene.textures.get("sanctuary-ground-v2").getSourceImage() as HTMLImageElement;
  for(const [i,name] of ["grass","path","water","cliff"].entries()){
    const material=scene.textures.createCanvas(`meadow-material-${name}`,256,256)!;
    material.context.imageSmoothingEnabled=false;
    material.context.drawImage(ground,(i%2)*ground.width/2,Math.floor(i/2)*ground.height/2,ground.width/2,ground.height/2,0,0,256,256);
    material.refresh();material.setFilter(Phaser.Textures.FilterMode.NEAREST);
  }
  scene.textures.remove("sanctuary-ground-v2");

  // Keep every established construction key, stage, interaction and test hook.
  // Finished art is specific to each building; unfinished sites retain visible framing.
  for(const [project,complete] of [["toolshed","shed"],["greenhouse","greenhouse"],["guinea-pig-house","house"],["great-hall","hall"],["bridge","bridge"]]){
    for(let stage=0;stage<=4;stage++){
      const key=`${project}-${stage}`;scene.textures.remove(key);
      const canvas=scene.textures.createCanvas(key,144,144)!;
      const draw=(frame:string,opacity=1)=>{
        const image=scene.textures.get(`meadow-${frame}`).getSourceImage() as HTMLCanvasElement;
        canvas.context.globalAlpha=opacity;
        canvas.context.drawImage(image,Math.round((144-image.width)/2),144-image.height);
      };
      canvas.context.imageSmoothingEnabled=false;
      if(stage===4)draw(complete);
      else if(stage===0)draw("foundation");
      else if(stage===1)draw("frame");
      else {draw(complete,stage===2?.45:.8);draw("frame",stage===2?1:.65);}
      canvas.context.globalAlpha=1;canvas.refresh();canvas.setFilter(Phaser.Textures.FilterMode.NEAREST);
    }
  }
}

export function prepareGardenArt(scene:Phaser.Scene){
  const source=scene.textures.get("sanctuary-garden-v2").getSourceImage() as HTMLImageElement;
  const scan=document.createElement("canvas");scan.width=source.width;scan.height=source.height;
  const ctx=scan.getContext("2d",{willReadFrequently:true})!;ctx.drawImage(source,0,0);
  const data=ctx.getImageData(0,0,source.width,source.height).data;
  const cells=[
    ["garden-bed",0,0,610,500,112,76],
    ["crop-hay",610,0,935,500,18,22],
    ["crop-lettuce",935,0,1254,500,18,22],
    ["crop-pepper",0,500,410,930,18,22],
    ["crop-cucumber",410,500,905,930,18,22],
    ["crop-carrot",905,500,1254,930,18,22],
    ["crop-sprout",0,930,410,1254,10,12],
  ] as const;
  for(const [name,x0,y0,x1,y1,maxWidth,maxHeight] of cells){
    let left=source.width,top=source.height,right=-1,bottom=-1;
    for(let y=Math.round(y0/1254*source.height);y<Math.round(y1/1254*source.height);y++){
      for(let x=Math.round(x0/1254*source.width);x<Math.round(x1/1254*source.width);x++)if(data[(y*source.width+x)*4+3]>=40){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
    }
    if(right<left)throw new Error(`Missing garden sprite: ${name}`);
    const width=right-left+1,height=bottom-top+1,scale=Math.min(maxWidth/width,maxHeight/height);
    const texture=scene.textures.createCanvas(`meadow-${name}`,Math.max(1,Math.round(width*scale)),Math.max(1,Math.round(height*scale)))!;
    texture.context.imageSmoothingEnabled=false;
    texture.context.drawImage(source,left,top,width,height,0,0,texture.width,texture.height);
    texture.refresh();texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
  }
  scene.textures.remove("sanctuary-garden-v2");
}
