<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, shallowRef, triggerRef, watch } from 'vue';
import { type Item, type Recipe } from '../services/api';
import type { UITypeConfig } from '../services/uiTypeMapping';
import { useSound } from '../services/sound.service';
import RecipeItemTooltip from './RecipeItemTooltip.vue';
import AnimatedItemIcon from './AnimatedItemIcon.vue';

interface Props {
  recipe: Recipe;
  uiConfig?: UITypeConfig;
}

interface Emits {
  (e: 'item-click', itemId: string): void;
}

interface SlotVariant {
  itemId: string;
  count: number;
  renderAssetRef?: string | null;
  imageFileName?: string | null;
  renderHint?: Item['renderHint'];
}

interface SlotItem {
  items: SlotVariant[];
  primaryIndex: number;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();
const { playClick } = useSound();

const recipeData = computed(() => props.recipe);
const gridDims = computed(() => ({ width: 3, height: 3 }));
const totalSlots = computed(() => gridDims.value.width * gridDims.value.height);
const craftingGrid = shallowRef<Array<SlotItem | null>>([]);
const hoveredSlot = ref<number | null>(null);

// === Constellation Particle System (from FurnaceUI) ===
const bgCanvas = ref<HTMLCanvasElement | null>(null);
const uiRoot = ref<HTMLElement | null>(null);
let animFrameId = 0;
let resizeObs: ResizeObserver | null = null;

interface Star {
  x: number; y: number;
  vx: number; vy: number;
  radius: number;
  baseAlpha: number;
  phase: number;
  phaseSpeed: number;
}

const STAR_COUNT = 36;
const CONNECTION_DIST = 72;
let stars: Star[] = [];
let cW = 0;
let cH = 0;

const initStars = () => {
  stars = [];
  for (let i = 0; i < STAR_COUNT; i++) {
    stars.push({
      x: Math.random() * cW,
      y: Math.random() * cH,
      vx: (Math.random() - 0.5) * 0.15,
      vy: (Math.random() - 0.5) * 0.15,
      radius: 0.5 + Math.random() * 1.2,
      baseAlpha: 0.15 + Math.random() * 0.35,
      phase: Math.random() * Math.PI * 2,
      phaseSpeed: 0.003 + Math.random() * 0.008,
    });
  }
};

const drawConstellations = () => {
  const canvas = bgCanvas.value;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, cW, cH);
  const centerX = cW / 2;
  const centerY = cH / 2;
  const now = performance.now() * 0.001;

  for (const s of stars) {
    s.phase += s.phaseSpeed;
    s.x += s.vx + Math.sin(s.phase) * 0.08;
    s.y += s.vy + Math.cos(s.phase * 0.7) * 0.06;
    const dx = s.x - centerX;
    const dy = s.y - centerY;
    const dist = Math.sqrt(dx * dx + dy * dy) + 1;
    // Keep the star field alive instead of letting every particle slowly collapse
    // into the center and disappear behind the workbench card. A very light
    // orbital drift gives the background a stable, NEI-like ambient shimmer.
    const orbit = 0.00045;
    s.vx += (-dy / dist) * orbit;
    s.vy += (dx / dist) * orbit;
    s.vx *= 0.996;
    s.vy *= 0.996;
    if (s.x < -20) s.x = cW + 20;
    if (s.x > cW + 20) s.x = -20;
    if (s.y < -20) s.y = cH + 20;
    if (s.y > cH + 20) s.y = -20;
  }

  for (let i = 0; i < stars.length; i++) {
    for (let j = i + 1; j < stars.length; j++) {
      const a = stars[i], b = stars[j];
      const ddx = a.x - b.x, ddy = a.y - b.y;
      const d = Math.sqrt(ddx * ddx + ddy * ddy);
      if (d < CONNECTION_DIST) {
        const alpha = (1 - d / CONNECTION_DIST) * 0.12;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = `rgba(148, 180, 220, ${alpha})`;
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }
    }
  }

  for (const s of stars) {
    const twinkle = s.baseAlpha + Math.sin(now * 2 + s.phase) * 0.1;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(180, 200, 230, ${twinkle})`;
    ctx.fill();
    if (s.radius > 1) {
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius * 3, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(148, 180, 220, ${twinkle * 0.15})`;
      ctx.fill();
    }
  }
  animFrameId = requestAnimationFrame(drawConstellations);
};

const handleCanvasResize = () => {
  const el = uiRoot.value;
  const canvas = bgCanvas.value;
  if (!el || !canvas) return;
  const rect = el.getBoundingClientRect();
  const oldW = cW;
  cW = rect.width;
  cH = rect.height;
  canvas.width = cW;
  canvas.height = cH;
  if (stars.length === 0 || (oldW === 0 && cW > 0)) initStars();
};

// === Recipe Logic (preserved) ===
let alternativeCycleTimer: number | null = null;

const stopAlternativeCycle = () => {
  if (alternativeCycleTimer !== null) {
    window.clearInterval(alternativeCycleTimer);
    alternativeCycleTimer = null;
  }
};

const startAlternativeCycle = () => {
  stopAlternativeCycle();
  if (!craftingGrid.value.some((slot) => slot && slot.items.length > 1)) return;

  alternativeCycleTimer = window.setInterval(() => {
    craftingGrid.value = craftingGrid.value.map((slot) => {
      if (!slot || slot.items.length <= 1) return slot;
      return {
        ...slot,
        primaryIndex: (slot.primaryIndex + 1) % slot.items.length,
      };
    });
    triggerRef(craftingGrid);
  }, 3000);
};

const initGrid = async () => {
  const gridSize = totalSlots.value;
  const newGrid: Array<SlotItem | null> = Array.from({ length: gridSize }, () => null);
  const gridWidth = gridDims.value.width;

  for (let slotIndex = 0; slotIndex < gridSize; slotIndex++) {
    const row = Math.floor(slotIndex / gridWidth);
    const col = slotIndex % gridWidth;
    if (row >= recipeData.value.inputs.length || col >= recipeData.value.inputs[row].length) continue;
    const itemOrArray = recipeData.value.inputs[row][col];
    if (!itemOrArray) continue;
    const itemsArray = Array.isArray(itemOrArray) ? itemOrArray : [itemOrArray];
    const slotItems: SlotVariant[] = [];
    for (const item of itemsArray) {
      if (!item?.itemId) continue;
      slotItems.push({
        itemId: item.itemId,
        count: item.count,
        renderAssetRef: typeof item.renderAssetRef === 'string' ? item.renderAssetRef : null,
        imageFileName: typeof item.imageFileName === 'string' ? item.imageFileName : null,
        renderHint: item.renderHint ?? null,
      });
    }
    if (slotItems.length > 0) {
      newGrid[slotIndex] = { items: slotItems, primaryIndex: 0 };
    }
  }
  craftingGrid.value = newGrid;
  triggerRef(craftingGrid);
  startAlternativeCycle();
};

const outputItem = computed(() => recipeData.value.outputs?.[0] ?? null);
const hasOutput = computed(() => Boolean(outputItem.value?.itemId));
const handleItemClick = (itemId: string) => { playClick(); emit('item-click', itemId); };

watch(() => props.recipe, async () => { await initGrid(); }, { deep: true });

onMounted(async () => {
  await initGrid();
  handleCanvasResize();
  resizeObs = new ResizeObserver(handleCanvasResize);
  if (uiRoot.value) resizeObs.observe(uiRoot.value);
  animFrameId = requestAnimationFrame(drawConstellations);
});

onBeforeUnmount(() => {
  stopAlternativeCycle();
  cancelAnimationFrame(animFrameId);
  if (resizeObs) resizeObs.disconnect();
});
</script>

<template>
  <div class="synthesis-ui" ref="uiRoot">

    <div class="matte-backdrop" aria-hidden="true" />
    <canvas ref="bgCanvas" class="constellation-canvas" aria-hidden="true" />
    <div class="ambient-field" aria-hidden="true">
      <span class="ambient-orb ambient-orb-a" />
      <span class="ambient-orb ambient-orb-b" />
      <span class="ambient-orb ambient-orb-c" />
    </div>
    <div class="volumetric-rays" aria-hidden="true">
      <span class="light-ray ray-1" />
      <span class="light-ray ray-2" />
      <span class="light-ray ray-3" />
      <span class="light-ray ray-4" />
    </div>

    <div class="synthesis-deck">
      <div class="workbench-track">

        <!-- 3脳3 GRID -->
        <div class="grid-matrix">
          <template v-for="(slotItem, index) in craftingGrid" :key="`slot-${index}`">
            <div
              v-if="slotItem"
              class="craft-slot"
              :class="{ 'is-hovered': hoveredSlot === index, 'has-alternatives': slotItem.items.length > 1 }"
              @mouseenter="hoveredSlot = index"
              @mouseleave="hoveredSlot = null"
            >
              <RecipeItemTooltip
                :item-id="slotItem.items[slotItem.primaryIndex].itemId"
                :count="slotItem.items[slotItem.primaryIndex].count"
                @click="handleItemClick(slotItem.items[slotItem.primaryIndex].itemId)"
              >
                <div class="slot-item magnetic-hover">
                  <AnimatedItemIcon
                    :item-id="slotItem.items[slotItem.primaryIndex].itemId"
                    :render-asset-ref="slotItem.items[slotItem.primaryIndex].renderAssetRef || null"
                    :image-file-name="slotItem.items[slotItem.primaryIndex].imageFileName || null"
                    :size="42"
                    class="item-icon dissolve-swap"
                    :key="slotItem.primaryIndex"
                  />
                </div>
              </RecipeItemTooltip>
              <span v-if="slotItem.items[slotItem.primaryIndex].count > 1" class="minimal-badge count-badge">
                x{{ slotItem.items[slotItem.primaryIndex].count }}
              </span>
              <div v-if="slotItem.items.length > 1" class="minimal-badge alt-badge">
                {{ slotItem.primaryIndex + 1 }}/{{ slotItem.items.length }}
              </div>
            </div>
            <div v-else class="craft-slot empty" />
          </template>
        </div>

        <!-- HEATING CORRIDOR -->
        <div class="heating-corridor" aria-hidden="true">
          <span class="fusion-rail rail-top" />
          <span class="fusion-rail rail-bottom" />
          <span class="fusion-pulse pulse-a" />
          <span class="fusion-pulse pulse-b" />
          <span class="fusion-pulse pulse-c" />
        </div>

        <!-- OUTPUT -->
        <div class="track-node node-output">
          <RecipeItemTooltip
            v-if="hasOutput"
            :item-id="outputItem!.itemId"
            :count="outputItem!.count"
            @click="handleItemClick(outputItem!.itemId)"
          >
            <div class="slot-item magnetic-hover output-lift">
              <AnimatedItemIcon
                :item-id="outputItem!.itemId"
                :render-asset-ref="outputItem!.renderAssetRef || null"
                :image-file-name="outputItem!.imageFileName || null"
                :size="72"
                class="item-icon"
              />
            </div>
          </RecipeItemTooltip>
          <span v-if="hasOutput && outputItem!.count > 1" class="minimal-badge count-badge">
            x{{ outputItem!.count }}
          </span>
          <div class="slot-item empty" v-else-if="!hasOutput" />
        </div>

      </div>
    </div>
  </div>
</template>

<style scoped>
.synthesis-ui {
  --lab-bg: #0c121b;
  --lab-surface: rgba(17, 24, 36, 0.92);
  --lab-border: rgba(148, 163, 184, 0.12);
  --lab-border-soft: rgba(148, 163, 184, 0.08);
  --lab-heat: 245, 158, 11;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 480px;
  height: 100%;
  flex: 1;
  padding: 24px;
  background: transparent;
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif;
}

.constellation-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 1;
}

.matte-backdrop {
  position: absolute;
  inset: 0;
  border-radius: 18px;
  background:
    radial-gradient(circle at 50% 50%, rgba(59, 130, 246, 0.028) 0%, transparent 40%),
    linear-gradient(180deg, rgba(10, 15, 22, 0.28), rgba(8, 12, 18, 0.42));
  pointer-events: none;
}

.matte-backdrop::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(148, 163, 184, 0.035) 1px, transparent 1px),
    linear-gradient(90deg, rgba(148, 163, 184, 0.035) 1px, transparent 1px);
  background-size: 28px 28px;
  opacity: 0.42;
  mask-image: radial-gradient(ellipse at center, black 16%, transparent 72%);
}

.ambient-field {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}

.ambient-orb {
  position: absolute;
  display: block;
  pointer-events: none;
  border-radius: 50%;
  opacity: 0.42;
  will-change: transform, opacity;
  animation: ambientDrift 14s ease-in-out infinite alternate;
}

.ambient-orb-a {
  top: 18%; left: 12%;
  width: 200px; height: 200px;
  background: radial-gradient(circle, rgba(96, 165, 250, 0.08) 0%, transparent 55%);
}

.ambient-orb-b {
  right: 14%; bottom: 18%;
  width: 180px; height: 180px;
  background: radial-gradient(circle, rgba(var(--lab-heat), 0.07) 0%, transparent 55%);
  animation-delay: -4s;
}

.ambient-orb-c {
  top: 42%; left: 50%;
  width: 140px; height: 140px;
  background: radial-gradient(circle, rgba(148, 163, 184, 0.06) 0%, transparent 55%);
  animation-delay: -8s;
}

.volumetric-rays {
  position: absolute;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  width: 100%; height: 100%;
  pointer-events: none;
  z-index: 2;
}

.light-ray {
  position: absolute;
  top: 50%; left: 50%;
  width: 4px; height: 160px;
  transform-origin: center bottom;
  background: linear-gradient(0deg, rgba(var(--lab-heat), 0.04), transparent 80%);
  opacity: 0;
  will-change: opacity;
  animation: ray-pulse 8s ease-in-out infinite;
}

.ray-1 { transform: translate(-50%, -100%) rotate(-25deg); animation-delay: 0s; }
.ray-2 { transform: translate(-50%, -100%) rotate(12deg); animation-delay: 2s; height: 120px; }
.ray-3 { transform: translate(-50%, -100%) rotate(-8deg); animation-delay: 4.5s; height: 140px; }
.ray-4 { transform: translate(-50%, -100%) rotate(30deg); animation-delay: 6s; height: 100px; }

.synthesis-deck {
  position: relative;
  z-index: 10;
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
}

.synthesis-deck::before {
  content: '';
  position: absolute;
  width: min(780px, 90vw);
  height: 380px;
  border-radius: 50%;
  background:
    radial-gradient(ellipse at 50% 50%, rgba(26, 38, 56, 0.35) 0%, rgba(20, 30, 44, 0.15) 36%, transparent 72%);
  opacity: 0.92;
  pointer-events: none;
}

.workbench-track {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  background:
    radial-gradient(ellipse at 50% 50%, rgba(28, 40, 58, 0.45) 0%, rgba(14, 20, 32, 0.38) 46%, rgba(9, 14, 22, 0.32) 100%),
    linear-gradient(180deg, rgba(17, 24, 36, 0.58), rgba(10, 15, 23, 0.65));
  border-radius: 36px;
  padding: 32px 48px;
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.06),
    inset 0 0 24px rgba(148, 163, 184, 0.03),
    0 0 0 1px rgba(148, 163, 184, 0.08),
    0 24px 48px rgba(2, 6, 12, 0.42);
  width: fit-content;
  max-width: 100%;
  min-height: 140px;
  gap: 42px;
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  overflow: visible;
  isolation: isolate;
}

.workbench-track::before {
  content: '';
  position: absolute;
  inset: -1px;
  border-radius: inherit;
  padding: 1px;
  background: linear-gradient(135deg, rgba(255,255,255,0.08), rgba(148, 163, 184, 0.02) 45%, rgba(var(--lab-heat), 0.06));
  mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  mask-composite: exclude;
  -webkit-mask-composite: xor;
  pointer-events: none;
  opacity: 0.8;
}

.grid-matrix {
  position: relative;
  display: grid;
  grid-template-columns: repeat(3, 64px);
  grid-template-rows: repeat(3, 64px);
  gap: 12px;
  flex: 0 0 auto;
}

.grid-matrix::before {
  content: '';
  position: absolute;
  inset: -18px;
  border-radius: 28px;
  background: radial-gradient(ellipse at 50% 50%, rgba(2, 6, 12, 0.26), transparent 72%);
  z-index: -1;
  pointer-events: none;
}

.craft-slot {
  width: 64px;
  height: 64px;
  border-radius: 16px;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(180deg, rgba(6, 10, 16, 0.92), rgba(11, 17, 26, 0.96));
  box-shadow:
    inset 0 4px 12px rgba(0,0,0,0.4),
    inset 0 1px 0 rgba(255,255,255,0.03),
    0 0 0 1px var(--lab-border-soft);
  transition: transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 0.3s ease;
}

.craft-slot.empty {
  opacity: 0.4;
  background: linear-gradient(180deg, rgba(4, 7, 12, 0.85), rgba(8, 12, 20, 0.90));
}

.craft-slot.is-hovered,
.craft-slot:hover:not(.empty) {
  transform: translateY(-2px) scale(1.02);
  box-shadow:
    inset 0 4px 10px rgba(0,0,0,0.68),
    inset 0 1px 0 rgba(255,255,255,0.08),
    0 0 0 1px rgba(148, 190, 255, 0.28),
    0 8px 18px rgba(96, 165, 250, 0.16);
}

.craft-slot.has-alternatives {
  box-shadow:
    inset 0 4px 10px rgba(0,0,0,0.68),
    inset 0 1px 0 rgba(255,255,255,0.05),
    0 0 0 1px rgba(225, 232, 241, 0.22);
}

/* Slot item & hover */
.slot-item {
  position: relative;
  width: 52px; height: 52px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(180deg, rgba(15, 22, 33, 0.88), rgba(8, 12, 18, 0.94));
  border: 1px solid rgba(148, 163, 184, 0.08);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.05),
    0 4px 12px rgba(0,0,0,0.22);
}

.slot-item.empty {
  opacity: 0.3;
}

.magnetic-hover {
  transition: transform 0.5s cubic-bezier(0.2, 0.8, 0.2, 1), filter 0.5s ease;
  cursor: pointer;
}

.craft-slot:hover .magnetic-hover {
  transform: translateY(-1px) scale(1.03);
  filter: drop-shadow(0 3px 6px rgba(0,0,0,0.5));
}

.node-output:hover .magnetic-hover {
  transform: translateY(-3px) scale(1.04);
  filter: drop-shadow(0 8px 14px rgba(var(--lab-heat), 0.12));
}

.item-icon {
  image-rendering: pixelated;
  object-fit: contain;
  filter: drop-shadow(0 2px 4px rgba(0,0,0,0.4));
}

.dissolve-swap {
  animation: dissolve-in 0.8s cubic-bezier(0.4, 0, 0.2, 1);
}

/* Heating corridor */
.heating-corridor {
  width: 160px;
  flex: 0 0 160px;
  height: 100%;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 120px;
  contain: layout style;
}

.heating-corridor::before {
  content: '';
  position: absolute;
  left: -28px;
  right: -28px;
  top: 50%;
  height: 120px;
  transform: translateY(-50%);
  border-radius: 50%;
  background:
    radial-gradient(circle, rgba(148, 190, 255, 0.05) 0%, rgba(var(--lab-heat), 0.03) 38%, transparent 70%);
  pointer-events: none;
}

.fusion-rail {
  position: absolute;
  left: 8px; right: 8px;
  height: 1px;
  border-radius: 999px;
  overflow: hidden;
  background: linear-gradient(90deg, transparent, rgba(148, 190, 255, 0.25), rgba(var(--lab-heat), 0.30), transparent);
}

.fusion-rail::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent 0 18%, rgba(232, 240, 255, 0.8) 32%, transparent 48%);
  transform: translateX(-70%);
  will-change: transform;
  animation: railCharge 2.9s cubic-bezier(0.42, 0, 0.18, 1) infinite;
}

.rail-top { top: 30%; }
.rail-bottom { bottom: 30%; }
.rail-bottom::after { animation-delay: 0.52s; opacity: 0.7; }

.fusion-pulse {
  position: absolute;
  left: 8px; top: 50%;
  width: 4px; height: 4px;
  border-radius: 50%;
  transform: translate(-8px, -50%);
  background: rgba(229, 238, 255, 0.86);
  box-shadow:
    0 0 8px rgba(148, 190, 255, 0.6),
    0 0 18px rgba(var(--lab-heat), 0.2);
  opacity: 0;
  will-change: transform, opacity;
  animation: fusionPulse 3.1s cubic-bezier(0.45, 0, 0.2, 1) infinite;
}

.pulse-b { animation-delay: 0.62s; width: 3px; height: 3px; top: 30%; }
.pulse-c { animation-delay: 1.16s; width: 5px; height: 5px; top: 70%; }

/* Output node */
.track-node {
  width: 104px; height: 104px;
  border-radius: 50%;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
}

.node-output {
  background:
    radial-gradient(circle at 50% 42%, rgba(35, 48, 66, 0.72), rgba(12, 17, 26, 0.58) 70%),
    linear-gradient(180deg, rgba(18, 26, 39, 0.65), rgba(12, 17, 26, 0.55));
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.06),
    inset 0 -12px 20px rgba(0,0,0,0.12),
    0 10px 24px rgba(0,0,0,0.24),
    0 0 0 1px rgba(148, 163, 184, 0.08),
    0 0 42px rgba(var(--lab-heat), 0.04);
}

.node-output::before {
  content: '';
  position: absolute;
  inset: -48px;
  border-radius: 50%;
  background:
    radial-gradient(circle, rgba(var(--lab-heat), 0.06) 0%, rgba(148, 190, 255, 0.03) 40%, transparent 68%);
  z-index: -1;
  will-change: transform, opacity;
  animation: heat-breathe 4s ease-in-out infinite alternate;
  pointer-events: none;
}

.node-output .slot-item {
  width: 82px; height: 82px;
  border-radius: 50%;
}

/* Badges */
.minimal-badge {
  position: absolute;
  background: rgba(10, 15, 23, 0.85);
  color: #e2e8f0;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.5px;
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 6px;
  padding: 3px 8px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.25);
  pointer-events: none;
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}

.count-badge { right: -2px; bottom: -2px; }
.alt-badge { top: -2px; left: 50%; transform: translateX(-50%); font-size: 9px; }

/* Animations */
@keyframes dissolve-in {
  from { opacity: 0; filter: blur(3px); transform: scale(0.96); }
  to { opacity: 1; filter: blur(0); transform: scale(1); }
}

@keyframes heat-breathe {
  from { opacity: 0.5; transform: scale(0.9); }
  to { opacity: 1; transform: scale(1.05); }
}

@keyframes railCharge {
  0% { transform: translateX(-78%); opacity: 0; }
  18% { opacity: 0.88; }
  72% { opacity: 0.72; }
  100% { transform: translateX(92%); opacity: 0; }
}

@keyframes fusionPulse {
  0% { opacity: 0; transform: translate(-8px, -50%) scale(0.65); }
  18% { opacity: 0.9; }
  72% { opacity: 0.72; }
  100% { opacity: 0; transform: translate(100px, -50%) scale(1.08); }
}

@keyframes ambientDrift {
  from { transform: translate3d(0, 0, 0) scale(0.96); opacity: 0.24; }
  to { transform: translate3d(6px, -8px, 0) scale(1.06); opacity: 0.42; }
}

@keyframes ray-pulse {
  0%, 100% { opacity: 0; }
  30% { opacity: 0.5; }
  50% { opacity: 0.8; }
  70% { opacity: 0.4; }
}

@media (max-width: 760px) {
  .workbench-track {
    flex-direction: column;
    width: 100%;
    min-height: auto;
    padding: 14px;
    border-radius: 22px;
    gap: 10px;
  }

  .heating-corridor {
    min-width: 100%;
    min-height: 32px;
    transform: rotate(90deg);
  }

  .grid-matrix {
    grid-template-columns: repeat(3, 50px);
    grid-template-rows: repeat(3, 50px);
  }

  .craft-slot { width: 50px; height: 50px; }
  .slot-item { width: 40px; height: 40px; }

  .track-node { width: 76px; height: 76px; }
  .node-output .slot-item { width: 58px; height: 58px; }
}
</style>
