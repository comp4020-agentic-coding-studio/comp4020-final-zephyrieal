import {test,expect} from "@playwright/test";
import {writeFile} from "node:fs/promises";

test("every fire frame preserves opaque pixels and the fixed stone ring",async({page})=>{
 await page.goto("/");
 await expect.poll(()=>page.evaluate(async()=>{const path="/game/gameRuntime.ts",g=(await import(path)).gameRuntime.current;return !!g?.textures.exists("campfire-flicker-frames");})).toBe(true);
 const result=await page.evaluate(async()=>{
  const path="/game/gameRuntime.ts",g=(await import(path)).gameRuntime.current;
  const source=g.textures.get("meadow-fire").getSourceImage() as HTMLCanvasElement;
  const sheet=g.textures.get("campfire-flicker-frames").getSourceImage() as HTMLCanvasElement;
  const original=source.getContext("2d")!.getImageData(0,0,source.width,source.height).data;
  const holes:number[]=[],stoneChanges:number[]=[];
  for(let frame=0;frame<8;frame++){
   const pixels=sheet.getContext("2d")!.getImageData(frame*source.width,0,source.width,source.height).data;
   let missing=0,changed=0;
   for(let i=0;i<original.length;i+=4){
    if(original[i+3]>=200 && pixels[i+3]<200)missing++;
    if(i>=Math.floor(source.height*.8)*source.width*4 && original.subarray(i,i+4).some((v,j)=>v!==pixels[i+j]))changed++;
   }
   holes.push(missing);stoneChanges.push(changed);
  }
  return {holes,stoneChanges,image:sheet.toDataURL()};
 });
 expect(result.holes).toEqual(Array(8).fill(0));
 expect(result.stoneChanges).toEqual(Array(8).fill(0));
 await writeFile("/tmp/fire-frame-strip.png",Buffer.from(result.image.split(",")[1],"base64"));
});
