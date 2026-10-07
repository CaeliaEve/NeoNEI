import type {Texture} from '@elysium/contracts';
import type {Detail} from '../catalog/client.ts';

/** First visible choices, outputs and view art; hundreds of hidden choices stay lazy. */
export function firstFrames({recipe,related}:Detail):Texture['frames'] {
 const icons=new Set<string>();
 const add=(kind:'item'|'fluid',id?:string)=>{
  const icon=(kind==='item'?related.items:related.fluids).find(row=>row.id===id)?.icon;
  if(icon)icons.add(icon);
 };
 for(const input of recipe.inputs)add(input.kind,input.choices[0]?.id);
 for(const output of recipe.outputs)add(output.kind,output.change?.samples[0]?.id??output.id);
 const category=related.categories.find(row=>row.id===recipe.category);
 const view=related.views.find(row=>row.id===(recipe.view??category?.view));
 for(const element of view?.elements??[])if(element.kind==='sprite'||element.kind==='clip')icons.add(element.asset);
 if(category?.icon)add(category.icon.kind,category.icon.id);
 const frames:Texture['frames']=[],seen=new Set<string>();
 for(const id of icons){
  const frame=related.textures.find(row=>row.id===id)?.frames[0];
  if(!frame)continue;
  const key=JSON.stringify([frame.path,frame.x,frame.y,frame.width,frame.height]);
  if(!seen.has(key)){seen.add(key);frames.push(frame);}
  if(frames.length>=64)break;
 }
 return frames;
}

export async function warmFrames(frames:Texture['frames'],acquire:(frame:Texture['frames'][number])=>Promise<{release:()=>void}>,signal:AbortSignal){
 for(const frame of frames){
  if(signal.aborted)return;
  const lease=await acquire(frame);
  lease.release();
 }
}
