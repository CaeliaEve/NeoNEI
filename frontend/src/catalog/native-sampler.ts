import type {Visual,Texture} from '@elysium/contracts';
import type {Atlas} from './atlas.ts';
import {nativeFloat} from './native-visual-math.ts';

type Sampler=Extract<Visual['data'],{kind:'nativeSampler'}>;
export interface NativeSamplerSource {
  atlas:Atlas;
  texture(id:string,signal:AbortSignal):Promise<Texture>;
}
export interface NativeSamplerPlayer {
  readonly rect:Float32Array;
  readonly bias:number;
  bind(unit:number,milliseconds:number):void;
  close():void;
}

/** Actual texture upload ticks; no interpolation is invented in the browser. */
export function samplerFrame(data:Pick<Sampler,'timeline'|'phase'|'anchor'>,milliseconds:number):number{
  if(!Number.isFinite(milliseconds)||milliseconds<0||!Number.isSafeInteger(Math.floor(milliseconds/50))
    ||!data.timeline.length||data.timeline.length>4096)throw Error('Invalid native texture clock');
  let cycle=0;
  for(const step of data.timeline){
    if(!Number.isSafeInteger(step.frame)||step.frame<0||!Number.isSafeInteger(step.ticks)||step.ticks<1||step.ticks>72000)
      throw Error('Invalid native texture timeline');
    cycle+=step.ticks;
  }
  if(cycle>72000||!Number.isSafeInteger(data.phase)||data.phase<0||data.phase>=cycle)throw Error('Invalid native texture phase');
  const tick=Math.floor(milliseconds/50);
  if(data.anchor){
    if(!Number.isSafeInteger(data.anchor.frame)||data.anchor.frame<0||!Number.isSafeInteger(data.anchor.ticks)||data.anchor.ticks<1||data.anchor.ticks>cycle)
      throw Error('Invalid native texture upload anchor');
    if(tick<data.anchor.ticks)return data.anchor.frame;
  }
  let phase=(tick%cycle+data.phase)%cycle;
  for(const step of data.timeline){if(phase<step.ticks)return step.frame;phase-=step.ticks;}
  throw Error('Native texture timeline is incomplete');
}
export function samplerLayout(size:readonly number[],frames:number,columns:number,levels:number){
  if(size.length!==2||!size.every(v=>Number.isSafeInteger(v)&&v>0&&v<=4096)||!Number.isSafeInteger(frames)||frames<1||frames>4097
    ||!Number.isSafeInteger(columns)||columns<1||columns>frames||!Number.isSafeInteger(levels)||levels<1||levels>13)
    throw Error('Invalid native sampler dimensions');
  const rows=Math.ceil(frames/columns);let pixels=0;
  return Array.from({length:levels},(_,level)=>{
    const width=Math.max(1,size[0]!>>level),height=Math.max(1,size[1]!>>level),sheetWidth=width*columns,sheetHeight=height*rows;
    pixels+=sheetWidth*sheetHeight;
    if(sheetWidth>4096||sheetHeight>4096||pixels>16*1024*1024)throw Error('Native sampler exceeds mip pixel budget');
    return {width,height,sheetWidth,sheetHeight};
  });
}

interface SharedSampler {
  refs:number;
  bind(unit:number,milliseconds:number):void;
  dispose():void;
}
const caches=new WeakMap<WebGL2RenderingContext,Map<string,SharedSampler>>();

/** Frame sheets stay on the GPU. Copying a native frame into each mip keeps
 * hidden RGB/straight alpha intact; canvas getImageData, generated mipmaps and
 * browser alpha compositing never participate in native texture sampling. */
export async function openNativeSampler(catalog:string,row:Visual,source:NativeSamplerSource,gl:WebGL2RenderingContext,signal:AbortSignal):Promise<NativeSamplerPlayer>{
  if(row.data.kind!=='nativeSampler')throw Error('Native texture sampler is missing');
  const data=row.data,key=catalog+':'+row.id,layout=samplerLayout(data.size,data.frames,data.columns,data.levels.length);
  samplerFrame(data,0);
  if(data.timeline.some(step=>step.frame>=data.frames)||data.anchor&&data.anchor.frame>=data.frames)throw Error('Native texture frame is missing');
  if(!data.atlas.every((v,i)=>Number.isSafeInteger(v)&&v>0&&v<=65536&&Number.isSafeInteger(data.origin[i])&&data.origin[i]!>=0
    &&data.origin[i]!+data.size[i]!<=v))throw Error('Invalid native texture region');
  const sparse=data.origin.some(v=>v!==0)||data.size.some((v,i)=>v!==data.atlas[i]);
  const f=data.filter;
  if(![9728,9729,9984,9985,9986,9987].includes(f.min)||![9728,9729].includes(f.mag)||![10497,33071].includes(f.s)||![10497,33071].includes(f.t)
    ||sparse&&(f.mag!==9728||![9728,9984,9986].includes(f.min)))throw Error('Unreviewed native texture filter');
  const bias=nativeFloat(data.lod.bias),min=nativeFloat(data.lod.min),max=nativeFloat(data.lod.max);
  if(min>max||Math.abs(bias)>16||Math.abs(min)>1000||Math.abs(max)>1000)throw Error('Invalid native texture LOD');
  const rect=new Float32Array([data.origin[0]/data.atlas[0],data.origin[1]/data.atlas[1],data.atlas[0]/data.size[0],data.atlas[1]/data.size[1]]);
  let cache=caches.get(gl);if(!cache){cache=new Map();caches.set(gl,cache);}
  const held=cache,keyed=()=>{
    const shared=held.get(key);if(!shared)return null;shared.refs++;let closed=false;
    return {rect,bias,bind(unit:number,milliseconds:number){if(!closed)shared.bind(unit,milliseconds);},close(){
      if(closed)return;closed=true;if(--shared.refs===0){held.delete(key);shared.dispose();}
    }};
  };
  signal.throwIfAborted();const cached=keyed();if(cached)return cached;
  const bytes=layout.reduce((n,v)=>n+(v.sheetWidth*v.sheetHeight+v.width*v.height)*4,0)+256;
  const unclaim=source.atlas.claimVisualBytes(bytes),sheets:WebGLTexture[]=[];
  let texture:WebGLTexture|null=null,framebuffer:WebGLFramebuffer|null=null,disposed=false,installed=false;
  const dispose=()=>{if(disposed)return;disposed=true;for(const sheet of sheets)gl.deleteTexture(sheet);if(texture)gl.deleteTexture(texture);if(framebuffer)gl.deleteFramebuffer(framebuffer);unclaim();};
  try{
    for(let level=0;level<layout.length;level++){
      const id=data.levels[level]!,descriptor=await source.texture(id,signal);signal.throwIfAborted();
      if(descriptor.id!==id||descriptor.visual||descriptor.frames.length!==1||descriptor.interpolate)throw Error('Native mip frame sheet is missing');
      const lease=await source.atlas.acquireFrame(descriptor.frames[0]!,signal);
      try{
        signal.throwIfAborted();const size=layout[level]!;
        if(lease.image.width!==size.sheetWidth||lease.image.height!==size.sheetHeight)throw Error('Native mip frame sheet dimensions changed');
        const sheet=gl.createTexture();if(!sheet)throw Error('Cannot allocate native mip sheet');sheets.push(sheet);
        gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,sheet);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL,gl.NONE);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAX_LEVEL,0);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,gl.RGBA,gl.UNSIGNED_BYTE,lease.image);
      }finally{lease.release();}
    }
    signal.throwIfAborted();const raced=keyed();if(raced){dispose();return raced;}
    texture=gl.createTexture();framebuffer=gl.createFramebuffer();
    if(!texture||!framebuffer)throw Error('Cannot allocate native sampled texture');
    const native=texture,readback=framebuffer;gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,native);
    layout.forEach((size,level)=>gl.texImage2D(gl.TEXTURE_2D,level,gl.RGBA8,size.width,size.height,0,gl.RGBA,gl.UNSIGNED_BYTE,null));
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_BASE_LEVEL,0);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAX_LEVEL,layout.length-1);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,f.min);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,f.mag);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,sparse?gl.CLAMP_TO_EDGE:f.s);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,sparse?gl.CLAMP_TO_EDGE:f.t);
    gl.texParameterf(gl.TEXTURE_2D,gl.TEXTURE_MIN_LOD,min);gl.texParameterf(gl.TEXTURE_2D,gl.TEXTURE_MAX_LOD,max);
    let last=-1;
    const shared:SharedSampler={refs:0,dispose,bind(unit,milliseconds){
      if(gl.isContextLost())throw Error('Native mip texture context was lost');
      const frame=samplerFrame(data,milliseconds);gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,native);
      if(frame!==last){
        const previous=gl.getParameter(gl.READ_FRAMEBUFFER_BINDING) as WebGLFramebuffer|null;
        try{
          gl.bindFramebuffer(gl.READ_FRAMEBUFFER,readback);gl.readBuffer(gl.COLOR_ATTACHMENT0);
          layout.forEach((size,level)=>{
            gl.framebufferTexture2D(gl.READ_FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,sheets[level]!,0);
            if(gl.checkFramebufferStatus(gl.READ_FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Native mip copy surface is incomplete');
            gl.copyTexSubImage2D(gl.TEXTURE_2D,level,0,0,frame%data.columns*size.width,Math.floor(frame/data.columns)*size.height,size.width,size.height);
          });
          const error=gl.getError();if(error!==gl.NO_ERROR)throw Error('Native mip texture upload failed: '+error);
          last=frame;
        }finally{gl.bindFramebuffer(gl.READ_FRAMEBUFFER,previous);}
      }
    }};
    const error=gl.getError();if(error!==gl.NO_ERROR)throw Error('Native mip texture allocation failed: '+error);
    held.set(key,shared);installed=true;return keyed()!;
  }finally{if(!installed)dispose();}
}
