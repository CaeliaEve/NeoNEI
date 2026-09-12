<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { Motion, Texture } from '@elysium/contracts';
import { Atlas, frameAt, stepAt, type Lease } from '../catalog/atlas.ts';
import { clock, type Playback } from '../catalog/clock.ts';

const props = withDefaults(defineProps<{ atlas: Atlas; texture?: Texture | null; width?: number; height?: number; animate?: boolean; label?: string; motion?: Motion[]; playback?: Playback }>(),
  { width: 32, height: 32, animate: true, label: '' });
const canvas = ref<HTMLCanvasElement | null>(null), surface = ref<HTMLElement | null>(null);
const visible = ref(false), error = ref('');
let observer: IntersectionObserver | null = null;
onMounted(() => {
  observer = new IntersectionObserver(entries => { visible.value = entries[0]?.isIntersecting ?? false; }, { rootMargin: '48px' });
  if (surface.value) observer.observe(surface.value);
});
onBeforeUnmount(() => observer?.disconnect());

let updatePlayback = (): void => {};
watch(() => props.animate, () => updatePlayback());
watch([() => props.atlas, () => props.texture, () => props.width, () => props.height, () => props.motion, () => props.playback, visible, canvas],
  async (_value, _old, cleanup) => {
    const controller = new AbortController();
    let leases: Lease[] = [], stop: (() => void) | undefined;
    cleanup(() => { controller.abort(); stop?.(); updatePlayback = () => {}; leases.forEach(lease => lease.release()); });
    error.value = '';
    const target = canvas.value, texture = props.texture;
    if (!target || !texture || !visible.value) return;
    const paths = [...new Set(texture.frames.map(frame => frame.path))];
    const results = await Promise.allSettled(paths.map(path => props.atlas.acquire(path, controller.signal)));
    leases = results.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
    if (controller.signal.aborted) { leases.forEach(lease => lease.release()); return; }
    const failed = results.find(result => result.status === 'rejected');
    if (failed?.status === 'rejected') {
      leases.forEach(lease => lease.release());
      error.value = failed.reason instanceof Error ? failed.reason.message : '纹理加载失败';
      return;
    }
    const images = new Map(paths.map((path, index) => [path, leases[index]!.image]));
    try {
      for (const frame of texture.frames) {
        const image = images.get(frame.path)!;
        if (frame.width <= 0 || frame.height <= 0 || frame.x < 0 || frame.y < 0
          || frame.x + frame.width > image.width || frame.y + frame.height > image.height) throw new Error('纹理裁剪超出图集范围');
      }
      const density = Math.min(devicePixelRatio || 1, 3);
      target.width = Math.max(1, Math.round(props.width * density)); target.height = Math.max(1, Math.round(props.height * density));
      const context = target.getContext('2d');
      if (!context) throw new Error('浏览器无法创建纹理画布');
      context.imageSmoothingEnabled = false;
      const motion = props.motion;
      const clips = motion?.map(frame => frame.areas.map(area => area.map(Number)));
      if (motion) {
        if (!motion.length || motion.length > 4096 || motion.reduce((sum, frame) => sum + frame.ticks, 0) > 72000
          || motion.some(frame => !Number.isInteger(frame.ticks) || frame.ticks < 1 || frame.areas.length > 16)) throw new Error('界面动画时间线无效');
        for (const areas of clips!) for (const area of areas) {
          if (area.length !== 4 || area.some(value => !Number.isFinite(value) || value < 0 || value > 1)
            || area[0]! >= area[2]! || area[1]! >= area[3]!) throw new Error('界面动画裁剪范围无效');
        }
      }
      let previous = '';
      const draw = (elapsed: number): void => {
        const current = frameAt(texture, elapsed), clip = motion ? stepAt(motion, elapsed).index : -1;
        const state = current.index + ':' + current.blend + ':' + clip;
        if (state === previous) return;
        previous = state;
        context.clearRect(0, 0, target.width, target.height);
        const areas = clips?.[clip];
        if (areas && !areas.length) return;
        context.save();
        if (areas) {
          context.beginPath();
          for (const area of areas) context.rect(area[0]! * target.width, area[1]! * target.height,
            (area[2]! - area[0]!) * target.width, (area[3]! - area[1]!) * target.height);
          context.clip();
        }
        const paint = (index: number, opacity: number): void => {
          const frame = texture.frames[index]!;
          context.globalAlpha = opacity;
          context.drawImage(images.get(frame.path)!, frame.x, frame.y, frame.width, frame.height, 0, 0, target.width, target.height);
        };
        try {
          context.globalCompositeOperation = 'source-over';
          paint(current.index, 1 - current.blend);
          if (current.blend) { context.globalCompositeOperation = 'lighter'; paint(current.next, current.blend); }
        } finally { context.restore(); }
      };
      let elapsed = 0;
      const render = (time: number): void => {
        elapsed = time;
        try { draw(time); }
        catch (failure) { stop?.(); error.value = failure instanceof Error ? failure.message : '纹理绘制失败'; }
      };
      updatePlayback = () => {
        stop?.(); stop = undefined;
        if (props.playback) stop = props.playback.subscribe(render);
        else {
          render(elapsed);
          if (props.animate && (texture.frames.length > 1 || (motion?.length ?? 0) > 1)) stop = clock.subscribe(render);
        }
      };
      updatePlayback();
    } catch (failure) { error.value = failure instanceof Error ? failure.message : '纹理绘制失败'; }
  }, { flush: 'post', immediate: true });
</script>

<template>
  <span ref="surface" class="icon" :style="{ width: width + 'px', height: height + 'px' }" :title="error || (!texture ? '未采集纹理' : label)">
    <canvas v-show="texture && !error" ref="canvas" :style="{ width: width + 'px', height: height + 'px' }" role="img" :aria-label="label" />
    <span v-if="error" class="icon-error" role="img" :aria-label="'纹理加载失败：' + error">×</span>
    <span v-else-if="!texture" class="icon-empty" aria-label="未采集纹理">◇</span>
  </span>
</template>
