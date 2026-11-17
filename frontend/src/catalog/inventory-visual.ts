import type {Visual,InventoryState,InventoryPart,Texture} from '@elysium/contracts';
import type {Atlas} from './atlas.ts';
import {RandomStreams} from './native-random.ts';
import {openNativeSampler} from './native-sampler.ts';
import {openCosmicPlayer} from './cosmic-inventory-player.ts';
import {openInventoryLightmap} from './inventory-lightmap.ts';
import {forestrySwing,forestryWing} from './forestry-visual-math.ts';
import {nativeFloat,nativeVector,keyAngle,identity,multiply,translation,scaling,rotationZ,rotationY,rotationX,normalMatrix,type Matrix} from './native-visual-math.ts';

export interface InventoryVisualSource {
  atlas:Atlas;signal:AbortSignal;
  visual(id:string,signal:AbortSignal):Promise<Visual>;
  texture(id:string,signal:AbortSignal):Promise<Texture>;
}
export interface InventoryPlayer {draw(milliseconds:number):void;close():void}
const sources=new Map<string,Set<InventoryVisualSource>>();
const randoms=new Map<string,RandomStreams>();
export function bindInventoryVisuals(catalog:string,source:InventoryVisualSource):()=>void{
  const active=sources.get(catalog)??new Set();active.add(source);sources.set(catalog,active);let closed=false;
  return ()=>{if(closed)return;closed=true;active.delete(source);if(!active.size){sources.delete(catalog);randoms.get(catalog)?.close();randoms.delete(catalog);}trim();};
}
export function inventoryRandom(catalog:string,resource:Visual){
  if(resource.data.kind!=='javaRandom')throw Error('Native random resource is missing');
  const source=sourceFor(catalog);let streams=randoms.get(catalog);
  if(!streams){streams=new RandomStreams();randoms.set(catalog,streams);}
  return streams.get(resource.id,resource.data.stream,resource.data,bytes=>source.atlas.claimVisualBytes(bytes));
}
function sourceFor(catalog:string):InventoryVisualSource{
  const source=[...(sources.get(catalog)??[])].findLast(source=>!source.signal.aborted);
  if(!source)throw Error('Native inventory catalog is not open');return source;
}

const vertex=`#version 300 es
precision highp float;
layout(location=0) in vec3 at;layout(location=1) in vec3 normal;layout(location=2) in vec2 uv;layout(location=3) in vec4 vertexColor;
uniform mat4 modelView,projection;uniform mat3 normals;uniform float normalScale;
uniform bool lighting,normalizeNormal,vertexColors,colorMaterial;uniform vec4 color,ambient,materialAmbient,materialDiffuse,emission;
uniform int lightCount;uniform vec3 lightDirection[8];uniform vec4 lightAmbient[8],lightDiffuse[8];
out vec2 tex;out vec4 primary;
void main(){
  gl_Position=projection*modelView*vec4(at,1.0);tex=uv;primary=vertexColors?vertexColor:color;
  if(lighting){
    vec3 n=(normals*normal)*normalScale;if(normalizeNormal)n=normalize(n);
    vec4 ma=vertexColors&&colorMaterial?vertexColor:materialAmbient,md=vertexColors&&colorMaterial?vertexColor:materialDiffuse;
    vec3 c=emission.rgb+ambient.rgb*ma.rgb;
    for(int i=0;i<8;i++){if(i>=lightCount)break;
      c+=lightAmbient[i].rgb*ma.rgb+max(dot(n,normalize(lightDirection[i])),0.0)*lightDiffuse[i].rgb*md.rgb;
    }
    primary=vec4(clamp(c,0.0,1.0),md.a);
  }
}`;
const fragment=`#version 300 es
precision highp float;
uniform sampler2D image;uniform vec4 nativeRect;uniform float textureLodBias;uniform bool alphaTest;uniform int alphaFunc;uniform float alphaRef;
uniform bool lightmapOn;uniform sampler2D lightmapImage;uniform mat4 lightmapMatrix;uniform vec4 lightmapCoordinate,lightmapBorder;uniform bvec2 lightmapClamp;
in vec2 tex;in vec4 primary;out vec4 pixel;
void main(){
  vec4 c=texture(image,(tex-nativeRect.xy)*nativeRect.zw,textureLodBias)*primary;
  if(lightmapOn){
    vec4 p=lightmapMatrix*lightmapCoordinate;vec2 uv=clamp(p.xy/p.w,0.0,1.0);
    vec2 coverage=clamp(uv*16.0+0.5,0.0,1.0)*clamp((1.0-uv)*16.0+0.5,0.0,1.0);
    float weight=(lightmapClamp.x?coverage.x:1.0)*(lightmapClamp.y?coverage.y:1.0);
    c*=mix(lightmapBorder,texture(lightmapImage,uv),weight);
  }
  if(alphaTest){bool keep=false;
    if(alphaFunc==513)keep=c.a<alphaRef;else if(alphaFunc==514)keep=c.a==alphaRef;
    else if(alphaFunc==515)keep=c.a<=alphaRef;else if(alphaFunc==516)keep=c.a>alphaRef;
    else if(alphaFunc==517)keep=c.a!=alphaRef;else if(alphaFunc==518)keep=c.a>=alphaRef;
    else if(alphaFunc==519)keep=true;
    if(!keep)discard;
  }pixel=c;
}`;
interface Gpu {canvas:OffscreenCanvas;gl:WebGL2RenderingContext;program:WebGLProgram;uniforms:Map<string,WebGLUniformLocation|null>;release:()=>void;players:number;lastDraw:string}
let gpu:Gpu|null=null;
function device(atlas:Atlas):Gpu{
  if(gpu)return gpu;
  const release=atlas.claimVisualBytes(64*64*16),canvas=new OffscreenCanvas(64,64);
  const gl=canvas.getContext('webgl2',{alpha:true,antialias:false,depth:true,premultipliedAlpha:false,preserveDrawingBuffer:true});
  if(!gl){release();throw Error('Native inventory programs require WebGL 2');}
  const shaders:WebGLShader[]=[];let program:WebGLProgram|null=null;
  try{
    for(const [kind,source] of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]] as const){
      const shader=gl.createShader(kind);if(!shader)throw Error('Cannot allocate native inventory shader');shaders.push(shader);
      gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader)??'Native inventory shader failed');
    }
    program=gl.createProgram();if(!program)throw Error('Cannot allocate native inventory program');
    for(const shader of shaders)gl.attachShader(program,shader);gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program)??'Native inventory link failed');
    gpu={canvas,gl,program,uniforms:new Map(),release,players:0,lastDraw:''};return gpu;
  }catch(error){if(program)gl.deleteProgram(program);release();gl.getExtension('WEBGL_lose_context')?.loseContext();throw error;}
  finally{for(const shader of shaders)gl.deleteShader(shader);}
}
function trim():void{
  if(gpu&&(!sources.size||gpu.gl.isContextLost())&&gpu.players===0){gpu.gl.deleteProgram(gpu.program);gpu.gl.getExtension('WEBGL_lose_context')?.loseContext();gpu.release();gpu=null;}
}
interface Shared<T>{data:T;refs:number;release:()=>void}
interface MeshPart {buffer:WebGLBuffer;count:number;pose:Matrix;native:InventoryPart}
const lookups=new Map<string,Shared<Float32Array>>(),models=new Map<string,Shared<MeshPart[]>>();
function retain<T>(map:Map<string,Shared<T>>,key:string,entry:Shared<T>):{data:T;close:()=>void}{
  entry.refs++;let closed=false;return {data:entry.data,close:()=>{if(closed)return;closed=true;if(--entry.refs===0){map.delete(key);entry.release();}}};
}
function trig(key:string,bits:string,atlas:Atlas){
  let entry=lookups.get(key);
  if(!entry){
    if(bits.length!==65536*8)throw Error('Invalid native sine lookup');
    const release=atlas.claimVisualBytes(65536*4);
    try{const data=new Float32Array(65536);for(let i=0;i<data.length;i++){data[i]=nativeFloat(bits.slice(i*8,i*8+8));if(Math.abs(data[i]!)>1)throw Error('Invalid native sine value');}
      entry={data,refs:0,release};lookups.set(key,entry);
    }catch(error){release();throw error;}
  }return retain(lookups,key,entry);
}
function pose(part:InventoryPart,wing?:number):Matrix{
  const o=nativeVector(part.offset),p=nativeVector(part.pivot),r=nativeVector(part.rotation),f=Math.fround;
  let matrix=multiply(translation(o[0]!,o[1]!,o[2]!),translation(p[0]!,p[1]!,p[2]!));
  // ModelRenderer converts native radians to degrees as float before glRotatef.
  matrix=multiply(matrix,rotationZ(f((wing??r[0]!)*f(57.295776))));matrix=multiply(matrix,rotationY(f(r[1]!*f(57.295776))));
  return multiply(matrix,rotationX(f(r[2]!*f(57.295776))));
}
function mesh(key:string,parts:InventoryPart[],atlas:Atlas,gl:WebGL2RenderingContext){
  let entry=models.get(key);
  if(!entry){
    if(!parts.length||parts.length>128||parts.reduce((n,p)=>n+p.vertices.length,0)>24576)throw Error('Native inventory model exceeds budget');
    const bytes=parts.reduce((n,p)=>n+p.vertices.length*8*4,0),release=atlas.claimVisualBytes(bytes);
    const data:MeshPart[]=[];
    try{
      for(const part of parts){
        if(!part.vertices.length||part.vertices.length%6)throw Error('Native model lost quad ordering');
        const pixels=new Float32Array(part.vertices.length*8);for(let i=0;i<part.vertices.length;i++)pixels.set(nativeVector(part.vertices[i]!),i*8);
        const buffer=gl.createBuffer();if(!buffer)throw Error('Cannot allocate native inventory geometry');
        data.push({buffer,count:part.vertices.length,pose:pose(part),native:part});gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,pixels,gl.STATIC_DRAW);
      }
      entry={data,refs:0,release:()=>{for(const part of data)gl.deleteBuffer(part.buffer);release();}};models.set(key,entry);
    }catch(error){for(const part of data)gl.deleteBuffer(part.buffer);release();throw error;}
  }return retain(models,key,entry);
}
function uniform(g:Gpu,name:string){if(!g.uniforms.has(name))g.uniforms.set(name,g.gl.getUniformLocation(g.program,name));return g.uniforms.get(name)!;}
function vector(g:Gpu,name:string,values:readonly string[]){g.gl.uniform4fv(uniform(g,name),nativeVector(values));}
function renderState(g:Gpu,state:InventoryState,clear=true):void{
  const gl=g.gl;gl.useProgram(g.program);gl.viewport(0,0,64,64);gl.disable(gl.SCISSOR_TEST);gl.colorMask(true,true,true,true);
  if(clear){gl.depthMask(true);gl.clearColor(0,0,0,0);gl.clearDepth(1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);}
  const enable=(cap:number,on:boolean)=>on?gl.enable(cap):gl.disable(cap);
  enable(gl.DEPTH_TEST,state.depth);gl.depthMask(state.depthWrite);gl.depthFunc(state.depthFunc);
  enable(gl.BLEND,state.blend);gl.blendEquation(gl.FUNC_ADD);gl.blendFuncSeparate(state.blendSrcRgb,state.blendDstRgb,state.blendSrcAlpha,state.blendDstAlpha);
  enable(gl.CULL_FACE,state.cull);gl.cullFace(state.cullFace);gl.frontFace(state.frontFace);
  gl.uniform1i(uniform(g,'lighting'),state.lighting?1:0);gl.uniform1i(uniform(g,'normalizeNormal'),state.normalize?1:0);
  gl.uniform1i(uniform(g,'vertexColors'),0);gl.uniform1i(uniform(g,'colorMaterial'),state.colorMaterial?1:0);
  gl.uniform1i(uniform(g,'lightmapOn'),0);gl.uniform1i(uniform(g,'lightmapImage'),1);
  gl.uniform4f(uniform(g,'nativeRect'),0,0,1,1);
  for(const name of ['color','ambient','materialAmbient','materialDiffuse','emission'] as const)vector(g,name,state[name]);
  if(state.lights.length>8)throw Error('Native inventory light budget exceeded');
  const directions=new Float32Array(24),ambient=new Float32Array(32),diffuse=new Float32Array(32);
  state.lights.forEach((light,i)=>{const position=nativeVector(light.position);if(state.lighting&&position[3]!==0)throw Error('Unreviewed native point light');
    directions.set(position.subarray(0,3),i*3);ambient.set(nativeVector(light.ambient),i*4);diffuse.set(nativeVector(light.diffuse),i*4);});
  gl.uniform1i(uniform(g,'lightCount'),state.lights.length);gl.uniform3fv(uniform(g,'lightDirection[0]'),directions);
  gl.uniform4fv(uniform(g,'lightAmbient[0]'),ambient);gl.uniform4fv(uniform(g,'lightDiffuse[0]'),diffuse);
  gl.uniform1i(uniform(g,'alphaTest'),state.alphaTest?1:0);gl.uniform1i(uniform(g,'alphaFunc'),state.alphaFunc);gl.uniform1f(uniform(g,'alphaRef'),nativeFloat(state.alphaRef));
  gl.uniformMatrix4fv(uniform(g,'projection'),false,nativeVector(state.projection));gl.uniform1i(uniform(g,'image'),0);
}
function drawPart(g:Gpu,part:MeshPart,modelView:Matrix,state:InventoryState):void{
  const gl=g.gl,normals=normalMatrix(modelView);
  gl.uniformMatrix4fv(uniform(g,'modelView'),false,modelView);gl.uniformMatrix3fv(uniform(g,'normals'),false,normals);
  gl.uniform1f(uniform(g,'normalScale'),state.rescaleNormal&&!state.normalize?1/Math.hypot(normals[6]!,normals[7]!,normals[8]!):1);
  gl.bindBuffer(gl.ARRAY_BUFFER,part.buffer);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,32,0);
  gl.enableVertexAttribArray(1);gl.vertexAttribPointer(1,3,gl.FLOAT,false,32,12);gl.enableVertexAttribArray(2);gl.vertexAttribPointer(2,2,gl.FLOAT,false,32,24);
  gl.drawArrays(gl.TRIANGLES,0,part.count);
}
async function openForestry(catalog:string,root:Visual,source:InventoryVisualSource,g:Gpu,target:HTMLCanvasElement,signal:AbortSignal,own:(close:()=>void)=>void){
  if(root.data.kind!=='forestryInventory'||root.data.version!=='4.10.17')throw Error('Unreviewed native Forestry inventory program');
  const data=root.data,lookup=await source.visual(data.trig,signal);signal.throwIfAborted();
  if(lookup.id!==data.trig||lookup.data.kind!=='mathHelper')throw Error('Native Forestry lookup is missing');
  const sine=trig(catalog+':'+lookup.id,lookup.data.bits,source.atlas);own(sine.close);
  if(data.profile!=='bee'&&data.profile!=='butterfly'||!data.draws.length||data.draws.length>11)throw Error('Invalid Forestry native model census');
  const rows=await Promise.all(data.draws.map(id=>source.visual(id,signal)));signal.throwIfAborted();
  const draws=[];
  for(let i=0;i<rows.length;i++){
    const row=rows[i]!;if(row.id!==data.draws[i]||row.data.kind!=='forestryPart')throw Error('Native Forestry model layer is missing');
    const draw=row.data,[model,paint,lighting]=await Promise.all([source.visual(draw.mesh,signal),source.visual(draw.sampler,signal),draw.lightmap?source.visual(draw.lightmap,signal):null]);
    signal.throwIfAborted();if(model.id!==draw.mesh||model.data.kind!=='mesh'||model.data.parts.length!==1||paint.id!==draw.sampler
      ||draw.lightmap&&lighting?.id!==draw.lightmap)throw Error('Native Forestry layer closure changed');
    const sampler=paint.data;
    if(sampler.kind!=='nativeSampler'||sampler.frames!==1||sampler.origin.some(v=>v!==0)||sampler.size.some((v,j)=>v!==sampler.atlas[j]))
      throw Error('Native Forestry model sampler is not its standalone texture');
    const geometry=mesh(catalog+':'+model.id,model.data.parts,source.atlas,g.gl);own(geometry.close);
    const pixels=await openNativeSampler(catalog,paint,source,g.gl,signal);own(pixels.close);
    const lightmap=lighting?await openInventoryLightmap(catalog,lighting,source,g.gl,signal):null;if(lightmap)own(lightmap.close);
    draws.push({data:draw,part:geometry.data[0]!,pixels,lightmap,basis:nativeVector(draw.state.modelView)});
  }
  const context=target.getContext('2d');if(!context)throw Error('Cannot create native Forestry surface');target.width=64;target.height=64;
  return {draw(milliseconds:number){
    signal.throwIfAborted();if(g.gl.isContextLost())throw Error('Native Forestry graphics context was lost');
    const angle=forestryWing(forestrySwing(milliseconds,{...data.clock,profile:data.profile}),sine.data),token=root.id+':'+angle;
    if(g.lastDraw!==token){
      g.lastDraw='';const gl=g.gl;
      for(let i=0;i<draws.length;i++){
        const draw=draws[i]!;renderState(g,draw.data.state,i===0);gl.disableVertexAttribArray(3);gl.vertexAttrib4f(3,1,1,1,1);
        draw.pixels.bind(0,milliseconds);gl.uniform1f(uniform(g,'textureLodBias'),draw.pixels.bias);draw.lightmap?.bind(name=>uniform(g,name));
        const transform=draw.data.wing===0?draw.part.pose:pose(draw.part.native,draw.data.wing===1?angle:-angle);
        drawPart(g,draw.part,multiply(draw.basis,transform),draw.data.state);
      }
      const error=gl.getError();if(error!==gl.NO_ERROR)throw Error('Native Forestry draw failed: '+error);g.lastDraw=token;
    }
    context.clearRect(0,0,64,64);context.imageSmoothingEnabled=false;context.drawImage(g.canvas,0,0);
  }};
}
export async function openInventoryVisual(catalog:string,texture:Texture|string,target:HTMLCanvasElement,consumer:AbortSignal):Promise<InventoryPlayer>{
  const source=sourceFor(catalog),signal=AbortSignal.any([consumer,source.signal]),owned:Array<()=>void>=[];
  let active=false,closed=false,g:Gpu|undefined;
  const close=()=>{if(closed)return;closed=true;signal.removeEventListener('abort',close);for(const release of owned.reverse())release();if(active&&g){g.players--;trim();}};
  const own=(release:()=>void)=>{if(closed){release();throw new DOMException('Aborted','AbortError');}owned.push(release);};
  signal.addEventListener('abort',close,{once:true});
  try{
    signal.throwIfAborted();const descriptor=typeof texture==='string'?await source.texture(texture,signal):texture;
    if(typeof texture==='string'&&descriptor.id!==texture)throw Error('Native preview texture identity changed');
    if(!descriptor.visual)throw Error('Native inventory program is missing');
    const root=await source.visual(descriptor.visual,signal),program=root.data;
    if(root.id!==descriptor.visual)throw Error('Native inventory program identity changed');
    if(program.kind==='forestryInventory'){
      g=device(source.atlas);g.players++;active=true;const current=g,player=await openForestry(catalog,root,source,current,target,signal,own);
      signal.throwIfAborted();return {close,draw(milliseconds){if(!closed&&!signal.aborted)player.draw(milliseconds);}};
    }
    if(program.kind==='cosmicInventory'){
      g=device(source.atlas);g.players++;active=true;const current=g;
      const player=await openCosmicPlayer(catalog,root,source,{gl:current.gl,canvas:current.canvas,
        prepare:(state,clear)=>renderState(current,state,clear),uniform:name=>uniform(current,name)},target,signal,own,resource=>inventoryRandom(catalog,resource));
      signal.throwIfAborted();return {close,draw(milliseconds){if(closed||signal.aborted)return;current.lastDraw='';player.draw(milliseconds);}};
    }
    if(program.kind!=='galacticraftKey'||program.version!=='3.3.13-GTNH')throw Error('Unreviewed native inventory program');
    const [model,lookup,paint]=await Promise.all([source.visual(program.mesh,signal),source.visual(program.trig,signal),source.visual(program.sampler,signal)]);
    signal.throwIfAborted();if(model.id!==program.mesh||lookup.id!==program.trig||paint.id!==program.sampler
      ||model.data.kind!=='mesh'||model.data.parts.length!==5||lookup.data.kind!=='mathHelper')throw Error('Native inventory program closure is incomplete');
    g=device(source.atlas);g.players++;active=true;const current=g;
    const geometry=mesh(catalog+':'+model.id,model.data.parts,source.atlas,current.gl);own(geometry.close);
    const sine=trig(catalog+':'+lookup.id,lookup.data.bits,source.atlas);own(sine.close);
    const pixels=await openNativeSampler(catalog,paint,source,current.gl,signal);own(pixels.close);signal.throwIfAborted();
    const context=target.getContext('2d');if(!context)throw Error('Cannot create native inventory surface');
    const state=program.state,basis=nativeVector(state.modelView),resolution=BigInt(program.resolution);
    target.width=64;target.height=64;
    return {close,draw(milliseconds){
      if(closed||signal.aborted)return;if(current.gl.isContextLost())throw Error('Native inventory graphics context was lost');
      const angle=keyAngle(milliseconds,resolution,sine.data),token=root.id+':'+angle;
      if(current.lastDraw===token){context.clearRect(0,0,64,64);context.imageSmoothingEnabled=false;context.drawImage(current.canvas,0,0);return;}
      current.lastDraw='';const gl=current.gl;renderState(current,state);
      gl.disableVertexAttribArray(3);gl.vertexAttrib4f(3,1,1,1,1);
      pixels.bind(0,milliseconds);gl.uniform1f(uniform(current,'textureLodBias'),pixels.bias);
      let transform=multiply(basis,translation(8,8,0));transform=multiply(transform,rotationZ(angle));
      transform=multiply(transform,scaling(5,5,5));transform=multiply(transform,scaling(1.5,1.5,1.5));transform=multiply(transform,rotationZ(45));
      for(const part of geometry.data){
        drawPart(current,part,multiply(transform,part.pose),state);
      }
      const error=gl.getError();if(error!==gl.NO_ERROR)throw Error('Native inventory draw failed: '+error);
      current.lastDraw=token;
      context.clearRect(0,0,64,64);context.imageSmoothingEnabled=false;context.drawImage(current.canvas,0,0);
    }};
  }catch(error){close();throw error;}
}
