<script setup lang="ts">
import {errorMessage} from '../i18n/errors.ts';
import {ref,watch,onBeforeUnmount} from 'vue';
import {residentFrame,residentCatalog,claimResidentCanvas} from '../browser/resident';
import {claimPublishedCanvas} from '../browser/published-animations.ts';
import {residentAnimation,animationStatus} from '../browser/animations';
import {framePlayer} from '../browser/frame-player';
import {frameAt} from '../catalog/atlas';
import {clock} from '../catalog/clock';
import {openInventoryVisual} from '../catalog/inventory-visual.ts';
const props=withDefaults(defineProps<{id:string;sprite:number;size:number;label:string;animate?:boolean;prepared?:HTMLCanvasElement|null}>(),{animate:true});
const canvas=ref<HTMLCanvasElement|null>(null),error=ref(''),ready=ref(false),visible=ref(false),animated=ref(false);
let releasePixels:()=>void=()=>{},pixelBytes=0,pixelCatalog='';
function resize(target:HTMLCanvasElement,width:number,height:number){
 const bytes=width*height*4,id=residentCatalog.value;
 if(bytes!==pixelBytes||id!==pixelCatalog){releasePixels();releasePixels=()=>{};pixelBytes=0;pixelCatalog='';
  releasePixels=claimPublishedCanvas(id,bytes)??claimResidentCanvas(bytes);pixelBytes=bytes;pixelCatalog=id;}
 target.width=width;target.height=height;
}
onBeforeUnmount(()=>releasePixels());
watch(canvas,(target,_old,cleanup)=>{
 visible.value=false;if(!target)return;
 const observer=new IntersectionObserver(entries=>{visible.value=!!entries[0]?.isIntersecting;});
 observer.observe(target);cleanup(()=>observer.disconnect());
},{flush:'post'});
watch([()=>props.id,()=>props.sprite,()=>props.prepared,residentCatalog,canvas],async(_value,_old,cleanup)=>{
 const controller=new AbortController();cleanup(()=>controller.abort());error.value='';ready.value=false;
 const target=canvas.value;if(!target)return;
 // A prepared page paints synchronously in Vue's post-flush, before the browser can expose an empty new grid.
 if(props.prepared){
  try{resize(target,props.prepared.width,props.prepared.height);
  const context=target.getContext('2d');
  if(context){context.imageSmoothingEnabled=false;context.drawImage(props.prepared,0,0);ready.value=true;}
  else error.value=errorMessage('无法创建图标画布');
  }catch(cause){error.value=errorMessage(cause);}
  return;
 }
 target.width=0;target.height=0;
 try{
  const lease=await residentFrame(props.sprite,controller.signal);
  try{
   if(controller.signal.aborted)return;
   const {x,y,width,height}=lease.frame;resize(target,width,height);
   const context=target.getContext('2d');if(!context)throw Error('无法创建图标画布');
   context.imageSmoothingEnabled=false;context.drawImage(lease.image,x,y,width,height,0,0,width,height);
   ready.value=true;
  }finally{lease.release();}
 }catch(cause){if(!controller.signal.aborted)error.value=errorMessage(cause);}
},{flush:'post'});
watch([ready,visible,()=>props.animate,()=>props.id,()=>props.prepared,residentCatalog],async(_value,_old,cleanup)=>{
 const controller=new AbortController();let stop:()=>void=()=>{},close:()=>void=()=>{};
 cleanup(()=>{controller.abort();stop();close();});animated.value=false;
 if(!ready.value||!visible.value||!props.animate)return;
 const target=canvas.value;if(!target)return;
 try{
  const animation=await residentAnimation(props.id,residentCatalog.value,controller.signal);
  controller.signal.throwIfAborted();if(!animation){if(animationStatus.value)error.value=animationStatus.value;return;}
  if(animation.kind==='program'){
   const player=await openInventoryVisual(residentCatalog.value,animation.texture,target,controller.signal);
   if(controller.signal.aborted){player.close();return;}
   close=()=>player.close();
   const draw=(time:number)=>{try{player.draw(time);animated.value=true;}catch(cause){error.value=errorMessage(cause);animated.value=false;stop();player.close();}};
   draw(0);if(!error.value)stop=clock.subscribe(draw);return;
  }
  const context=target.getContext('2d');if(!context)return;
  const player=framePlayer(time=>frameAt(animation.texture,time),animation.acquire,(first,next,blend)=>{
   if(target.width!==first.image.width||target.height!==first.image.height)resize(target,first.image.width,first.image.height);
   context.clearRect(0,0,target.width,target.height);context.imageSmoothingEnabled=false;context.save();
   try{
    context.globalCompositeOperation='source-over';context.globalAlpha=1-blend;context.drawImage(first.image,0,0);
    if(next){context.globalCompositeOperation='lighter';context.globalAlpha=blend;context.drawImage(next.image,0,0);}
   }finally{context.restore();}
   animated.value=true;
  },cause=>{error.value=errorMessage(cause);animated.value=false;stop();});
  close=()=>player.close();stop=clock.subscribe(time=>player.tick(time));
 }catch(cause){if(!controller.signal.aborted)error.value=errorMessage(cause);}
},{flush:'post'});
</script>
<template><canvas ref="canvas" :aria-label="label" :title="error||label" :data-animated="animated" :data-icon-error="error||undefined" role="img" :style="{width:size+'px',height:size+'px',imageRendering:'pixelated'}" /></template>
