import type {Visual} from '@elysium/contracts';
import type {InventoryVisualSource} from './inventory-visual.ts';
import {nativeVector} from './native-visual-math.ts';

type Lightmap=Extract<Visual['data'],{kind:'inventoryLightmap'}>;
interface Shared {texture:WebGLTexture;refs:number;dispose():void}
const caches=new WeakMap<WebGL2RenderingContext,Map<string,Shared>>();
export interface InventoryLightmapPlayer {bind(uniform:(name:string)=>WebGLUniformLocation|null):void;close():void}

/** A constant-coordinate native lighting stage. GL_CLAMP's border is evaluated
 * by the fixed-function shader port; the GPU's EDGE sampler only supplies the
 * edge texel, never substitutes another lighting image. */
export async function openInventoryLightmap(catalog:string,row:Visual,source:InventoryVisualSource,gl:WebGL2RenderingContext,signal:AbortSignal):Promise<InventoryLightmapPlayer>{
  if(row.data.kind!=='inventoryLightmap')throw Error('Native inventory lightmap is missing');
  const data:Lightmap=row.data,key=catalog+':'+row.id;
  if(!data.wrap.every(v=>v===10496||v===33071))throw Error('Unreviewed native lightmap border');
  const matrix=nativeVector(data.matrix),coordinate=nativeVector(data.coordinate),border=nativeVector(data.border);
  let cache=caches.get(gl);if(!cache){cache=new Map();caches.set(gl,cache);}const entries=cache;
  const retain=(entry:Shared):InventoryLightmapPlayer=>{
    entry.refs++;let closed=false;
    return {bind(uniform){if(closed)throw Error('Native lightmap is closed');
      gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,entry.texture);
      gl.uniform1i(uniform('lightmapOn'),1);gl.uniform1i(uniform('lightmapImage'),1);
      gl.uniformMatrix4fv(uniform('lightmapMatrix'),false,matrix);gl.uniform4fv(uniform('lightmapCoordinate'),coordinate);
      gl.uniform4fv(uniform('lightmapBorder'),border);gl.uniform2i(uniform('lightmapClamp'),data.wrap[0]===10496?1:0,data.wrap[1]===10496?1:0);
    },close(){if(closed)return;closed=true;if(--entry.refs===0){entries.delete(key);entry.dispose();}}};
  };
  signal.throwIfAborted();const cached=entries.get(key);if(cached)return retain(cached);
  const descriptor=await source.texture(data.pixels,signal);signal.throwIfAborted();
  if(descriptor.id!==data.pixels||descriptor.visual||descriptor.interpolate||descriptor.frames.length!==1)throw Error('Native lightmap is not a still upload');
  const lease=await source.atlas.acquireFrame(descriptor.frames[0]!,signal);let texture:WebGLTexture|null=null,release:(()=>void)|undefined;
  try{
    signal.throwIfAborted();const existing=entries.get(key);if(existing)return retain(existing);
    if(lease.image.width!==16||lease.image.height!==16)throw Error('Native lightmap lost its 16 by 16 pixels');
    release=source.atlas.claimVisualBytes(16*16*4+128);texture=gl.createTexture();if(!texture)throw Error('Cannot allocate native lightmap');
    gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,texture);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL,gl.NONE);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,lease.image);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    if(gl.getError()!==gl.NO_ERROR)throw Error('Cannot upload native lightmap pixels');signal.throwIfAborted();
    const owned=texture,unclaim=release,entry:Shared={texture:owned,refs:0,dispose(){gl.deleteTexture(owned);unclaim();}};
    entries.set(key,entry);texture=null;release=undefined;return retain(entry);
  }finally{if(texture)gl.deleteTexture(texture);release?.();lease.release();}
}
