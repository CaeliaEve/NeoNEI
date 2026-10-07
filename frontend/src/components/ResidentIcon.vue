<script setup lang="ts">
import {ref,watch} from 'vue';
import {residentFrame,residentCatalog} from '../browser/resident';
import {residentAnimation,animationStatus} from '../browser/animations';
import {framePlayer} from '../browser/frame-player';
import {frameAt} from '../catalog/atlas';
import {clock} from '../catalog/clock';
const props=withDefaults(defineProps<{id:string;sprite:number;size:number;label:string;animate?:boolean}>(),{animate:true});
const canvas=ref<HTMLCanvasElement|null>(null),error=ref(''),ready=ref(false),visible=ref(false),animated=ref(false);
watch(canvas,(target,_old,cleanup)=>{
 visible.value=false;if(!target)return;
 const observer=new IntersectionObserver(entries=>{visible.value=!!entries[0]?.isIntersecting;});
 observer.observe(target);cleanup(()=>observer.disconnect());
},{flush:'post'});
watch([()=>props.id,()=>props.sprite,residentCatalog,canvas],async(_value,_old,cleanup)=>{
 const controller=new AbortController();cleanup(()=>controller.abort());error.value='';ready.value=false;
 const target=canvas.value;if(!target)return;
 target.width=0;target.height=0;
 try{
  const lease=await residentFrame(props.sprite,controller.signal);
  try{
   if(controller.signal.aborted)return;
   const {x,y,width,height}=lease.frame;target.width=width;target.height=height;
   const context=target.getContext('2d');if(!context)throw Error('无法创建图标画布');
   context.imageSmoothingEnabled=false;context.drawImage(lease.image,x,y,width,height,0,0,width,height);
   ready.value=true;
  }finally{lease.release();}
 }catch(cause){if(!controller.signal.aborted)error.value=String(cause);}
},{flush:'post'});
watch([ready,visible,()=>props.animate,()=>props.id,residentCatalog],async(_value,_old,cleanup)=>{
 const controller=new AbortController();let stop:()=>void=()=>{},close:()=>void=()=>{};
 cleanup(()=>{controller.abort();stop();close();});animated.value=false;
 if(!ready.value||!visible.value||!props.animate)return;
 const target=canvas.value;if(!target)return;
 try{
  const animation=await residentAnimation(props.id,residentCatalog.value,controller.signal);
  controller.signal.throwIfAborted();if(!animation){if(animationStatus.value)error.value=animationStatus.value;return;}
  const context=target.getContext('2d');if(!context)return;
  const player=framePlayer(time=>frameAt(animation.texture,time),animation.acquire,(first,next,blend)=>{
   if(target.width!==first.image.width||target.height!==first.image.height){target.width=first.image.width;target.height=first.image.height;}
   context.clearRect(0,0,target.width,target.height);context.imageSmoothingEnabled=false;context.save();
   try{
    context.globalCompositeOperation='source-over';context.globalAlpha=1-blend;context.drawImage(first.image,0,0);
    if(next){context.globalCompositeOperation='lighter';context.globalAlpha=blend;context.drawImage(next.image,0,0);}
   }finally{context.restore();}
   animated.value=true;
  },cause=>{error.value=String(cause);animated.value=false;stop();});
  close=()=>player.close();stop=clock.subscribe(time=>player.tick(time));
 }catch(cause){if(!controller.signal.aborted)error.value=String(cause);}
},{flush:'post'});
</script>
<template><canvas ref="canvas" :aria-label="label" :title="error||label" :data-animated="animated" :data-icon-error="error||undefined" role="img" :style="{width:size+'px',height:size+'px',imageRendering:'pixelated'}" /></template>
