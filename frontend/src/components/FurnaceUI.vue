<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, shallowRef, triggerRef, watch } from 'vue';
import { type Recipe } from '../services/api';
import type { UITypeConfig } from '../services/uiTypeMapping';
import { useSound } from '../services/sound.service';
import { buildOutputSlots, type ResolvedSlot } from '../composables/useRecipeSlots';
import RecipeItemTooltip from './RecipeItemTooltip.vue';
import AnimatedItemIcon from './AnimatedItemIcon.vue';

interface Props {
  recipe: Recipe;
  uiConfig?: UITypeConfig;
  compact?: boolean;
}

interface Emits {
  (e: 'item-click', itemId: string): void;
}

interface SlotVariant {
  itemId: string;
  count: number;
  renderAssetRef?: string | null;
  imageFileName?: string | null;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();
const { playClick } = useSound();

const recipeData = computed(() => props.recipe);
const inputSlotItems = shallowRef<{ items: SlotVariant[]; primaryIndex: number } | null>(null);
const outputSlot = ref<ResolvedSlot | null>(null);

// === Constellation Particle System ===
const bgCanvas = ref<HTMLCanvasElement | null>(null);
const uiRoot = ref<HTMLElement | null>(null);
let animFrameId = 0;
let resizeObs: ResizeObserver | null = null;

interface Star {
  x: number; y: number;
  vx: number; vy: number;
  radius: number;
  baseAlpha: number;
  phase: number;       // for orbital wobble
  phaseSpeed: number;
}

const STAR_COUNT = 30;
const CONNECTION_DIST = 80;
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

  // Update stars
  for (const s of stars) {
    // Orbital wobble
    s.phase += s.phaseSpeed;
    s.x += s.vx + Math.sin(s.phase) * 0.08;
    s.y += s.vy + Math.cos(s.phase * 0.7) * 0.06;

    // Gentle gravitational pull toward center
    const dx = centerX - s.x;
    const dy = centerY - s.y;
    const dist = Math.sqrt(dx * dx + dy * dy) + 1;
    s.vx += (dx / dist) * 0.0003;
    s.vy += (dy / dist) * 0.0003;

    // Damping
    s.vx *= 0.999;
    s.vy *= 0.999;

    // Wrap edges softly
    if (s.x < -20) s.x = cW + 20;
    if (s.x > cW + 20) s.x = -20;
    if (s.y < -20) s.y = cH + 20;
    if (s.y > cH + 20) s.y = -20;
  }

  // Draw connections
  for (let i = 0; i < stars.length; i++) {
    for (let j = i + 1; j < stars.length; j++) {
      const a = stars[i];
      const b = stars[j];
      const ddx = a.x - b.x;
      const ddy = a.y - b.y;
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

  // Draw stars
  for (const s of stars) {
    const twinkle = s.baseAlpha + Math.sin(now * 2 + s.phase) * 0.1;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(180, 200, 230, ${twinkle})`;
    ctx.fill();

    // Subtle halo for larger stars
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
  cW = rect.width;
  cH = rect.height;
  canvas.width = cW;
  canvas.height = cH;
  if (stars.length === 0) initStars();
};

// === Recipe Logic ===
let alternativeCycleTimer: number | null = null;

const stopAlternativeCycle = () => {
  if (alternativeCycleTimer !== null) {
    window.clearInterval(alternativeCycleTimer);
    alternativeCycleTimer = null;
  }
};

const startAlternativeCycle = () => {
  stopAlternativeCycle();
  if (!inputSlotItems.value || inputSlotItems.value.items.length <= 1) return;

  alternativeCycleTimer = window.setInterval(() => {
    if (inputSlotItems.value) {
      inputSlotItems.value = {
        ...inputSlotItems.value,
        primaryIndex: (inputSlotItems.value.primaryIndex + 1) % inputSlotItems.value.items.length,
      };
      triggerRef(inputSlotItems);
    }
  }, 3000); 
};

const initFurnace = async () => {
  const [firstOutput] = await buildOutputSlots(recipeData.value, 1);
  outputSlot.value = firstOutput ?? null;

  let foundInputVariants: SlotVariant[] = [];
  const rows = Array.isArray(recipeData.value.inputs) ? recipeData.value.inputs : [];
  
  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    for (const cell of row) {
       if (cell) {
         const itemsArray = Array.isArray(cell) ? cell : [cell];
         for (const item of itemsArray) {
           if (item && typeof item === 'object' && 'itemId' in item && typeof item.itemId === 'string') {
              foundInputVariants.push({
                 itemId: item.itemId,
                 count: (item as any).count || 1,
                 renderAssetRef: (item as any).renderAssetRef || null,
                 imageFileName: (item as any).imageFileName || null,
              });
           }
         }
         if (foundInputVariants.length > 0) break;
       }
    }
    if (foundInputVariants.length > 0) break;
  }

  if (foundInputVariants.length > 0) {
     inputSlotItems.value = { items: foundInputVariants, primaryIndex: 0 };
     startAlternativeCycle();
  } else {
     inputSlotItems.value = null;
  }
};

const handleItemClick = (itemId: string) => {
  playClick();
  emit('item-click', itemId);
};

watch(
  () => props.recipe,
  () => {
    void initFurnace();
  },
  { deep: true, immediate: true },
);

onMounted(() => {
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
  <div class="synthesis-ui" :class="{ 'is-compact': compact }" ref="uiRoot">

    <div class="matte-backdrop" aria-hidden="true" />
    <canvas ref="bgCanvas" class="constellation-canvas" aria-hidden="true" />
    <div class="ambient-field" aria-hidden="true">
      <span class="ambient-orb ambient-orb-a" />
      <span class="ambient-orb ambient-orb-b" />
      <span class="ambient-orb ambient-orb-c" />
    </div>
    <!-- Volumetric light rays radiating from center -->
    <div class="volumetric-rays" aria-hidden="true">
      <span class="light-ray ray-1" />
      <span class="light-ray ray-2" />
      <span class="light-ray ray-3" />
      <span class="light-ray ray-4" />
    </div>
    
    <div class="synthesis-deck">
      <div class="pill-track">
        
        <!-- INPUT -->
        <div class="track-node node-input" 
          v-if="inputSlotItems"
        >
          <RecipeItemTooltip
            :item-id="inputSlotItems.items[inputSlotItems.primaryIndex].itemId"
            :count="inputSlotItems.items[inputSlotItems.primaryIndex].count"
            @click="handleItemClick(inputSlotItems.items[inputSlotItems.primaryIndex].itemId)"
          >
            <div class="slot-item magnetic-hover">
              <AnimatedItemIcon
                :item-id="inputSlotItems.items[inputSlotItems.primaryIndex].itemId"
                :render-asset-ref="inputSlotItems.items[inputSlotItems.primaryIndex].renderAssetRef || null"
                :image-file-name="inputSlotItems.items[inputSlotItems.primaryIndex].imageFileName || null"
                :size="64"
                class="item-icon dissolve-swap"
                :key="inputSlotItems.primaryIndex"
              />
            </div>
          </RecipeItemTooltip>
          <!-- Subtle overlay badges -->
          <span v-if="inputSlotItems.items[inputSlotItems.primaryIndex].count > 1" class="minimal-badge count-badge">
            x{{ inputSlotItems.items[inputSlotItems.primaryIndex].count }}
          </span>
          <div v-if="inputSlotItems.items.length > 1" class="minimal-badge alt-badge">
            {{ inputSlotItems.primaryIndex + 1 }}/{{ inputSlotItems.items.length }}
          </div>
        </div>
        <div class="track-node node-input empty" v-else />

        <!-- HEATING CORRIDOR: NeoNEI Fusion-Lane Style -->
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
            v-if="outputSlot"
            :item-id="outputSlot.itemId"
            :count="outputSlot.count"
            @click="handleItemClick(outputSlot.itemId)"
          >
            <div class="slot-item magnetic-hover output-lift">
              <AnimatedItemIcon
                :item-id="outputSlot.itemId"
                :render-asset-ref="outputSlot.renderAssetRef || null"
                :image-file-name="outputSlot.imageFileName || null"
                :size="80"
                class="item-icon"
              />
            </div>
          </RecipeItemTooltip>
          <span v-if="outputSlot && outputSlot.count > 1" class="minimal-badge count-badge">
            x{{ outputSlot.count }}
          </span>
          <div class="slot-item empty" v-else-if="!outputSlot" />
        </div>

      </div>
    </div>
  </div>
</template>

<style scoped>
.synthesis-ui {
  --lab-bg: #0c121b;
  --lab-surface: rgba(17, 24, 36, 0.92);
  --lab-surface-soft: rgba(12, 18, 28, 0.88);
  --lab-border: rgba(148, 163, 184, 0.12);
  --lab-border-soft: rgba(148, 163, 184, 0.08);
  --lab-heat: 245, 158, 11;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: min(1080px, calc(100vw - 56px));
  min-height: 260px;
  height: min(320px, calc(100vh - 360px));
  padding: 4px 10px;
  background: transparent;
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif;
}

/* Canvas constellation layer */
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

.ambient-field {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}

/* Subtle, barely visible grid to give scale without looking cheap */
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

.ambient-orb,
.ambient-dust {
  position: absolute;
  display: block;
  pointer-events: none;
}

.ambient-orb {
  border-radius: 50%;
  /* No filter:blur here! Use a pre-blurred large gradient instead.
     Animating blur() forces CPU repaint every frame = jank */
  opacity: 0.42;
  will-change: transform, opacity;
  animation: ambientDrift 14s ease-in-out infinite alternate;
}

.ambient-orb-a {
  top: 18%;
  left: 19%;
  width: 180px;
  height: 180px;
  /* Larger + softer gradient = same visual as small+blur, but zero CPU cost */
  background: radial-gradient(circle, rgba(96, 165, 250, 0.08) 0%, transparent 55%);
}

.ambient-orb-b {
  right: 20%;
  bottom: 18%;
  width: 200px;
  height: 200px;
  background: radial-gradient(circle, rgba(var(--lab-heat), 0.07) 0%, transparent 55%);
  animation-delay: -4s;
}

.ambient-orb-c {
  top: 42%;
  left: 50%;
  width: 140px;
  height: 140px;
  background: radial-gradient(circle, rgba(148, 163, 184, 0.06) 0%, transparent 55%);
  animation-delay: -8s;
}

/* Volumetric Light Rays: crepuscular beams from center */
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
  width: 4px;
  height: 160px;
  transform-origin: center bottom;
  /* Use a wider, softer gradient instead of blur(3px) */
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

/* The Core Innovation: The Pill Track */
.pill-track {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background:
    linear-gradient(180deg, rgba(17, 24, 36, 0.98), rgba(10, 15, 23, 0.98));
  border-radius: 999px;
  padding: 8px 14px;
  box-shadow: 
    inset 0 1px 0 rgba(255,255,255,0.04),
    inset 0 -10px 18px rgba(0,0,0,0.22),
    0 0 0 1px var(--lab-border),
    0 16px 28px rgba(2, 6, 12, 0.28);
  width: min(520px, 100%);
  height: 112px;
}

.track-node {
  width: 88px;
  height: 88px;
  border-radius: 50%;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
}

/* Input: Inset, receiving material */
.node-input {
  background: linear-gradient(180deg, rgba(6, 10, 16, 0.95), rgba(11, 17, 26, 0.98));
  box-shadow: 
    inset 0 5px 14px rgba(0,0,0,0.78), 
    inset 0 1px 0 rgba(255,255,255,0.03),
    0 0 0 1px var(--lab-border-soft);
  margin-left: 0;
}

/* Output: Elevated, presenting material */
.node-output {
  background: linear-gradient(180deg, rgba(18, 26, 39, 0.98), rgba(12, 17, 26, 0.98));
  box-shadow: 
    inset 0 1px 0 rgba(255,255,255,0.05),
    0 10px 18px rgba(0,0,0,0.26),
    0 0 0 1px rgba(148, 163, 184, 0.09);
  margin-right: 0;
  position: relative;
}

/* The subtle, premium glow — NO filter:blur, use large soft gradient instead */
.node-output::before {
  content: '';
  position: absolute;
  inset: -16px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(var(--lab-heat), 0.08) 0%, transparent 55%);
  z-index: -1;
  will-change: transform, opacity;
  animation: heat-breathe 4s ease-in-out infinite alternate;
  pointer-events: none;
}

/* Corridor: Clean horizontal space */
.heating-corridor {
  flex: 1 1 auto;
  height: 100%;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 148px;
  contain: layout style;
}

/* NeoNEI Fusion Rails: twin tracks with charge sweep */
.fusion-rail {
  position: absolute;
  left: 8px;
  right: 8px;
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
.rail-bottom::after {
  animation-delay: 0.52s;
  opacity: 0.7;
}

/* Traveling fusion pulses */
.fusion-pulse {
  position: absolute;
  left: 8px;
  top: 50%;
  width: 4px;
  height: 4px;
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

.pulse-b {
  animation-delay: 0.62s;
  width: 3px; height: 3px;
  top: 30%;
}

.pulse-c {
  animation-delay: 1.16s;
  width: 5px; height: 5px;
  top: 70%;
}

.slot-item {
  position: relative;
  width: 68px;
  height: 68px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background:
    linear-gradient(180deg, rgba(15, 22, 33, 0.92), rgba(8, 12, 18, 0.98));
  border: 1px solid rgba(148, 163, 184, 0.1);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.04),
    inset 0 -8px 14px rgba(0,0,0,0.22);
}

.node-input .slot-item {
  width: 58px;
  height: 58px;
}

.node-output .slot-item {
  width: 68px;
  height: 68px;
}

/* Micro-interactions (Premium feel) */
.magnetic-hover {
  transition: transform 0.5s cubic-bezier(0.2, 0.8, 0.2, 1), filter 0.5s ease;
  width: 100%;
  height: 100%;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
}

.node-input:hover .magnetic-hover {
  transform: translateY(-2px) scale(1.03);
  filter: drop-shadow(0 4px 8px rgba(0,0,0,0.6));
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

.node-input .item-icon {
  transform: translateX(1px);
}

.node-output .item-icon {
  transform: translateX(-1px);
}

/* Elegant Dissolve for Cycling (Not glitchy or fast) */
.dissolve-swap {
  animation: dissolve-in 0.8s cubic-bezier(0.4, 0, 0.2, 1);
}

/* Typography & Badges (Minimal, unboxed) */
.minimal-badge {
  position: absolute;
  background: rgba(10, 15, 23, 0.92);
  color: #b8c2cf;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.2px;
  border: 1px solid rgba(148, 163, 184, 0.12);
  border-radius: 999px;
  padding: 2px 6px;
  box-shadow: 0 4px 10px rgba(0,0,0,0.18);
  pointer-events: none;
}

.count-badge {
  right: 4px;
  bottom: 2px;
  transform: none;
}

.alt-badge {
  top: 4px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 10px;
}

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
  100% { opacity: 0; transform: translate(140px, -50%) scale(1.08); }
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
  .pill-track {
    width: 100%;
    height: 98px;
    padding: 8px 10px;
  }

  .track-node {
    width: 74px;
    height: 74px;
  }

  .node-input .slot-item {
    width: 50px;
    height: 50px;
  }

  .node-output .slot-item {
    width: 56px;
    height: 56px;
  }

  .ambient-orb-a,
  .ambient-orb-b,
  .ambient-orb-c {
    transform: scale(0.72);
  }
}
</style>
