/** Identity is the browse entry, not the first pixels: two animations can share a first frame. */
export function animationPlan(entries,textures){
 const byId=new Map(textures.map(t=>[t.id,t])),frames=[],keys=new Map(),timelines=[],timelineIds=new Map(),rows=[];
 for(const entry of entries){
  const texture=byId.get(entry.icon);if(!texture||texture.frames.length<2)continue;
  if(!timelineIds.has(texture.id)){
   const sequence=texture.frames.map(frame=>{
    const key=JSON.stringify([frame.path,frame.x,frame.y,frame.width,frame.height]);
    if(!keys.has(key)){keys.set(key,frames.length);frames.push(frame);}
    return [keys.get(key),frame.ticks];
   });
   timelineIds.set(texture.id,timelines.length);timelines.push({frames:sequence,interpolate:texture.interpolate});
  }
  rows.push([entry.id,timelineIds.get(texture.id)]);
 }
 return {frames,index:{version:1,rows,timelines}};
}
