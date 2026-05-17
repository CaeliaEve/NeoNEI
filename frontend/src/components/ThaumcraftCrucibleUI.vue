<script setup lang="ts">
import { computed, onMounted, ref, watch, onBeforeUnmount } from 'vue';
import { api, type Recipe } from '../services/api';
import type { UITypeConfig } from '../services/uiTypeMapping';
import { buildOutputSlots, parseAdditionalData, type ResolvedSlot } from '../composables/useRecipeSlots';
import {
  buildThaumcraftAspectCosts,
  collectRecipeItemStacks,
  getThaumcraftAspectImagePath,
  getThaumcraftAspectItemId,
  isThaumcraftAspectItem,
  mergeRecipeMetadata,
  type RitualAspectCost,
  type RitualItemStack,
} from '../composables/ritualFamilyMetadata';
import { useSound } from '../services/sound.service';
import RecipeItemTooltip from './RecipeItemTooltip.vue';
import AnimatedItemIcon from './AnimatedItemIcon.vue';

interface Props {
  recipe: Recipe;
  uiConfig?: UITypeConfig;
}

interface Emits {
  (e: 'item-click', itemId: string, options?: { tab?: 'usedIn' | 'producedBy' }): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();
const { playClick } = useSound();

const uiRoot = ref<HTMLElement | null>(null);
const bgCanvas = ref<HTMLCanvasElement | null>(null);
const catalyst = ref<RitualItemStack | null>(null);
const outputSlot = ref<ResolvedSlot | null>(null);
const aspectCosts = ref<RitualAspectCost[]>([]);

const mergedMetadata = computed(() => mergeRecipeMetadata(props.recipe));
const catalystItems = computed(() => (catalyst.value ? [catalyst.value] : []));

// Background Canvas Logic (NeoNEI Alignment)
let animFrameId = 0;
interface Star {
  x: number; y: number;
  vx: number; vy: number;
  radius: number; baseAlpha: number;
  phase: number; phaseSpeed: number;
}
const STAR_COUNT = 45;
const CONNECTION_DIST = 85;
let stars: Star[] = [];
let cW = 0; let cH = 0;
const resizeObserver = new ResizeObserver(() => handleCanvasResize());

const initStars = () => {
  stars = [];
  for (let i = 0; i < STAR_COUNT; i++) {
    stars.push({
      x: Math.random() * cW, y: Math.random() * cH,
      vx: (Math.random() - 0.5) * 0.15, vy: (Math.random() - 0.5) * 0.15,
      radius: 0.5 + Math.random() * 1.2, baseAlpha: 0.15 + Math.random() * 0.35,
      phase: Math.random() * Math.PI * 2, phaseSpeed: 0.003 + Math.random() * 0.008,
    });
  }
};

const drawConstellations = () => {
  const canvas = bgCanvas.value;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, cW, cH);
  const centerX = cW / 2; const centerY = cH / 2;
  const now = performance.now() * 0.001;

  for (const s of stars) {
    s.phase += s.phaseSpeed;
    s.x += s.vx + Math.sin(s.phase) * 0.08;
    s.y += s.vy + Math.cos(s.phase * 0.7) * 0.06;
    const dx = s.x - centerX; const dy = s.y - centerY;
    const dist = Math.sqrt(dx * dx + dy * dy) + 1;
    const orbit = 0.00045;
    s.vx += (-dy / dist) * orbit; s.vy += (dx / dist) * orbit;
    s.vx *= 0.996; s.vy *= 0.996;
    if (s.x < -20) s.x = cW + 20; if (s.x > cW + 20) s.x = -20;
    if (s.y < -20) s.y = cH + 20; if (s.y > cH + 20) s.y = -20;
  }

  for (let i = 0; i < stars.length; i++) {
    for (let j = i + 1; j < stars.length; j++) {
      const a = stars[i], b = stars[j];
      const d = Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
      if (d < CONNECTION_DIST) {
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = `rgba(217, 70, 239, ${(1 - d / CONNECTION_DIST) * 0.12})`;
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }
    }
  }

  for (const s of stars) {
    const tw = s.baseAlpha + Math.sin(now * 2 + s.phase) * 0.1;
    ctx.beginPath(); ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(34, 211, 238, ${tw})`; ctx.fill();
    if (s.radius > 1) {
      ctx.beginPath(); ctx.arc(s.x, s.y, s.radius * 3, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(34, 211, 238, ${tw * 0.15})`; ctx.fill();
    }
  }
  animFrameId = requestAnimationFrame(drawConstellations);
};

const handleCanvasResize = () => {
  const el = uiRoot.value; const canvas = bgCanvas.value;
  if (!el || !canvas) return;
  const rect = el.getBoundingClientRect();
  cW = rect.width; cH = rect.height;
  canvas.width = cW; canvas.height = cH;
  if (stars.length === 0) initStars();
};

function getRawInputSource(recipe: Recipe): unknown {
  const additional = parseAdditionalData(recipe);
  return additional?.rawIndexedInputs ?? recipe.inputs;
}

async function resolveItemName(item: RitualItemStack | null): Promise<RitualItemStack | null> {
  if (!item || item.localizedName?.trim()) return item;
  try {
    const detail = await api.getItem(item.itemId);
    return { ...item, localizedName: detail.localizedName };
  } catch {
    return item;
  }
}

async function initialize() {
  const rawInputSource = getRawInputSource(props.recipe);
  const stacks: RitualItemStack[] = [];
  collectRecipeItemStacks(rawInputSource, stacks);
  catalyst.value = await resolveItemName(
    stacks.find((item) => !isThaumcraftAspectItem(item.itemId, item.localizedName)) ?? null,
  );
  aspectCosts.value = buildThaumcraftAspectCosts(props.recipe, rawInputSource);
  const [output] = await buildOutputSlots(props.recipe, 1);
  outputSlot.value = output ?? null;
}

function handleItemClick(itemId: string) {
  playClick();
  emit('item-click', itemId);
}

function handleAspectClick(aspect: RitualAspectCost) {
  const itemId = getThaumcraftAspectItemId(aspect);
  if (itemId) {
    playClick();
    emit('item-click', itemId, { tab: 'producedBy' });
  }
}

onMounted(() => {
  void initialize();
  if (uiRoot.value) resizeObserver.observe(uiRoot.value);
  handleCanvasResize();
  animFrameId = requestAnimationFrame(drawConstellations);
});

onBeforeUnmount(() => {
  resizeObserver.disconnect();
  cancelAnimationFrame(animFrameId);
});

watch(
  () => props.recipe,
  () => {
    void initialize();
  },
  { deep: true },
);
</script>

<template>
  <div class="arcane-void-ui" ref="uiRoot" aria-label="Crucible Aggregate recipe card">
    <canvas ref="bgCanvas" class="constellation-canvas"></canvas>
    <div class="void-backdrop"></div>
    <div class="ambient-field">
      <div class="ambient-orb void-orb"></div>
      <div class="ambient-orb arcane-orb"></div>
    </div>

    <!-- The Mystic Deck (Geometric Flow) -->
    <div class="mystic-deck" aria-label="Crucible Aggregate crafting flow">
      
      <!-- Left: Catalyst Input -->
      <div class="input-array">
        <RecipeItemTooltip
          v-for="item in catalystItems"
          :key="item.itemId"
          :item-id="item.itemId"
          :count="item.count"
          @click="handleItemClick(item.itemId)"
        >
          <div class="slot-item magnetic-hover catalyst-lift">
            <AnimatedItemIcon :item-id="item.itemId" :size="48" class="item-icon" />
            <span v-if="item.count > 1" class="mystic-badge">{{ item.count }}</span>
          </div>
        </RecipeItemTooltip>
        <div v-if="catalystItems.length === 0" class="slot-item empty-slot catalyst-lift" />
      </div>

      <!-- Center: Sacred Crucible Core -->
      <div class="reaction-core">
        <div class="focal-thread"></div>
        <div class="celestial-pulse"></div>
        
        <div class="sacred-geometry-core" aria-hidden="true">
          <!-- Volumetric Rays (Furnace UI) -->
          <div class="volumetric-rays">
            <div class="light-ray ray-1"></div>
            <div class="light-ray ray-2"></div>
            <div class="light-ray ray-3"></div>
          </div>
          
          <!-- Expanding light waves -->
          <div class="light-wave wave-1"></div>
          <div class="light-wave wave-2"></div>
          
          <!-- High-order geometric crucible -->
          <svg class="crucible-svg" viewBox="0 0 200 200">
            <defs>
              <filter id="geo-glow" x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation="1.5" result="coloredBlur"/>
                <feMerge>
                  <feMergeNode in="coloredBlur"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
              <linearGradient id="geo-rite-primary" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stop-color="#cbd5e1" stop-opacity="0.6" />
                <stop offset="50%" stop-color="#94a3b8" stop-opacity="0.4" />
                <stop offset="100%" stop-color="#8b5cf6" stop-opacity="0.3" />
              </linearGradient>
              <radialGradient id="void-pool-grad">
                <stop offset="0%" stop-color="#04060a" stop-opacity="0.9" />
                <stop offset="80%" stop-color="#080c12" stop-opacity="0.7" />
                <stop offset="100%" stop-color="#8b5cf6" stop-opacity="0.2" />
              </radialGradient>
            </defs>
            <g class="geo-orbit-outer">
              <circle cx="100" cy="100" r="94" class="geo-line circle-outer" />
              <circle cx="100" cy="100" r="82" class="geo-line circle-rune" />
              <!-- Outer runic triangles -->
              <polygon points="100,6 181,147 19,147" class="geo-line tri-faint" />
              <polygon points="100,194 181,53 19,53" class="geo-line tri-faint" />
            </g>
            <g class="geo-orbit-middle">
              <circle cx="100" cy="100" r="62" class="geo-line circle-inner" />
              <!-- Inner heptagram/star -->
              <path d="M100 38 L127 88 L183 96 L142 136 L151 192 L100 165 L49 192 L58 136 L17 96 L73 88 Z" class="geo-line star-rite" />
            </g>
            <!-- The Void Pool (Center) -->
            <circle cx="100" cy="100" r="42" fill="url(#void-pool-grad)" class="geo-line void-edge" />
          </svg>

          <!-- Symmetrical Aspect Orbit on the outer ring -->
          <div class="aspect-orbit-ring" :style="{ '--aspect-count': aspectCosts.length }">
            <div 
              v-for="(aspect, index) in aspectCosts" 
              :key="`${aspect.name}-${aspect.hash || 'plain'}`"
              class="aspect-node-wrapper"
              :style="{ '--index': index }"
            >
              <RecipeItemTooltip 
                :item-id="getThaumcraftAspectItemId(aspect) || ''" 
                :count="aspect.amount"
                @click="handleAspectClick(aspect)"
              >
                <div class="aspect-node magnetic-hover" :class="{'is-clickable': Boolean(getThaumcraftAspectItemId(aspect))}">
                  <img :src="getThaumcraftAspectImagePath(aspect)" class="aspect-icon" @error="(e) => { (e.target as HTMLImageElement).src = '/placeholder.png'; }" />
                  <div class="aspect-value">{{ aspect.amount }}</div>
                </div>
              </RecipeItemTooltip>
            </div>
          </div>
        </div>

        <div class="focal-thread right-thread"></div>
      </div>

      <!-- Right: Product Output -->
      <div class="floating-output">
        <div class="output-void" :class="{ 'empty': !outputSlot }">
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
                :size="64"
                class="item-icon output-icon"
              />
              <span v-if="outputSlot.count > 1" class="mystic-badge">{{ outputSlot.count }}</span>
            </div>
          </RecipeItemTooltip>
        </div>
      </div>

    </div>
  </div>
</template>

<style scoped>
.arcane-void-ui {
  --arcane-primary: 34, 211, 238; /* Cyan */
  --arcane-secondary: 217, 70, 239; /* Magenta */
  --void-bg: rgba(6, 9, 14, 0.95);
  
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 580px;
  height: 100%;
  flex: 1;
  padding: 24px;
  background: transparent;
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif;
}

.constellation-canvas { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 1; }
.void-backdrop {
  position: absolute; inset: 0; border-radius: 18px;
  background:
    radial-gradient(ellipse at 50% 50%, rgba(var(--arcane-secondary), 0.04) 0%, transparent 50%),
    linear-gradient(180deg, rgba(8, 12, 18, 0.35), rgba(4, 6, 10, 0.55));
  pointer-events: none;
}
.ambient-field { position: absolute; inset: 0; overflow: hidden; pointer-events: none; z-index: 0; }
.ambient-orb {
  position: absolute; border-radius: 50%; opacity: 0.42; filter: blur(60px);
  will-change: transform, opacity; animation: ambientDrift 16s ease-in-out infinite alternate;
}
.void-orb { top: 15%; left: 25%; width: 260px; height: 260px; background: radial-gradient(circle, rgba(var(--arcane-secondary), 0.06) 0%, transparent 60%); }
.arcane-orb { right: 25%; bottom: 15%; width: 320px; height: 320px; background: radial-gradient(circle, rgba(var(--arcane-primary), 0.06) 0%, transparent 60%); animation-delay: -5s; }
@keyframes ambientDrift { 0% { transform: translate(0, 0); } 100% { transform: translate(30px, -30px); } }

/* Mystic Deck */
.mystic-deck {
  position: relative;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 80px;
  width: 100%;
  max-width: 1100px;
}

/* Slots matching StandardCrafting / Arcane */
.slot-item {
  position: relative;
  display: flex; align-items: center; justify-content: center;
  border-radius: 14px;
  background: linear-gradient(180deg, rgba(15, 22, 33, 0.88), rgba(8, 12, 18, 0.94));
  border: 1px solid rgba(148, 163, 184, 0.08);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.05), 0 4px 12px rgba(0,0,0,0.22);
}
.empty-slot { opacity: 0.3; }
.magnetic-hover { transition: transform 0.5s cubic-bezier(0.2, 0.8, 0.2, 1), filter 0.5s ease; cursor: pointer; }
.catalyst-lift { width: 72px; height: 72px; }
.output-lift { width: 96px; height: 96px; border-radius: 50%; }

.input-array:hover .magnetic-hover { transform: translateY(-1px) scale(1.03); filter: drop-shadow(0 3px 6px rgba(0,0,0,0.5)); border-color: rgba(var(--arcane-secondary), 0.3); }
.floating-output:hover .magnetic-hover { transform: translateY(-3px) scale(1.04); filter: drop-shadow(0 8px 14px rgba(var(--arcane-primary), 0.12)); border-color: rgba(var(--arcane-primary), 0.4); }

.item-icon { image-rendering: pixelated; object-fit: contain; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.4)); }

/* Badges */
.mystic-badge {
  position: absolute; right: -4px; bottom: -4px;
  background: rgba(10, 15, 23, 0.85); color: #e2e8f0;
  font-family: ui-monospace, SFMono-Regular, monospace; font-size: 11px; font-weight: 500;
  border: 1px solid rgba(148, 163, 184, 0.16); border-radius: 6px; padding: 3px 8px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.25); backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px);
}

/* Sacred Geometry Crucible Core */
.reaction-core {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 440px;
  height: 440px;
}

/* Focal Threads (1px connections) */
.focal-thread {
  position: absolute;
  top: 50%; left: -60px; right: 50%; height: 1px;
  background: linear-gradient(90deg, transparent, rgba(139, 92, 246, 0.4), rgba(34, 211, 238, 0.8));
  z-index: 1;
}
.right-thread {
  left: 50%; right: -60px;
  background: linear-gradient(90deg, rgba(34, 211, 238, 0.8), rgba(139, 92, 246, 0.4), transparent);
}

.celestial-pulse {
  position: absolute; top: 50%; left: -60px;
  width: 40px; height: 1px;
  background: linear-gradient(90deg, transparent, #fff, transparent);
  box-shadow: 0 0 10px #fff, 0 0 20px rgba(139, 92, 246, 0.8);
  animation: comet-pulse 2.5s cubic-bezier(0.4, 0, 0.2, 1) infinite;
  z-index: 2;
}
@keyframes comet-pulse { 0% { transform: translate(0, -50%); opacity: 0; } 20% { opacity: 1; } 80% { opacity: 1; } 100% { transform: translate(500px, -50%); opacity: 0; } }

.sacred-geometry-core {
  position: relative;
  z-index: 5;
  width: 380px; height: 380px;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Volumetric Rays */
.volumetric-rays {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 1;
}
.light-ray {
  position: absolute;
  top: 50%; left: 50%;
  width: 2px; height: 280px;
  background: linear-gradient(180deg, transparent, rgba(139, 92, 246, 0.15), transparent);
  transform-origin: top center;
  filter: blur(4px);
  animation: ray-spin 20s linear infinite;
}
.ray-1 { transform: translate(-50%, 0) rotate(0deg); }
.ray-2 { transform: translate(-50%, 0) rotate(120deg); animation-duration: 25s; animation-direction: reverse; }
.ray-3 { transform: translate(-50%, 0) rotate(240deg); background: linear-gradient(180deg, transparent, rgba(34, 211, 238, 0.1), transparent); }
@keyframes ray-spin { 0% { transform: translate(-50%, 0) rotate(0deg); } 100% { transform: translate(-50%, 0) rotate(360deg); } }

/* Light Waves */
.light-wave {
  position: absolute;
  top: 50%; left: 50%;
  width: 200px; height: 200px;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  border: 1px solid rgba(139, 92, 246, 0.15);
  box-shadow: 0 0 20px rgba(139, 92, 246, 0.1), inset 0 0 16px rgba(255, 255, 255, 0.05);
  animation: wave-emit 6s cubic-bezier(0.1, 0.7, 0.3, 1) infinite;
  opacity: 0;
  z-index: 2;
}
.wave-2 {
  animation-delay: 3s;
  border-color: rgba(34, 211, 238, 0.15);
  box-shadow: 0 0 20px rgba(34, 211, 238, 0.1);
}
@keyframes wave-emit {
  0% { width: 140px; height: 140px; opacity: 0; border-width: 1px; }
  20% { opacity: 0.6; }
  100% { width: 500px; height: 500px; opacity: 0; border-width: 0px; }
}

/* SVG Geometry */
.crucible-svg {
  width: 100%; height: 100%;
  overflow: visible;
  opacity: 0.95;
  shape-rendering: geometricPrecision;
  z-index: 3;
}

.geo-line {
  fill: none;
  stroke: rgba(148, 163, 184, 0.3);
  stroke-width: 0.5;
  vector-effect: non-scaling-stroke;
  filter: url(#geo-glow);
  stroke-linecap: round;
  stroke-linejoin: round;
}

.circle-outer { stroke: rgba(139, 92, 246, 0.4); stroke-width: 0.8; }
.circle-rune { stroke: rgba(34, 211, 238, 0.3); stroke-dasharray: 2 6; stroke-width: 0.6; }
.circle-inner { stroke: rgba(148, 163, 184, 0.2); stroke-dasharray: 8 4; stroke-width: 0.4; }
.tri-faint { stroke: rgba(100, 116, 139, 0.2); stroke-width: 0.4; }
.star-rite { stroke: url(#geo-rite-primary); stroke-width: 0.8; }
.void-edge { stroke: rgba(139, 92, 246, 0.4); stroke-width: 1; }

.geo-orbit-outer { transform-origin: 100px 100px; animation: geo-spin 80s linear infinite; }
.geo-orbit-middle { transform-origin: 100px 100px; animation: geo-spin 120s linear infinite reverse; }
@keyframes geo-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }

/* Aspect Orbit System */
.aspect-orbit-ring {
  position: absolute; inset: 0;
  pointer-events: none;
  z-index: 20;
}

.aspect-node-wrapper {
  position: absolute;
  top: 50%; left: 50%;
  /* 94 radius in SVG viewBox = 178.6px in actual size (94/100 * 190 = 178.6) */
  --angle: calc(360deg / var(--aspect-count) * var(--index));
  --radius: 178px;
  transform: 
    rotate(var(--angle)) 
    translateY(calc(-1 * var(--radius))) 
    rotate(calc(-1 * var(--angle))) 
    translate(-50%, -50%);
  pointer-events: auto;
}

.aspect-node {
  position: relative;
  width: 44px; height: 44px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 50%;
  background: radial-gradient(circle at 50% 0%, rgba(255,255,255,0.05), transparent 60%), rgba(12, 16, 24, 0.9);
  border: 1px solid rgba(139, 92, 246, 0.3);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.05), 0 4px 12px rgba(0,0,0,0.6), 0 0 12px rgba(139, 92, 246, 0.1);
  backdrop-filter: blur(12px);
  transition: all 0.4s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.aspect-node.is-clickable:hover {
  transform: translateY(-2px) scale(1.1);
  border-color: rgba(34, 211, 238, 0.8);
  box-shadow: inset 0 0 16px rgba(34, 211, 238, 0.3), 0 8px 24px rgba(0,0,0,0.8), 0 0 16px rgba(139, 92, 246, 0.4);
}

.aspect-icon { width: 26px; height: 26px; image-rendering: pixelated; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5)); }

.aspect-value {
  position: absolute; bottom: -8px;
  background: rgba(10, 15, 23, 0.95); color: #e2e8f0;
  font-family: ui-monospace, SFMono-Regular, monospace; font-size: 10px; font-weight: 800;
  border: 1px solid rgba(139, 92, 246, 0.4); border-radius: 8px; padding: 1px 6px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.6); backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px);
}

@media (max-width: 900px) {
  .mystic-deck { flex-direction: column; gap: 80px; }
  .focal-thread { width: 1px; height: 100px; left: 50%; right: auto; top: -80px; bottom: auto; background: linear-gradient(180deg, transparent, rgba(var(--arcane-secondary), 0.4), rgba(var(--arcane-primary), 0.8)); }
  .right-thread { top: auto; bottom: -80px; background: linear-gradient(180deg, rgba(var(--arcane-primary), 0.8), rgba(var(--arcane-primary), 0.4), transparent); }
  .celestial-pulse { display: none; }
}
</style>
