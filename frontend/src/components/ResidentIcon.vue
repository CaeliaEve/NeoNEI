<script setup lang="ts">
import {ref,watch} from 'vue';
import {residentFrame} from '../browser/resident';
const props=defineProps<{sprite:number;size:number;label:string}>();
const canvas=ref<HTMLCanvasElement|null>(null),error=ref('');
watch([()=>props.sprite,canvas],async(_value,_old,cleanup)=>{
 const controller=new AbortController();cleanup(()=>controller.abort());error.value='';
 const target=canvas.value;if(!target)return;
 target.width=0;target.height=0;
 try{
  const lease=await residentFrame(props.sprite,controller.signal);
  try{
   if(controller.signal.aborted)return;
   const {x,y,width,height}=lease.frame;target.width=width;target.height=height;
   const context=target.getContext('2d');if(!context)throw Error('无法创建图标画布');
   context.imageSmoothingEnabled=false;context.drawImage(lease.image,x,y,width,height,0,0,width,height);
  }finally{lease.release();}
 }catch(cause){if(!controller.signal.aborted)error.value=String(cause);}
},{flush:'post'});
</script>
<template><canvas ref="canvas" :aria-label="label" :title="error||label" role="img" :style="{width:size+'px',height:size+'px',imageRendering:'pixelated'}" /></template>
