import type {Visual,InventoryState} from '@elysium/contracts';
import type {InventoryVisualSource} from './inventory-visual.ts';
import type {JavaRandom} from './native-random.ts';
import {openNativeSampler,type NativeSamplerPlayer} from './native-sampler.ts';
import {nativeVector,nativeFloat,multiply,translation,scaling,normalMatrix,type Matrix} from './native-visual-math.ts';
import {cosmicVertex,cosmicFragment,cosmicProfiles,cosmicTime,eternalPulse} from './cosmic-shader.ts';

type Layer=Extract<Visual['data'],{kind:'inventoryFlat'|'inventoryCosmic'}>;
type Shader=Extract<Visual['data'],{kind:'cosmicShader'}>;
export interface SceneGraphics {
  gl:WebGL2RenderingContext;canvas:OffscreenCanvas;
  prepare(state:InventoryState,clear:boolean):void;
  uniform(name:string):WebGLUniformLocation|null;
}
interface Program {handle:WebGLProgram;uniform(name:string):WebGLUniformLocation|null;close():void}
const programs=new WeakMap<WebGL2RenderingContext,{program:Omit<Program,'close'>;refs:number;release:()=>void}>();
function program(g:SceneGraphics,source:InventoryVisualSource):Program{
  const gl=g.gl;let cached=programs.get(gl);
  if(!cached){
    const release=source.atlas.claimVisualBytes(16*1024),shaders:WebGLShader[]=[];let handle:WebGLProgram|null=null;
    try{
      for(const [kind,code] of [[gl.VERTEX_SHADER,cosmicVertex],[gl.FRAGMENT_SHADER,cosmicFragment]] as const){
        const shader=gl.createShader(kind);if(!shader)throw Error('Cannot allocate native cosmic shader');shaders.push(shader);
        gl.shaderSource(shader,code);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader)??'Native cosmic shader failed');
      }
      handle=gl.createProgram();if(!handle)throw Error('Cannot allocate native cosmic program');for(const shader of shaders)gl.attachShader(handle,shader);gl.linkProgram(handle);
      if(!gl.getProgramParameter(handle,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(handle)??'Native cosmic link failed');
      const linked=handle,uniforms=new Map<string,WebGLUniformLocation|null>();
      cached={refs:0,release:()=>{gl.deleteProgram(linked);release();},program:{handle:linked,uniform(name){if(!uniforms.has(name))uniforms.set(name,gl.getUniformLocation(linked,name));return uniforms.get(name)!;}}};
      programs.set(gl,cached);handle=null;
    }catch(error){if(handle)gl.deleteProgram(handle);release();throw error;}
    finally{for(const shader of shaders)gl.deleteShader(shader);}
  }
  cached.refs++;const held=cached;let closed=false;
  return {...held.program,close(){if(closed)return;closed=true;if(--held.refs===0){programs.delete(gl);held.release();}}};
}
interface Geometry {buffer:WebGLBuffer;count:number;data:Float32Array|null;close():void}
function geometry(row:Visual,source:InventoryVisualSource,gl:WebGL2RenderingContext):Geometry{
  const data=row.data;if(data.kind!=='inventoryFlat'&&data.kind!=='inventoryCosmic')throw Error('Native inventory layer is missing');
  if(!data.vertices.length||data.vertices.length%4||data.vertices.length>24576)throw Error('Native inventory lost its ordered quads');
  const pulse=data.kind==='inventoryFlat'&&!!data.random,count=data.vertices.length/4*6;
  const release=source.atlas.claimVisualBytes(count*12*4*(pulse?2:1)+128);let buffer:WebGLBuffer|null=null;
  try{
    const pixels=new Float32Array(count*12);let at=0;
    for(let q=0;q<data.vertices.length;q+=4)for(const i of [0,1,2,0,2,3]){const vertex=nativeVector(data.vertices[q+i]!);if(vertex.length!==12)throw Error('Invalid native vertex');pixels.set(vertex,at);at+=12;}
    buffer=gl.createBuffer();if(!buffer)throw Error('Cannot allocate native inventory draw');gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,pixels,pulse?gl.DYNAMIC_DRAW:gl.STATIC_DRAW);
    const held=buffer;let closed=false;return {buffer:held,count,data:pulse?pixels:null,close(){if(closed)return;closed=true;gl.deleteBuffer(held);release();}};
  }catch(error){if(buffer)gl.deleteBuffer(buffer);release();throw error;}
}
function attributes(gl:WebGL2RenderingContext,mesh:Geometry){
  gl.bindBuffer(gl.ARRAY_BUFFER,mesh.buffer);
  for(const [index,size,offset] of [[0,3,0],[1,3,12],[2,2,24],[3,4,32]]){
    gl.enableVertexAttribArray(index!);gl.vertexAttribPointer(index!,size!,gl.FLOAT,false,48,offset!);
  }
}
interface Loaded {data:Layer;mesh:Geometry;samplers:NativeSamplerPlayer[];random?:JavaRandom;shader?:Shader}
export async function openCosmicPlayer(catalog:string,root:Visual,source:InventoryVisualSource,g:SceneGraphics,target:HTMLCanvasElement,
  signal:AbortSignal,own:(close:()=>void)=>void,random:(resource:Visual)=>JavaRandom):Promise<{draw(milliseconds:number):void}>{
  if(root.data.kind!=='cosmicInventory')throw Error('Native cosmic inventory program is missing');
  const descriptor=root.data,versions:Record<string,string>={
    'fox.spiteful.avaritia.render.CosmicItemRenderer':'1.77','fox.spiteful.avaritia.render.CosmicBowRenderer':'1.77',
    'singulariteam.eternalsingularity.render.EternalItemRenderer':'1.2.3','gregtech.common.render.items.UniversiumRenderer':'5.09.51.482',
  };
  if(versions[descriptor.renderer]!==descriptor.version||!descriptor.draws.length||descriptor.draws.length>64)throw Error('Unreviewed native cosmic renderer');
  const gl=g.gl,loaded:Loaded[]=[];let cosmic:Program|undefined;
  const visual=async(id:string)=>{const row=await source.visual(id,signal);signal.throwIfAborted();if(row.id!==id)throw Error('Native visual dependency identity changed');return row;};
  for(const id of descriptor.draws){
    const row=await visual(id),data=row.data;if(data.kind!=='inventoryFlat'&&data.kind!=='inventoryCosmic')throw Error('Native scene contains a non-draw resource');
    const mesh=geometry(row,source,gl);own(mesh.close);const samplers:NativeSamplerPlayer[]=[];
    for(const id of data.kind==='inventoryFlat'?[data.sampler]:data.samplers){
      const sampler=await openNativeSampler(catalog,await visual(id),source,gl,signal);own(sampler.close);samplers.push(sampler);
    }
    const layer:Loaded={data,mesh,samplers};
    if(data.kind==='inventoryFlat'){
      if(!!data.random!==!!data.pulseBasis||samplers.length!==1)throw Error('Native pulse lost its stream or basis');
      if(data.random){
        if(descriptor.renderer!=='singulariteam.eternalsingularity.render.EternalItemRenderer'||data.vertices.length!==4)throw Error('Unreviewed native pulse');
        layer.random=random(await visual(data.random));
      }
    }else{
      const shader=(await visual(data.shader)).data;
      if(shader.kind!=='cosmicShader'||samplers.length!==11)throw Error('Native cosmic shader/symbols are missing');
      const profile=cosmicProfiles[shader.profile];
      if(!profile||shader.vertex!==profile.vertex||shader.fragment!==profile.fragment||shader.version!==profile.version
        ||(shader.profile==='eternal')!==(descriptor.renderer==='singulariteam.eternalsingularity.render.EternalItemRenderer'))throw Error('Unreviewed native cosmic shader profile');
      layer.shader=shader;if(!cosmic){cosmic=program(g,source);own(cosmic.close);}
    }
    loaded.push(layer);
  }
  signal.throwIfAborted();if(!cosmic)throw Error('Native cosmic shader was not observed');
  const context=target.getContext('2d');if(!context)throw Error('Cannot create native inventory surface');target.width=64;target.height=64;
  return {draw(milliseconds){
    signal.throwIfAborted();if(gl.isContextLost())throw Error('Native inventory graphics context was lost');
    for(let index=0;index<loaded.length;index++){
      const layer=loaded[index]!,data=layer.data,state=data.state;let model=nativeVector(state.modelView) as Matrix;
      if(data.kind==='inventoryFlat'&&layer.random){
        const pulse=eternalPulse(layer.random),basis=nativeVector(data.pulseBasis!) as Matrix;
        model=multiply(multiply(basis,translation(pulse.translate,pulse.translate,1)),scaling(pulse.scale,pulse.scale,1));
        const pixels=layer.mesh.data!;
        // The native quad itself expands by offset; its transform alone is insufficient.
        for(let i=0;i<pixels.length;i+=12){const right=i/12%6===2||i/12%6===4||i/12%6===5,bottom=i/12%6===1||i/12%6===2||i/12%6===4;
          pixels[i]=right?16+pulse.offset:-pulse.offset;pixels[i+1]=bottom?16+pulse.offset:-pulse.offset;}
        gl.bindBuffer(gl.ARRAY_BUFFER,layer.mesh.buffer);gl.bufferSubData(gl.ARRAY_BUFFER,0,pixels);
      }
      g.prepare(state,index===0);layer.samplers.forEach((sampler,unit)=>sampler.bind(unit,milliseconds));
      if(data.kind==='inventoryFlat'){
        gl.uniform1i(g.uniform('vertexColors'),1);gl.uniform4fv(g.uniform('nativeRect'),layer.samplers[0]!.rect);
        gl.uniform1f(g.uniform('textureLodBias'),layer.samplers[0]!.bias);
        matrices(gl,g.uniform,model,state);
      }else{
        const shader=cosmic!,values=data.uniforms,u=shader.uniform;gl.useProgram(shader.handle);
        gl.uniformMatrix4fv(u('modelView'),false,model);gl.uniformMatrix4fv(u('projection'),false,nativeVector(state.projection));
        gl.uniformMatrix3fv(u('normalTransform'),false,normalMatrix(model));
        for(const name of ['yaw','pitch','externalScale','lightmix','opacity','activeLights'] as const)gl.uniform1f(u(name),nativeFloat(values[name]));
        gl.uniform1f(u('time2'),cosmicTime(milliseconds));gl.uniform1i(u('redMask'),layer.shader!.profile==='eternal'?1:0);
        gl.uniform1i(u('alphaTest'),state.alphaTest?1:0);gl.uniform1i(u('alphaFunc'),state.alphaFunc);gl.uniform1f(u('alphaRef'),nativeFloat(state.alphaRef));
        gl.uniform3fv(u('lightlevel'),nativeVector(values.lightlevel));gl.uniformMatrix2fv(u('cosmicuvs[0]'),false,nativeVector(values.cosmicuvs));
        gl.uniform4fv(u('sceneColor'),nativeVector(values.sceneColor));gl.uniform4fv(u('materialAmbient'),nativeVector(state.materialAmbient));gl.uniform4fv(u('materialDiffuse'),nativeVector(state.materialDiffuse));
        values.lights.forEach((light,i)=>{
          for(const [name,field] of [['lightPosition','position'],['lightAmbient','ambient'],['lightDiffuse','diffuse']] as const)gl.uniform4fv(u(name+'['+i+']'),nativeVector(light[field]));
          gl.uniform3fv(u('attenuation['+i+']'),nativeVector(light.attenuation));gl.uniform3fv(u('spotDirection['+i+']'),nativeVector(light.spotDirection));
          gl.uniform1f(u('spotCutoff['+i+']'),nativeFloat(light.spotCutoff));gl.uniform1f(u('spotCosCutoff['+i+']'),nativeFloat(light.spotCosCutoff));gl.uniform1f(u('spotExponent['+i+']'),nativeFloat(light.spotExponent));
        });
        const rects=new Float32Array(44),bias=new Float32Array(11);
        layer.samplers.forEach((sampler,i)=>{gl.uniform1i(u('source'+i),i);rects.set(sampler.rect,i*4);bias[i]=sampler.bias;});
        gl.uniform4fv(u('sourceRect[0]'),rects);gl.uniform1fv(u('sourceLodBias[0]'),bias);
      }
      attributes(gl,layer.mesh);gl.drawArrays(gl.TRIANGLES,0,layer.mesh.count);
    }
    const error=gl.getError();if(error!==gl.NO_ERROR)throw Error('Native inventory scene draw failed: '+error);
    context.clearRect(0,0,64,64);context.imageSmoothingEnabled=false;context.drawImage(g.canvas,0,0);
  }};
}
function matrices(gl:WebGL2RenderingContext,u:SceneGraphics['uniform'],model:Matrix,state:InventoryState){
  const normals=normalMatrix(model);gl.uniformMatrix4fv(u('modelView'),false,model);gl.uniformMatrix3fv(u('normals'),false,normals);
  gl.uniform1f(u('normalScale'),state.rescaleNormal&&!state.normalize?1/Math.hypot(normals[6]!,normals[7]!,normals[8]!):1);
}
