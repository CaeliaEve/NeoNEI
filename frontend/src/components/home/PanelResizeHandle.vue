<script setup lang="ts">
import {onBeforeUnmount, ref} from 'vue';

const props = defineProps<{orientation: 'vertical' | 'horizontal'; label: string; controls: string; value: number; min: number; max: number}>();
const emit = defineEmits<{update: [value: number]; start: []; end: []; reset: []}>();
const dragging = ref(false);
let activePointer: number | null = null, origin = 0, initial = 0, pending: number | null = null, frame = 0;
let handle: HTMLElement | null = null;
const clamp = (value: number) => Math.round(Math.min(props.max, Math.max(props.min, value)));
const coordinate = (event: PointerEvent) => props.orientation === 'vertical' ? event.clientX : event.clientY;
function flush() {
  if (frame) cancelAnimationFrame(frame);
  frame = 0;
  if (pending !== null) { emit('update', pending); pending = null; }
}
function start(event: PointerEvent) {
  if (event.button !== 0 || activePointer !== null) return;
  event.preventDefault();
  handle = event.currentTarget as HTMLElement;
  handle.focus({preventScroll: true});
  origin = coordinate(event); initial = props.value; activePointer = event.pointerId;
  handle.setPointerCapture(event.pointerId);
  dragging.value = true; emit('start');
}
function move(event: PointerEvent) {
  if (event.pointerId !== activePointer) return;
  pending = clamp(initial + origin - coordinate(event));
  if (!frame) frame = requestAnimationFrame(flush);
}
function finish(event?: PointerEvent, cancel = false) {
  if (activePointer === null || (event && event.pointerId !== activePointer)) return;
  if (cancel) pending = initial;
  flush();
  const pointer = activePointer; activePointer = null; dragging.value = false;
  if (handle?.hasPointerCapture(pointer)) handle.releasePointerCapture(pointer);
  emit('end');
}
function keydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && dragging.value) { event.preventDefault(); finish(undefined, true); return; }
  if (event.key === 'Home' || event.key === 'Enter') { event.preventDefault(); emit('reset'); return; }
  const increase = props.orientation === 'vertical' ? 'ArrowLeft' : 'ArrowUp';
  const decrease = props.orientation === 'vertical' ? 'ArrowRight' : 'ArrowDown';
  if (event.key !== increase && event.key !== decrease) return;
  event.preventDefault();
  emit('update', clamp(props.value + (event.key === increase ? 1 : -1) * (event.shiftKey ? 48 : 16)));
  emit('end');
}
onBeforeUnmount(() => { if (frame) cancelAnimationFrame(frame); });
</script>

<template>
  <div
    class="panel-resize-handle" :class="[`panel-resize-handle--${orientation}`, {'is-dragging': dragging}]"
    role="separator" tabindex="0" :aria-label="label" :aria-controls="controls" :aria-orientation="orientation"
    :aria-valuenow="Math.round(value)" :aria-valuemin="Math.round(min)" :aria-valuemax="Math.round(max)"
    :aria-valuetext="`${Math.round(value)} 像素`" :title="`${label}：拖动调整，双击恢复默认；方向键微调，Home 恢复默认`"
    @pointerdown.stop="start" @pointermove.stop="move" @pointerup.stop="finish($event)"
    @pointercancel.stop="finish($event, true)" @lostpointercapture="finish($event)" @keydown.stop="keydown"
    @dblclick.stop="emit('reset')" @wheel.stop
  ><span aria-hidden="true" /></div>
</template>

<style scoped>
.panel-resize-handle { position: absolute; z-index: 45; touch-action: none; user-select: none; outline: none; }
.panel-resize-handle--vertical { inset: 0 auto 0 0; width: 12px; cursor: col-resize; }
.panel-resize-handle--horizontal { inset: 0 12px auto; height: 12px; cursor: row-resize; }
.panel-resize-handle::before, .panel-resize-handle span { content: ''; position: absolute; background: rgba(148, 163, 184, .22); border-radius: 4px; transition: background-color 150ms; pointer-events: none; }
.panel-resize-handle--vertical::before { width: 1px; inset: 0 auto 0 5px; }
.panel-resize-handle--vertical span { width: 3px; height: 32px; left: 4px; top: calc(50% - 16px); }
.panel-resize-handle--horizontal::before { height: 1px; inset: 5px 0 auto; }
.panel-resize-handle--horizontal span { height: 3px; width: 32px; top: 4px; left: calc(50% - 16px); }
.panel-resize-handle:hover::before, .panel-resize-handle:hover span,
.panel-resize-handle:focus-visible::before, .panel-resize-handle:focus-visible span,
.panel-resize-handle.is-dragging::before, .panel-resize-handle.is-dragging span { background: #7dd3fc; }
.panel-resize-handle:focus-visible { outline: 1px solid #7dd3fc; outline-offset: -2px; }
@media (prefers-reduced-motion: reduce) { .panel-resize-handle::before, .panel-resize-handle span { transition: none; } }
</style>
