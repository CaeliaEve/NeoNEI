<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { Cell } from '@elysium/contracts';
import { Scene, type Volume } from '../catalog/scene.ts';
import type { Models } from '../catalog/models.ts';

const props = defineProps<{ volume: Volume; cells: Cell[]; label: string; caption: string; models?: Models | null; animate?: boolean }>();
const emit = defineEmits<{ select: [cell: Cell | null] }>();
const canvas = ref<HTMLCanvasElement>(), error = ref('');
const layer = ref(-1), rule = ref(-1), air = ref(false);
let scene: Scene | null = null, observer: ResizeObserver | null = null, frame = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
const choices = computed(() => [...new Map(props.volume.palette.map((entry, index) => [entry.group ?? index, entry.label])).entries()]);
let pointer: { x: number; y: number; startX: number; startY: number } | null = null;
function update(): void {
  try { error.value = ''; if (scene) scene.animate = Boolean(props.animate); scene?.set(props.volume, props.cells, layer.value, rule.value, air.value); draw(); }
  catch (failure) { error.value = failure instanceof Error ? failure.message : '结构显示失败'; }
}
function start(): void {
  if (!canvas.value) return;
  scene?.dispose(); scene = null; error.value = '';
  try { scene = new Scene(canvas.value, props.models ?? null); update(); }
  catch (failure) { error.value = failure instanceof Error ? failure.message : '结构显示失败'; }
}
function draw(): void {
  clearTimeout(timer);
  if (!frame) frame = requestAnimationFrame(() => {
    frame = 0;
    try { scene?.draw(); }
    catch (failure) { error.value = failure instanceof Error ? failure.message : '模型绘制失败'; }
    if (!error.value && props.animate && props.models?.animated && !document.hidden) timer = setTimeout(draw, props.models.smooth ? 16 : 50);
  });
}
function move(event: PointerEvent): void {
  if (!pointer || !scene) return;
  scene.yaw += (event.clientX - pointer.x) * .009;
  scene.pitch = Math.max(-1.4, Math.min(1.4, scene.pitch + (event.clientY - pointer.y) * .009));
  pointer.x = event.clientX; pointer.y = event.clientY; draw();
}
function down(event: PointerEvent): void {
  if (event.button !== 0) return;
  canvas.value?.setPointerCapture(event.pointerId);
  pointer = { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY };
}
function up(event: PointerEvent): void {
  if (pointer && Math.hypot(pointer.startX - event.clientX, pointer.startY - event.clientY) < 4) emit('select', scene?.pick(event.clientX, event.clientY) ?? null);
  pointer = null;
  if (canvas.value?.hasPointerCapture(event.pointerId)) canvas.value.releasePointerCapture(event.pointerId);
}
function wheel(event: WheelEvent): void {
  if (scene) { scene.zoom = Math.max(.2, Math.min(12, scene.zoom * Math.exp(-event.deltaY * .001))); draw(); }
}
function reset(): void { scene?.reset(); }
function key(event: KeyboardEvent): void {
  if (!scene) return;
  const actions: Record<string, () => void> = {
    ArrowLeft: () => { scene!.yaw -= .15; }, ArrowRight: () => { scene!.yaw += .15; },
    ArrowUp: () => { scene!.pitch = Math.min(1.4, scene!.pitch + .15); }, ArrowDown: () => { scene!.pitch = Math.max(-1.4, scene!.pitch - .15); },
    '+': () => { scene!.zoom = Math.min(12, scene!.zoom * 1.15); }, '-': () => { scene!.zoom = Math.max(.2, scene!.zoom / 1.15); }, Home: () => scene!.reset(),
  };
  const action = actions[event.key];
  if (action) { event.preventDefault(); action(); draw(); }
}
watch(() => props.volume, () => { layer.value = -1; rule.value = -1; emit('select', null); });
watch([() => props.volume, () => props.cells, layer, rule, air], update);
watch(() => props.models, start);
watch(() => props.animate, update);
watch([layer, rule, air], () => emit('select', null));
onMounted(() => { start(); observer = new ResizeObserver(draw); if (canvas.value) observer.observe(canvas.value); document.addEventListener('visibilitychange', draw); });
onBeforeUnmount(() => { observer?.disconnect(); cancelAnimationFrame(frame); clearTimeout(timer); document.removeEventListener('visibilitychange', draw); scene?.dispose(); scene = null; });
</script>

<template>
  <figure class="structure-view">
    <div class="structure-controls">
      <label>高度层 <input v-model.number="layer" type="range" min="-1" :max="volume.size[1] - 1" :aria-valuetext="layer < 0 ? '全部' : String(layer)" aria-label="结构高度层" /><output>{{ layer < 0 ? '全部' : layer }}</output></label>
      <label>{{ label }} <select v-model.number="rule" :aria-label="'隔离结构' + label"><option :value="-1">全部</option><option v-for="[index, label] in choices" :key="index" :value="index">{{ label }}</option></select></label>
      <label v-if="volume.palette.some(entry => entry.air)"><input v-model="air" type="checkbox" />显示空气</label>
      <button type="button" @click="reset">重置视角</button>
    </div>
    <p v-if="error" class="inline-error" role="alert">{{ error }} <button type="button" @click="start">重试</button></p>
    <canvas ref="canvas" aria-label="多方块三维结构" role="img" tabindex="0" @pointerdown="down" @pointermove="move" @pointerup="up"
      @pointercancel="pointer = null" @wheel.prevent="wheel" @keydown="key"
      @webglcontextlost.prevent="error = '三维上下文已丢失，正在等待浏览器恢复。'" @webglcontextrestored="start" />
    <figcaption>拖动旋转 · 滚轮缩放 · 方向键旋转 · 点击定位。{{ caption }}</figcaption>
  </figure>
</template>

<style scoped>
.structure-view { margin: 1rem 0; }
.structure-view canvas { display: block; width: 100%; height: clamp(300px, 48vh, 600px); border: 1px solid #294253; border-radius: 10px; touch-action: none; cursor: grab; }
.structure-view canvas:active { cursor: grabbing; }
.structure-controls { display: flex; align-items: center; flex-wrap: wrap; gap: .8rem; margin-bottom: .8rem; }
.structure-controls label { display: flex; align-items: center; gap: .4rem; }
.structure-controls input[type=range] { width: 110px; }
figcaption { margin-top: .5rem; color: #a3b5c4; font-size: .8rem; }
</style>
