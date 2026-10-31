import { test, expect } from "@playwright/test";
import { walkTo } from "./walk-helper.ts";
test("YouTube links share the queue and personal controls use the visible player",async({browser})=>{
 test.setTimeout(120000);
 const ca=await browser.newContext(),cb=await browser.newContext();
 const a=await ca.newPage(),b=await cb.newPage();const errors:string[]=[];
 // Deterministic player boundary: the actual queue, sockets, identities and UI are real.
 await a.route("https://www.youtube.com/iframe_api",route=>route.fulfill({contentType:"text/javascript",body:`
 window.youtubeCalls=[];
 window.YT={Player:class {
 constructor(mount,options){this.options=options;this.frame=document.createElement('iframe');mount.replaceWith(this.frame);setTimeout(()=>options.events.onReady({target:this}),0);}
 getIframe(){return this.frame} getDuration(){return 90}
 playVideo(){window.youtubeCalls.push('play');this.options.events.onStateChange({target:this,data:1})}
 pauseVideo(){window.youtubeCalls.push('pause')} seekTo(n){window.youtubeCalls.push('seek')}
 setVolume(n){window.youtubeCalls.push('volume:'+n)} mute(){window.youtubeCalls.push('mute')} unMute(){window.youtubeCalls.push('unmute')}
 destroy(){this.frame.remove()}
 }};window.onYouTubeIframeAPIReady();`}));
 try{
 for(const page of [a,b]){page.on("pageerror",e=>errors.push(e.message));await page.goto("/");await page.getByRole("button",{name:/Campfire Radio/}).click();await expect(page.getByRole("button",{name:"Wave",exact:true})).toBeEnabled();await walkTo(page,{x:640,y:640},20);}
 await a.getByLabel("YouTube or YouTube Music link").fill("https://example.com/watch?v=M7lc1UVf-VE");
 await a.getByRole("button",{name:"Queue YouTube track",exact:true}).click();await expect(a.getByRole("alert").filter({hasText:"Paste a YouTube"})).toBeVisible();
 await a.getByLabel("YouTube or YouTube Music link").fill("https://music.youtube.com/watch?v=M7lc1UVf-VE");
 await a.getByLabel("Track name (optional)").fill("YouTube demo");await a.getByRole("button",{name:"Queue YouTube track",exact:true}).click();
 await expect(b.getByRole("status").filter({hasText:"Now playing: YouTube demo"})).toBeVisible();
 await expect(b.getByRole("button",{name:"Skip my current YouTube track"})).toHaveCount(0);
 await b.getByLabel("YouTube or YouTube Music link").fill("https://youtu.be/M7lc1UVf-VE");await b.getByLabel("Track name (optional)").fill("Next video");await b.getByRole("button",{name:"Queue YouTube track",exact:true}).click();
 await b.getByLabel("YouTube or YouTube Music link").fill("https://youtu.be/M7lc1UVf-VE");await expect(b.getByRole("button",{name:"Queue YouTube track",exact:true})).toBeDisabled();
 await a.getByRole("button",{name:"Enable sound",exact:true}).click();
 await a.locator(".youtube-frame").scrollIntoViewIfNeeded();await expect(a.locator(".youtube-frame iframe")).toHaveAttribute("title","YouTube: YouTube demo");
 await expect.poll(()=>a.evaluate(()=> (window as any).youtubeCalls.includes("play"))).toBe(true);
 await a.getByRole("button",{name:"Mute music",exact:true}).click();await expect.poll(()=>a.evaluate(()=> (window as any).youtubeCalls.includes("mute"))).toBe(true);
 await expect(b.getByRole("button",{name:"Mute music",exact:true})).toHaveAttribute("aria-pressed","false");
 await a.getByRole("slider",{name:"Music volume",exact:true}).fill("0.12");await expect.poll(()=>a.evaluate(()=> (window as any).youtubeCalls.includes("volume:12"))).toBe(true);
 await a.locator(".youtube-frame").scrollIntoViewIfNeeded();await a.screenshot({path:"/tmp/sanctuary-youtube-queue.png"});
 await a.getByRole("button",{name:"Unmute music",exact:true}).click();
 await expect.poll(()=>a.evaluate(()=> (window as any).youtubeCalls.at(-1))).toBe("unmute");
 const callStart=await a.evaluate(()=> (window as any).youtubeCalls.length);
 const radioToggle=a.getByRole("button",{name:/Campfire Radio/});
 await radioToggle.click();
 await expect(radioToggle).toHaveAttribute("aria-expanded","false");
 await expect(a.locator(".youtube-frame")).toBeHidden();
 await a.waitForTimeout(1100);
 expect(await a.evaluate(start=>(window as any).youtubeCalls.slice(start).filter((call:string)=>["pause","seek"].includes(call)),callStart)).toEqual([]);
 await radioToggle.click();
 await expect(a.locator(".youtube-frame iframe")).toHaveCount(1);
 await a.waitForTimeout(600);
 expect(await a.evaluate(start=>(window as any).youtubeCalls.slice(start).filter((call:string)=>["pause","seek"].includes(call)),callStart)).toEqual([]);
 const effectiveVolume=()=>a.evaluate(()=>Number((window as any).youtubeCalls.filter((call:string)=>call.startsWith("volume:")).at(-1).split(":")[1]));
 await walkTo(a,{x:480,y:200},20);
 await expect.poll(effectiveVolume).toBeLessThan(12);
 expect(await effectiveVolume()).toBeGreaterThan(0);
 await expect(a.getByRole("slider",{name:"Music volume",exact:true})).toHaveValue("0.12");
 expect(await a.evaluate(start=>(window as any).youtubeCalls.slice(start).filter((call:string)=>["pause","seek","mute"].includes(call)),callStart)).toEqual([]);
 await a.screenshot({path:"/tmp/sanctuary-radio/distant-radio.png"});
 await walkTo(a,{x:640,y:640},20);
 await expect.poll(effectiveVolume).toBe(12);
 await a.getByRole("button",{name:"Skip my current YouTube track"}).click();
 await expect(b.getByRole("status").filter({hasText:"Now playing: Next video"})).toBeVisible();expect(errors).toEqual([]);
 }finally{
  for(const page of [a,b]) {
   await walkTo(page,{x:640,y:640},20);
   await page.getByRole("button",{name:"Remove my waiting track",exact:true}).click();
  }
  for(const page of [a,b]) {
   const skip=page.getByRole("button",{name:"Skip my current YouTube track",exact:true});
   if(await skip.count()) await skip.click();
  }
  await ca.close();await cb.close();
 }
});
