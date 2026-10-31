// Test navigation uses the same feet-level footprints as the authoritative server.
import { blockedMeadow } from "../src/shared/meadow.ts";
import { ROOM_BOUNDS } from "../src/shared/presence.ts";
export function meadowRoute(from:{x:number;y:number},to:{x:number;y:number},reach=24) {
  const size=8,b=ROOM_BOUNDS.outdoor;
  const start={x:Math.round(from.x/size)*size,y:Math.round(from.y/size)*size};
  const key=(p:{x:number;y:number})=>`${p.x},${p.y}`;
  const queue=[start],previous=new Map<string,{x:number;y:number}|null>([[key(start),null]]);
  let found:typeof start|undefined;
  for(let i=0;i<queue.length;i++){
    const p=queue[i];if(Math.hypot(p.x-to.x,p.y-to.y)<=reach){found=p;break;}
    for(const [dx,dy] of [[size,0],[-size,0],[0,size],[0,-size]]){
      const n={x:p.x+dx,y:p.y+dy},k=key(n);
      if(n.x<b.left||n.x>b.right||n.y<b.top||n.y>b.bottom||previous.has(k)||blockedMeadow(n.x,n.y,14))continue;
      previous.set(k,p);queue.push(n);
    }
  }
  if(!found)throw new Error(`No clear route to ${JSON.stringify(to)}`);
  const route:{x:number;y:number}[]=[];let point:typeof start|null=found;
  while(point){route.push(point);point=previous.get(key(point))??null;}
  route.reverse();
  return route.filter((p,i)=>i===0||i===route.length-1||(route[i-1].x!==route[i+1].x&&route[i-1].y!==route[i+1].y));
}
