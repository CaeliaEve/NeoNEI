<script setup lang="ts">
import { computed, onMounted, ref, watch, onBeforeUnmount } from 'vue';
import type { Recipe } from '../services/api';
import type { UITypeConfig } from '../services/uiTypeMapping';
import { buildOutputSlots, parseAdditionalData, resolveRuntimeItemSummary, type ResolvedSlot } from '../composables/useRecipeSlots';
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

// === Constellation Particle System (from FurnaceUI) ===
let animFrameId = 0;
let resizeObs: ResizeObserver | null = null;
interface Star {
  x: number; y: number; vx: number; vy: number;
  radius: number; baseAlpha: number; phase: number; phaseSpeed: number;
}
const STAR_COUNT = 30;
const CONNECTION_DIST = 80;
let stars: Star[] = [];
let cW = 0; let cH = 0;

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
  const centerX = cW / 2;
  const centerY = cH / 2;
  const now = performance.now() * 0.001;

  for (const s of stars) {
    s.phase += s.phaseSpeed;
    s.x += s.vx + Math.sin(s.phase) * 0.08;
    s.y += s.vy + Math.cos(s.phase * 0.7) * 0.06;
    const dx = centerX - s.x;
    const dy = centerY - s.y;
    const dist = Math.sqrt(dx * dx + dy * dy) + 1;
    s.vx += (dx / dist) * 0.0003;
    s.vy += (dy / dist) * 0.0003;
    s.vx *= 0.999;
    s.vy *= 0.999;
    if (s.x < -20) s.x = cW + 20;
    if (s.x > cW + 20) s.x = -20;
    if (s.y < -20) s.y = cH + 20;
    if (s.y > cH + 20) s.y = -20;
  }

  for (let i = 0; i < stars.length; i++) {
    for (let j = i + 1; j < stars.length; j++) {
      const a = stars[i]; const b = stars[j];
      const d = Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
      if (d < CONNECTION_DIST) {
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = `rgba(148, 180, 220, ${(1 - d / CONNECTION_DIST) * 0.12})`;
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

const scale = ref(1);

const handleCanvasResize = () => {
  const el = uiRoot.value; const canvas = bgCanvas.value;
  if (!el || !canvas) return;
  const rect = el.getBoundingClientRect();
  cW = rect.width; cH = rect.height;
  canvas.width = cW; canvas.height = cH;
  if (stars.length === 0) initStars();

  // Dynamic proportional scaling based on an ideal width of 900px
  const idealWidth = 900;
  if (cW < idealWidth) {
    scale.value = Math.max(0.4, cW / idealWidth);
  } else {
    scale.value = 1;
  }
};

function getRawInputSource(recipe: Recipe): unknown {
  const additional = parseAdditionalData(recipe);
  return additional?.rawIndexedInputs ?? recipe.inputs;
}

async function resolveItemName(item: RitualItemStack | null): Promise<RitualItemStack | null> {
  if (!item || item.localizedName?.trim()) return item;
  const detail = await resolveRuntimeItemSummary(item.itemId);
  return detail?.localizedName ? { ...item, localizedName: detail.localizedName } : item;
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
  if (uiRoot.value) {
    resizeObs = new ResizeObserver(handleCanvasResize);
    resizeObs.observe(uiRoot.value);
  }
  handleCanvasResize();
  animFrameId = requestAnimationFrame(drawConstellations);
});

onBeforeUnmount(() => {
  if (resizeObs) resizeObs.disconnect();
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
  <div class="synthesis-ui" ref="uiRoot" aria-label="Crucible Floating recipe deck">
    
    <!-- Unified Matte Backdrop from FurnaceUI -->
    <div class="matte-backdrop" aria-hidden="true" />
    <canvas ref="bgCanvas" class="constellation-canvas" aria-hidden="true" />
    
    <div class="ambient-field" aria-hidden="true">
      <span class="ambient-orb ambient-orb-a" />
      <span class="ambient-orb ambient-orb-b" />
      <span class="ambient-orb ambient-orb-c" />
    </div>

    <!-- The Floating Deck Container -->
    <div class="synthesis-deck" :style="{ transform: `scale(${scale})` }">

      <!-- LEFT: FLOATING CATALYST -->
      <div class="floating-zone zone-left">
        <div class="zone-label lab-text">CATALYST</div>
        <div class="catalyst-anchor">
          <RecipeItemTooltip
            v-for="item in catalystItems"
            :key="item.itemId"
            :item-id="item.itemId"
            :count="item.count"
            @click="handleItemClick(item.itemId)"
          >
            <div class="slot-item magnetic-hover catalyst-lift">
              <AnimatedItemIcon :item-id="item.itemId" :size="48" class="item-icon" />
              <span v-if="item.count > 1" class="minimal-badge count-badge">{{ item.count }}</span>
            </div>
          </RecipeItemTooltip>
          <div v-if="catalystItems.length === 0" class="slot-item empty catalyst-lift" />
        </div>
        <!-- Metallic Thread connecting to center -->
        <div class="metallic-thread thread-left"></div>
      </div>

      <!-- CENTER: THE ALCHEMICAL HEAT MATRIX -->
      <div class="alchemical-matrix-stage">
        
        <!-- Boiling Heat Pool -->
        <div class="heat-pool"></div>
        
        <!-- Crepuscular Heat Rays -->
        <div class="volumetric-rays" aria-hidden="true">
          <span class="light-ray ray-1" />
          <span class="light-ray ray-2" />
          <span class="light-ray ray-3" />
          <span class="light-ray ray-4" />
        </div>

        <!-- Realistic Ancient Metallic SVG Array -->
        <svg class="alchemical-astrolabe" viewBox="0 0 400 400">
          <defs>
            <linearGradient id="metal-brass" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#fef3c7" stop-opacity="0.9" />
              <stop offset="50%" stop-color="#b45309" stop-opacity="0.6" />
              <stop offset="100%" stop-color="#78350f" stop-opacity="0.8" />
            </linearGradient>
            <linearGradient id="metal-steel" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stop-color="#e2e8f0" stop-opacity="0.5" />
              <stop offset="100%" stop-color="#475569" stop-opacity="0.7" />
            </linearGradient>
            <linearGradient id="heat-glow" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#f59e0b" stop-opacity="0.8" />
              <stop offset="100%" stop-color="#ea580c" stop-opacity="0.2" />
            </linearGradient>
            <filter id="matrix-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          
          <g class="orbit-outer-metal">
            <!-- Thick Brass Outer Containment Ring -->
            <circle cx="200" cy="200" r="180" fill="none" stroke="url(#metal-brass)" stroke-width="4" stroke-dasharray="8 4 2 4" />
            <circle cx="200" cy="200" r="172" fill="none" stroke="rgba(245, 158, 11, 0.4)" stroke-width="1" />
            <!-- Inner Steel Track -->
            <circle cx="200" cy="200" r="150" fill="none" stroke="url(#metal-steel)" stroke-width="2" />
            
            <!-- Etched Alchemy Geometry -->
            <polygon points="200,50 330,275 70,275" fill="none" stroke="url(#metal-brass)" stroke-width="2" />
            <polygon points="200,350 330,125 70,125" fill="none" stroke="url(#metal-brass)" stroke-width="2" />
          </g>

          <g class="orbit-inner-heat">
            <!-- Heat Energy Inner Matrix -->
            <circle cx="200" cy="200" r="110" fill="none" stroke="url(#heat-glow)" stroke-width="1.5" stroke-dasharray="10 6" filter="url(#matrix-glow)" />
            <circle cx="200" cy="200" r="95" fill="none" stroke="rgba(245, 158, 11, 0.6)" stroke-width="0.5" />
            
            <!-- Central Focal Square -->
            <rect x="135" y="135" width="130" height="130" fill="none" stroke="url(#metal-steel)" stroke-width="1.5" transform="rotate(45 200 200)" />
            <rect x="135" y="135" width="130" height="130" fill="none" stroke="url(#metal-brass)" stroke-width="1.5" transform="rotate(0 200 200)" />
          </g>
          
          <!-- Static Core Runes -->
          <g class="static-core">
            <circle cx="200" cy="200" r="70" fill="none" stroke="rgba(245, 158, 11, 0.3)" stroke-width="3" />
            <circle cx="200" cy="200" r="60" fill="none" stroke="url(#heat-glow)" stroke-width="1" filter="url(#matrix-glow)" />
          </g>
        </svg>

        <!-- Static Aspect Pedestal (Centered below the array) -->
        <div class="aspect-pedestal" v-if="aspectCosts.length > 0">
          <div 
            v-for="aspect in aspectCosts" 
            :key="`${aspect.name}-${aspect.hash || 'plain'}`"
            class="aspect-item-wrapper"
          >
            <RecipeItemTooltip 
              :item-id="getThaumcraftAspectItemId(aspect) || ''" 
              :count="aspect.amount"
              @click="handleAspectClick(aspect)"
            >
              <div class="slot-item aspect-slot magnetic-hover" :class="{'is-clickable': Boolean(getThaumcraftAspectItemId(aspect))}">
                <AnimatedItemIcon
                  v-if="getThaumcraftAspectItemId(aspect)"
                  :item-id="getThaumcraftAspectItemId(aspect) || ''"
                  :size="28"
                  class="aspect-icon"
                />
                <img
                  v-else
                  :src="getThaumcraftAspectImagePath(aspect)"
                  class="aspect-icon"
                  @error="(e) => { (e.target as HTMLImageElement).src = '/placeholder.png'; }"
                />
                <span class="minimal-badge aspect-badge">{{ aspect.amount }}</span>
              </div>
            </RecipeItemTooltip>
          </div>
        </div>
        
      </div>

      <!-- RIGHT: FLOATING OUTPUT -->
      <div class="floating-zone zone-right">
        <div class="metallic-thread thread-right"></div>
        <div class="zone-label lab-text">TRANSMUTATION</div>
        <div class="output-anchor" v-if="outputSlot">
          <RecipeItemTooltip
            :item-id="outputSlot.itemId"
            :count="outputSlot.count"
            @click="handleItemClick(outputSlot.itemId)"
          >
            <!-- Using FurnaceUI Output Slot Styling -->
            <div class="node-output magnetic-hover">
              <div class="slot-item output-lift">
                <AnimatedItemIcon
                  :item-id="outputSlot.itemId"
                  :render-asset-ref="outputSlot.renderAssetRef || null"
                  :image-file-name="outputSlot.imageFileName || null"
                  :size="72"
                  class="item-icon output-icon"
                />
              </div>
              <span v-if="outputSlot.count > 1" class="minimal-badge count-badge">x{{ outputSlot.count }}</span>
            </div>
          </RecipeItemTooltip>
        </div>
        <div class="output-name lab-text">{{ outputSlot?.localizedName || outputSlot?.itemId || '产物' }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Unified Variables with FurnaceUI */
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
  min-height: 540px;
  height: 100%;
  flex: 1;
  padding: 24px;
  background: transparent;
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif;
}

/* Background Layers identical to FurnaceUI */
.constellation-canvas {
  position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 1;
}

.matte-backdrop {
  position: absolute; inset: 0; border-radius: 18px;
  background:
    radial-gradient(circle at 50% 50%, rgba(59, 130, 246, 0.028) 0%, transparent 40%),
    linear-gradient(180deg, rgba(10, 15, 22, 0.28), rgba(8, 12, 18, 0.42));
  pointer-events: none;
}
.matte-backdrop::before {
  content: ''; position: absolute; inset: 0;
  background-image:
    linear-gradient(rgba(148, 163, 184, 0.035) 1px, transparent 1px),
    linear-gradient(90deg, rgba(148, 163, 184, 0.035) 1px, transparent 1px);
  background-size: 28px 28px; opacity: 0.42;
  mask-image: radial-gradient(ellipse at center, black 16%, transparent 72%);
}

.ambient-field { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
.ambient-orb {
  position: absolute; display: block; border-radius: 50%; opacity: 0.42; pointer-events: none;
  will-change: transform, opacity; animation: ambientDrift 14s ease-in-out infinite alternate;
}
.ambient-orb-a { top: 18%; left: 12%; width: 200px; height: 200px; background: radial-gradient(circle, rgba(96, 165, 250, 0.08) 0%, transparent 55%); }
.ambient-orb-b { right: 14%; bottom: 18%; width: 180px; height: 180px; background: radial-gradient(circle, rgba(var(--lab-heat), 0.07) 0%, transparent 55%); animation-delay: -4s; }
.ambient-orb-c { top: 42%; left: 50%; width: 140px; height: 140px; background: radial-gradient(circle, rgba(148, 163, 184, 0.06) 0%, transparent 55%); animation-delay: -8s; }

@keyframes ambientDrift {
  from { transform: translate3d(0, 0, 0) scale(0.96); opacity: 0.24; }
  to { transform: translate3d(6px, -8px, 0) scale(1.06); opacity: 0.42; }
}

/* Floating Deck Layout */
.synthesis-deck {
  position: relative;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  max-width: 1100px;
}

/* Typography */
.lab-text {
  font-size: 11px; letter-spacing: 0.3em; text-transform: uppercase;
  color: rgba(148, 163, 184, 0.6); font-weight: 600;
}

/* Floating Zones */
.floating-zone {
  position: relative; z-index: 10; display: flex; flex-direction: column; align-items: center; gap: 20px; width: 160px;
}

.metallic-thread {
  position: absolute; top: 50%; width: 150px; height: 1px;
  background: linear-gradient(90deg, transparent, rgba(148, 163, 184, 0.3), transparent);
  pointer-events: none; z-index: -1;
}
.thread-left { left: 100%; transform: translateY(-50%); }
.thread-right { right: 100%; transform: translateY(-50%); }

/* Slots (Reusing StandardCrafting/Furnace UI logic) */
.slot-item {
  position: relative;
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  background: linear-gradient(180deg, rgba(15, 22, 33, 0.92), rgba(8, 12, 18, 0.98));
  border: 1px solid rgba(148, 163, 184, 0.1);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.04), inset 0 -8px 14px rgba(0,0,0,0.22);
}
.slot-item.empty { opacity: 0.3; }
.catalyst-lift { width: 80px; height: 80px; }
.output-lift { width: 100px; height: 100px; }
.aspect-slot { width: 48px; height: 48px; border-radius: 12px; }

.magnetic-hover { transition: transform 0.5s cubic-bezier(0.2, 0.8, 0.2, 1), filter 0.5s ease; cursor: pointer; }
.magnetic-hover:hover { transform: translateY(-3px) scale(1.04); filter: drop-shadow(0 8px 14px rgba(var(--lab-heat), 0.12)); }

.item-icon { image-rendering: pixelated; filter: drop-shadow(0 4px 8px rgba(0,0,0,0.7)); }
.output-icon { filter: drop-shadow(0 0 15px rgba(var(--lab-heat), 0.5)); }

/* Badges */
.minimal-badge {
  position: absolute;
  background: rgba(10, 15, 23, 0.92); color: #b8c2cf;
  font-family: ui-monospace, SFMono-Regular, monospace; font-size: 10px; font-weight: 600;
  border: 1px solid rgba(148, 163, 184, 0.12); border-radius: 999px; padding: 2px 6px;
  box-shadow: 0 4px 10px rgba(0,0,0,0.18);
}
.count-badge { right: 0; bottom: 0; }
.aspect-badge { bottom: -8px; left: 50%; transform: translateX(-50%); font-size: 9px; }

.output-name { text-align: center; color: #f8fafc; font-size: 14px; margin-top: 10px; text-shadow: 0 0 10px rgba(245, 158, 11, 0.5); }

/* Output Node Container (FurnaceUI Match) */
.node-output {
  border-radius: 50%; position: relative; display: flex; align-items: center; justify-content: center;
  background: radial-gradient(circle at 50% 42%, rgba(35, 48, 66, 0.72), rgba(12, 17, 26, 0.58) 70%);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -12px 20px rgba(0,0,0,0.12),
              0 10px 24px rgba(0,0,0,0.24), 0 0 0 1px rgba(148, 163, 184, 0.08),
              0 0 42px rgba(var(--lab-heat), 0.04);
}
.node-output::before {
  content: ''; position: absolute; inset: -30px; border-radius: 50%;
  background: radial-gradient(circle, rgba(var(--lab-heat), 0.06) 0%, transparent 68%);
  z-index: -1; animation: heat-breathe 4s ease-in-out infinite alternate; pointer-events: none;
}
@keyframes heat-breathe { from { opacity: 0.5; transform: scale(0.9); } to { opacity: 1; transform: scale(1.05); } }

/* Center Matrix Stage */
.alchemical-matrix-stage {
  position: relative; z-index: 5;
  width: 480px; height: 480px;
  display: flex; align-items: center; justify-content: center;
}

.heat-pool {
  position: absolute; width: 220px; height: 220px; border-radius: 50%;
  background: radial-gradient(circle, rgba(var(--lab-heat), 0.15) 10%, rgba(15, 5, 25, 0.4) 50%, transparent 80%);
  box-shadow: 0 0 80px rgba(var(--lab-heat), 0.1), inset 0 0 40px rgba(0,0,0,1);
  animation: heat-breathe 6s ease-in-out infinite alternate;
}

/* Volumetric Rays (Furnace Match) */
.volumetric-rays { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 100%; height: 100%; pointer-events: none; z-index: 2; }
.light-ray {
  position: absolute; top: 50%; left: 50%; width: 4px; height: 180px; transform-origin: center bottom;
  background: linear-gradient(0deg, rgba(var(--lab-heat), 0.06), transparent 80%); opacity: 0;
  animation: ray-pulse 8s ease-in-out infinite;
}
.ray-1 { transform: translate(-50%, -100%) rotate(-45deg); animation-delay: 0s; }
.ray-2 { transform: translate(-50%, -100%) rotate(45deg); animation-delay: 2s; height: 140px; }
.ray-3 { transform: translate(-50%, -100%) rotate(135deg); animation-delay: 4.5s; height: 160px; }
.ray-4 { transform: translate(-50%, -100%) rotate(-135deg); animation-delay: 6s; height: 120px; }
@keyframes ray-pulse { 0%, 100% { opacity: 0; } 30% { opacity: 0.5; } 50% { opacity: 0.8; } 70% { opacity: 0.4; } }

/* Realistic Ancient SVG */
.alchemical-astrolabe {
  position: absolute; width: 400px; height: 400px; z-index: 6; pointer-events: none;
  filter: drop-shadow(0 10px 20px rgba(0,0,0,0.8));
}
.orbit-outer-metal { transform-origin: 200px 200px; animation: spin-metal 90s linear infinite; }
.orbit-inner-heat { transform-origin: 200px 200px; animation: spin-heat 60s linear infinite reverse; }
@keyframes spin-metal { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
@keyframes spin-heat { 0% { transform: rotate(0deg); } 100% { transform: rotate(-360deg); } }

/* Static Aspect Pedestal */
.aspect-pedestal {
  position: absolute;
  bottom: 0px; /* Positioned at the bottom of the center stage */
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  z-index: 20;
  background: rgba(8, 12, 18, 0.6);
  padding: 10px 18px;
  border-radius: 20px;
  border: 1px solid rgba(148, 163, 184, 0.1);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  box-shadow: 0 10px 20px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05);
}

.aspect-item-wrapper {
  position: relative;
}

.aspect-icon { width: 28px; height: 28px; image-rendering: pixelated; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.8)); }
</style>
