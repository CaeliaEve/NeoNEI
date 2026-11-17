<script setup lang="ts">
import {errorMessage} from '../i18n/errors.ts';
import {t} from '../i18n/index.ts';
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { Texture } from '@elysium/contracts';
import { Atlas, frameAt, type Lease } from '../catalog/atlas.ts';
import { clock, type Playback } from '../catalog/clock.ts';
import {residentSourceFrame} from '../browser/resident';
import {recipeVisualFrame} from '../browser/recipe-visuals';
import {withFrameFallback} from '../browser/visual-mapping';
import {framePlayer} from '../browser/frame-player';
import {openInventoryVisual} from '../catalog/inventory-visual.ts';

const props = withDefaults(defineProps<{ atlas: Atlas; texture?: Texture | null; width?: number; height?: number; animate?: boolean; label?: string; playback?: Playback }>(),
  { width: 32, height: 32, animate: true, label: '' });
const canvas = ref<HTMLCanvasElement | null>(null), surface = ref<HTMLElement | null>(null);
const visible = ref(false), error = ref('');
let observer: IntersectionObserver | null = null;
onMounted(() => {
  // Newly mounted recipe slots must not wait for a throttled observer/paint cycle.
  const bounds=surface.value?.getBoundingClientRect();
  visible.value=!!bounds&&bounds.width>0&&bounds.height>0&&bounds.bottom>=-48&&bounds.right>=-48&&bounds.top<=innerHeight+48&&bounds.left<=innerWidth+48;
  observer = new IntersectionObserver(entries => { visible.value = entries[0]?.isIntersecting ?? false; }, { rootMargin: '48px' });
  if (surface.value) observer.observe(surface.value);
});
onBeforeUnmount(() => observer?.disconnect());

let updatePlayback = (): void => {};
watch(() => props.animate, () => updatePlayback());
watch([() => props.atlas, () => props.texture, () => props.width, () => props.height, () => props.playback, visible, canvas],
  async (_value, _old, cleanup) => {
    const controller = new AbortController();
    let leases: Lease[] = [], stop: (() => void) | undefined, close: (() => void) | undefined,releasePixels:()=>void=()=>{};
    cleanup(() => { controller.abort(); stop?.(); close?.(); releasePixels(); updatePlayback = () => {}; leases.forEach(lease => lease.release()); });
    error.value = '';
    const target = canvas.value, texture = props.texture;
    if(target){target.width=0;target.height=0;}
    if (!target || !texture || !visible.value) return;
    try {
      leases = [await withFrameFallback(recipeVisualFrame(texture.frames[0]!,props.atlas.catalogId,controller.signal),
        ()=>residentSourceFrame(texture.frames[0]!,props.atlas.catalogId,controller.signal)??props.atlas.acquireFrame(texture.frames[0]!, controller.signal),controller.signal)];
    } catch (failure) {
      if (!controller.signal.aborted) error.value = errorMessage(failure,'纹理加载失败');
      return;
    }
    if (controller.signal.aborted) { leases.forEach(lease => lease.release()); return; }
    if(texture.visual){
      try{
        const preview=leases[0]!,frame=preview.frame;
        releasePixels=props.atlas.claimVisualBytes(texture.frames[0]!.width*texture.frames[0]!.height*4);
        target.width=texture.frames[0]!.width;target.height=texture.frames[0]!.height;
        const context=target.getContext('2d');if(!context)throw Error(t('浏览器无法创建原生物品预览'));
        context.imageSmoothingEnabled=false;
        if(frame)context.drawImage(preview.image,frame.x,frame.y,frame.width,frame.height,0,0,target.width,target.height);
        else context.drawImage(preview.image,0,0,target.width,target.height);
        const player=await openInventoryVisual(props.atlas.catalogId,texture,target,controller.signal);
        if(controller.signal.aborted){player.close();return;}
        close=()=>player.close();
        const render=(time:number)=>{try{player.draw(time);}catch(failure){stop?.();player.close();error.value=errorMessage(failure);}};
        updatePlayback=()=>{
          stop?.();stop=undefined;if(error.value)return;
          if(props.playback)stop=props.playback.subscribe(render);
          else{render(0);if(props.animate&&!error.value)stop=clock.subscribe(render);}
        };
        updatePlayback();
        leases.forEach(lease=>lease.release());leases=[];
      }catch(failure){if(!controller.signal.aborted)error.value=errorMessage(failure);}
      return;
    }
    try {
      const density = Math.min(devicePixelRatio || 1, 3);
      const width=Math.max(texture.frames[0]!.width,1,Math.round(props.width*density)),height=Math.max(texture.frames[0]!.height,1,Math.round(props.height*density));
      releasePixels=props.atlas.claimVisualBytes(width*height*4);target.width=width;target.height=height;
      const context = target.getContext('2d');
      if (!context) throw new Error(t('浏览器无法创建纹理画布'));
      context.imageSmoothingEnabled = false;
      const draw = (first: Lease, next: Lease | undefined, blend: number): void => {
        context.clearRect(0, 0, target.width, target.height);
        context.save();
        const paint = (lease: Lease, opacity: number): void => {
          context.globalAlpha = opacity;
          const frame=lease.frame;
          if(frame)context.drawImage(lease.image,frame.x,frame.y,frame.width,frame.height,0,0,target.width,target.height);
          else context.drawImage(lease.image, 0, 0, target.width, target.height);
        };
        try {
          context.globalCompositeOperation = 'source-over';
          paint(first, 1 - blend);
          if (next && blend) { context.globalCompositeOperation = 'lighter'; paint(next, blend); }
        } finally { context.restore(); }
      };
      let elapsed = 0;
      const selected = (time: number) =>
        props.playback || props.animate ? frameAt(texture, time) : {index:0,next:0,blend:0};
      const player = framePlayer(selected, (index, signal) => {
        // Keep just the immediately painted first frame; later frames acquire
        // a short lease from the shared bounded atlas rather than pinning 720 frames.
        if (index === 0) return Promise.resolve({...leases[0]!, release: () => {}});
        const frame = texture.frames[index]!;
        return withFrameFallback(recipeVisualFrame(frame,props.atlas.catalogId,signal,10),
          () => props.atlas.acquireFrame(frame, signal,10),signal);
      }, draw, failure => {
        stop?.(); error.value = errorMessage(failure,'纹理绘制失败');
      });
      close = () => player.close();
      draw(leases[0]!, undefined, 0);
      const render = (time: number): void => {
        elapsed = time;
        try { player.tick(time); }
        catch (failure) { stop?.(); error.value = errorMessage(failure,'纹理绘制失败'); }
      };
      updatePlayback = () => {
        stop?.(); stop = undefined;
        if (props.playback) stop = props.playback.subscribe(render);
        else {
          render(elapsed);
          if (props.animate && texture.frames.length > 1) stop = clock.subscribe(render);
        }
      };
      updatePlayback();
    } catch (failure) { stop?.(); close?.(); error.value = errorMessage(failure,'纹理绘制失败'); }
  }, { flush: 'post', immediate: true });
</script>

<template>
  <span ref="surface" class="icon" :style="{ width: width + 'px', height: height + 'px' }" :title="error || (!texture ? t('未采集纹理') : label)">
    <canvas v-show="texture && !error" ref="canvas" :style="{ width: width + 'px', height: height + 'px' }" role="img" :aria-label="label" />
    <span v-if="error" class="icon-error" role="img" :aria-label="t('纹理加载失败：{0}', error)">×</span>
    <span v-else-if="!texture" class="icon-empty" :aria-label="t('未采集纹理')">◇</span>
  </span>
</template>
