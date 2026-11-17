import {PriorityPool} from '../browser/priority-pool.ts';

type Crop={x:number;y:number;width:number;height:number};
// All Atlas instances share native decode work; one slot remains available to first paint.
const decodes=new PriorityPool<ImageBitmap>(2,1);
let sequence=0;

export function promoteImageDecode(key:string,priority:number):void{decodes.promote(key,priority);}

export async function decodeImage(source:Blob|ImageBitmap,signal:AbortSignal,priority=0,crop?:Crop,key=String(++sequence)):Promise<ImageBitmap>{
  let owned:ImageBitmap|undefined;
  const discard=()=>{owned?.close();owned=undefined;};
  try{
    const image=await decodes.run(key,async active=>{
      try{
        active.throwIfAborted();signal.throwIfAborted();
        // Preserve raw native colors/alpha for both 2D pixels and model-texture
        // uploads. WebGL unpack flags cannot undo an ImageBitmap's premultiplication.
        const options:ImageBitmapOptions={premultiplyAlpha:'none',colorSpaceConversion:'none',imageOrientation:'from-image'};
        owned=crop?await createImageBitmap(source,crop.x,crop.y,crop.width,crop.height,options):await createImageBitmap(source,options);
        active.throwIfAborted();signal.throwIfAborted();return owned;
      }catch(error){discard();throw error;}
    },signal,priority);
    signal.throwIfAborted();owned=undefined;return image;
  }catch(error){discard();throw error;}
}
