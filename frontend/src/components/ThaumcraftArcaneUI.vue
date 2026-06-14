<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch, nextTick } from 'vue';
import { getImageUrl, type Recipe, type RecipeInputCell } from '../services/api';
import type { UITypeConfig } from '../services/uiTypeMapping';
import { useSound } from '../services/sound.service';
import { buildOutputSlots, type ResolvedSlot } from '../composables/useRecipeSlots';
import {
  buildThaumcraftAspectCosts,
  mergeRecipeMetadata,
  type RitualAspectCost,
  type RitualItemStack,
  normalizeCount,
  getThaumcraftAspectImagePath,
  getThaumcraftAspectItemId,
  isThaumcraftAspectItem,
} from '../composables/ritualFamilyMetadata';
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

const craftingGrid = ref<Array<RitualItemStack | null>>(Array.from({ length: 9 }, () => null));
const outputSlot = ref<ResolvedSlot | null>(null);
const aspectCosts = ref<RitualAspectCost[]>([]);

// === Arcane Constellation Particle System ===
const bgCanvas = ref<HTMLCanvasElement | null>(null);
const uiRoot = ref<HTMLElement | null>(null);
let animFrameId = 0;
let resizeObs: ResizeObserver | null = null;

interface Star {
  x: number; y: number; vx: number; vy: number;
  radius: number; baseAlpha: number; phase: number; phaseSpeed: number;
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
      const a = stars[i], b = stars[j];
      const ddx = a.x - b.x, ddy = a.y - b.y;
      const d = Math.sqrt(ddx * ddx + ddy * ddy);
      if (d < CONNECTION_DIST) {
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        // Arcane Purple/Cyan tinted lines
        ctx.strokeStyle = `rgba(168, 120, 230, ${(1 - d / CONNECTION_DIST) * 0.12})`;
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }
    }
  }
  for (const s of stars) {
    const tw = s.baseAlpha + Math.sin(now * 2 + s.phase) * 0.1;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
    // Arcane Purple/Cyan tinted stars
    ctx.fillStyle = `rgba(192, 132, 252, ${tw})`;
    ctx.fill();
    if (s.radius > 1) {
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius * 3, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(34, 211, 238, ${tw * 0.15})`;
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
  cW = rect.width; cH = rect.height;
  canvas.width = cW; canvas.height = cH;
  if (stars.length === 0) initStars();
};

const mergedMetadata = computed(() => mergeRecipeMetadata(props.recipe));
const researchLines = computed(() => {
  const keys = ['research', 'researchKey', 'requiredResearch', 'research_name'];
  return keys
    .map((key) => mergedMetadata.value[key])
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .slice(0, 2);
});

function cellToItemStack(cell: RecipeInputCell): RitualItemStack | null {
  if (!cell) return null;
  if (Array.isArray(cell)) {
    const first = cell[0];
    return first
      ? {
          itemId: first.itemId,
          count: normalizeCount(first.count),
          localizedName: undefined,
          renderAssetRef: first.renderAssetRef ?? null,
          imageFileName: first.imageFileName ?? null,
        }
      : null;
  }
  return {
    itemId: cell.itemId,
    count: normalizeCount(cell.count),
    localizedName: undefined,
    renderAssetRef: cell.renderAssetRef ?? null,
    imageFileName: cell.imageFileName ?? null,
  };
}

function rawEntryToItemStack(entry: unknown): RitualItemStack | null {
  if (!entry || typeof entry !== 'object') return null;
  const record = entry as {
    slotIndex?: unknown;
    itemId?: unknown;
    count?: unknown;
    stackSize?: unknown;
    localizedName?: unknown;
    renderAssetRef?: unknown;
    imageFileName?: unknown;
    item?: { itemId?: unknown; localizedName?: unknown };
    items?: Array<{
      item?: { itemId?: unknown; localizedName?: unknown };
      itemId?: unknown;
      count?: unknown;
      stackSize?: unknown;
      localizedName?: unknown;
      renderAssetRef?: unknown;
      imageFileName?: unknown;
    }>;
  };
  const first = Array.isArray(record.items) ? record.items[0] : null;
  const itemId =
    (typeof record.itemId === 'string' && record.itemId) ||
    (typeof record.item?.itemId === 'string' && record.item.itemId) ||
    (typeof first?.itemId === 'string' && first.itemId) ||
    (typeof first?.item?.itemId === 'string' && first.item.itemId) ||
    '';
  if (!itemId) return null;

  return {
    itemId,
    count: normalizeCount(record.count ?? record.stackSize ?? first?.count ?? first?.stackSize),
    localizedName:
      (typeof record.localizedName === 'string' && record.localizedName) ||
      (typeof record.item?.localizedName === 'string' ? record.item.localizedName : undefined) ||
      (typeof first?.localizedName === 'string' ? first.localizedName : undefined) ||
      (typeof first?.item?.localizedName === 'string' ? first.item.localizedName : undefined),
    renderAssetRef:
      (typeof record.renderAssetRef === 'string' && record.renderAssetRef) ||
      (typeof first?.renderAssetRef === 'string' ? first.renderAssetRef : null) ||
      null,
    imageFileName:
      (typeof record.imageFileName === 'string' && record.imageFileName) ||
      (typeof first?.imageFileName === 'string' ? first.imageFileName : null) ||
      null,
    slotIndex: typeof record.slotIndex === 'number' ? record.slotIndex : undefined,
  } as RitualItemStack & { slotIndex?: number };
}

function buildCraftingGridFromIndexedRaw(rawInputs: unknown): Array<RitualItemStack | null> | null {
  if (!Array.isArray(rawInputs)) return null;
  const stacks = rawInputs
    .map((entry) => rawEntryToItemStack(entry))
    .filter((entry): entry is RitualItemStack & { slotIndex?: number } => Boolean(entry))
    .filter((entry) => !isThaumcraftAspectItem(entry.itemId, entry.localizedName));

  if (stacks.length === 0) return null;

  const grid = Array.from({ length: 9 }, () => null as RitualItemStack | null);
  const positioned = stacks
    .filter((entry) => typeof entry.slotIndex === 'number' && Number.isFinite(entry.slotIndex))
    .map((entry) => ({
      entry,
      x: Math.floor(Number(entry.slotIndex) / 100),
      y: Number(entry.slotIndex) % 100,
    }));

  const xs = Array.from(new Set(positioned.map((entry) => entry.x))).sort((a, b) => a - b);
  const ys = Array.from(new Set(positioned.map((entry) => entry.y))).sort((a, b) => a - b);
  if (positioned.length === stacks.length && xs.length <= 3 && ys.length <= 3) {
    for (const item of positioned) {
      const col = xs.indexOf(item.x);
      const row = ys.indexOf(item.y);
      if (row >= 0 && row < 3 && col >= 0 && col < 3) {
        grid[row * 3 + col] = item.entry;
      }
    }
    return grid;
  }

  const sorted = [...stacks].sort((a, b) => Number(a.slotIndex ?? 0) - Number(b.slotIndex ?? 0));
  for (let index = 0; index < Math.min(sorted.length, 9); index += 1) {
    grid[index] = sorted[index];
  }
  return grid;
}

function buildCraftingGrid(rawInputs: Recipe['inputs']): Array<RitualItemStack | null> {
  const grid = Array.from({ length: 9 }, () => null as RitualItemStack | null);
  if (!Array.isArray(rawInputs)) return grid;

  for (let row = 0; row < 3; row += 1) {
    const rowCells = Array.isArray(rawInputs[row]) ? rawInputs[row] : [];
    for (let col = 0; col < 3; col += 1) {
      grid[row * 3 + col] = cellToItemStack(rowCells[col] ?? null);
    }
  }

  return grid;
}


const aspectEntries = computed(() => {
  return aspectCosts.value.map((aspect) => ({ aspect }));
});

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

async function initialize() {
  const rawInputs = props.recipe.additionalData?.rawIndexedInputs ?? props.recipe.inputs;
  craftingGrid.value = buildCraftingGridFromIndexedRaw(rawInputs) ?? buildCraftingGrid(props.recipe.inputs);
  aspectCosts.value = buildThaumcraftAspectCosts(props.recipe, rawInputs);
  const [resolvedOutput] = await buildOutputSlots(props.recipe, 1);
  outputSlot.value = resolvedOutput ?? null;
}

onMounted(async () => {
  await initialize();
  await nextTick();
  handleCanvasResize();
  resizeObs = new ResizeObserver(handleCanvasResize);
  if (uiRoot.value) resizeObs.observe(uiRoot.value);
  animFrameId = requestAnimationFrame(drawConstellations);
});

onBeforeUnmount(() => {
  cancelAnimationFrame(animFrameId);
  if (resizeObs) resizeObs.disconnect();
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
  <div class="arcane-void-ui" ref="uiRoot">
    
    <!-- Canvas & Soft Background (No grid dots) -->
    <div class="void-backdrop" aria-hidden="true" />
    <canvas ref="bgCanvas" class="constellation-canvas" aria-hidden="true" />
    
    <!-- Massive mysterious ambient glow -->
    <div class="ambient-field" aria-hidden="true">
      <span class="ambient-orb void-orb" />
      <span class="ambient-orb arcane-orb" />
    </div>

    <!-- The floating deck, no borders, just soft shadows and flex layout -->
    <div class="mystic-deck">
      
      <!-- Research (Floating Left, no box) -->
      <div class="floating-research">
        <div class="research-title">ARCANE LORE</div>
        <div v-if="researchLines.length" class="research-lines">
          <span v-for="line in researchLines" :key="line" class="research-line">{{ line }}</span>
        </div>
        <div v-else class="research-lines muted">
          <span class="research-line">Uncharted Magic</span>
        </div>
      </div>

      <!-- Center Altar -->
      <div class="arcane-altar">
        
        <!-- Sacred Geometry Hexagram (replaces eclipse) -->
        <div class="sacred-geometry" aria-hidden="true">
          <!-- Expanding light waves -->
          <div class="light-wave wave-1"></div>
          <div class="light-wave wave-2"></div>
          
          <!-- High-order geometric astrolabe -->
          <svg class="hexagram-svg" viewBox="0 0 200 200">
            <defs>
              <filter id="geo-glow" x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation="1.25" result="coloredBlur"/>
                <feMerge>
                  <feMergeNode in="coloredBlur"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
              <linearGradient id="geo-rite-primary" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stop-color="#cbd5e1" stop-opacity="0.48" />
                <stop offset="52%" stop-color="#94a3b8" stop-opacity="0.34" />
                <stop offset="100%" stop-color="#8b5cf6" stop-opacity="0.24" />
              </linearGradient>
              <linearGradient id="geo-rite-arc" x1="0" y1="1" x2="1" y2="0">
                <stop offset="0%" stop-color="#64748b" stop-opacity="0.30" />
                <stop offset="56%" stop-color="#a5b4fc" stop-opacity="0.20" />
                <stop offset="100%" stop-color="#7c3aed" stop-opacity="0.18" />
              </linearGradient>
            </defs>
            <g class="geo-orbit-outer">
              <circle cx="100" cy="100" r="88" class="geo-line circle-line outer-bound" />
              <circle cx="100" cy="100" r="78" class="geo-line circle-rune" />
              <circle cx="100" cy="100" r="66" class="geo-line circle-inner" />
              <path d="M25 119 C47 55 101 26 158 51" class="geo-line arc-rite" />
              <path d="M43 158 C76 184 133 176 164 132" class="geo-line arc-rite arc-quiet" />
            </g>
            <g class="geo-orbit-middle">
              <polygon points="100,20 169,140 31,140" class="geo-line tri-up" />
              <polygon points="100,180 169,60 31,60" class="geo-line tri-down" />
              <circle cx="100" cy="100" r="47" class="geo-line inner-seal" />
            </g>
            <g class="geo-static">
              <path d="M100 27 L100 173" class="geo-axis axis-vertical" />
              <path d="M27 100 L173 100" class="geo-axis axis-horizontal" />
              <path d="M67 44 L67 156 M133 44 L133 156" class="geo-line pillar-lines" />
              <path d="M67 44 L133 100 L67 156" class="geo-line rite-fold" />
              <path d="M133 44 L67 100 L133 156" class="geo-line rite-fold fold-quiet" />
              <path d="M72 74 C87 62 113 62 128 74 M72 126 C88 138 113 138 128 126" class="geo-line inner-arches" />
            </g>
          </svg>
        </div>

        <!-- 3x3 Grid (Soft Dark Voids) -->
        <div class="void-matrix">
          <template v-for="(slot, index) in craftingGrid" :key="`arcane-grid-${index}`">
            <div class="void-slot" :class="{ 'empty': !slot }">
              <RecipeItemTooltip
                v-if="slot"
                :item-id="slot.itemId"
                :count="slot.count"
                @click="handleItemClick(slot.itemId)"
              >
                <div class="slot-item magnetic-hover">
                  <AnimatedItemIcon
                    :item-id="slot.itemId"
                    :render-asset-ref="slot.renderAssetRef || null"
                    :image-file-name="slot.imageFileName || null"
                    :size="58"
                    class="item-icon"
                  />
                  <span v-if="slot.count > 1" class="mystic-badge">{{ slot.count }}</span>
                </div>
              </RecipeItemTooltip>
            </div>
          </template>
        </div>

        <!-- Aspects Orbiting Around the Matrix -->
        <div class="aspect-constellation">
          <div
            v-for="(entry, index) in aspectEntries"
            :key="`${entry.aspect.name}-${entry.aspect.hash || 'plain'}`"
            class="aspect-star"
            :class="{ 'is-clickable': Boolean(getThaumcraftAspectItemId(entry.aspect)) }"
            :style="{ 
              '--accent': entry.aspect.color || '#8bdcff',
              '--angle': `${index * (360 / Math.max(1, aspectEntries.length))}deg`,
              '--radius': '254px'
            }"
            @click="handleAspectClick(entry.aspect)"
          >
            <AnimatedItemIcon
              v-if="getThaumcraftAspectItemId(entry.aspect)"
              :item-id="getThaumcraftAspectItemId(entry.aspect) || ''"
              :size="34"
              class="aspect-icon"
            />
            <img
              v-else
              :src="getThaumcraftAspectImagePath(entry.aspect)"
              class="aspect-icon"
              :alt="entry.aspect.name"
              @error="(e) => { (e.target as HTMLImageElement).src = '/placeholder.png'; }"
            />
            <span class="aspect-amount">{{ entry.aspect.amount }}</span>
          </div>
        </div>

      </div>

      <!-- Minimalist Armillary Bridge (High-end Ancient) -->
      <div class="armillary-bridge" aria-hidden="true">
        <!-- The pure focal thread -->
        <div class="focal-thread"></div>
        
        <div class="armillary-tunnel">
          <!-- Outer Ring (Lens) -->
          <div class="armillary-ring r-outer">
            <svg viewBox="0 0 100 100" class="ring-svg">
              <circle cx="50" cy="50" r="48" class="ring-track thin" />
              <circle cx="50" cy="50" r="42" class="ring-marks primary" stroke-dasharray="1 12" />
            </svg>
          </div>
          <!-- Center Ring (Core) -->
          <div class="armillary-ring r-core">
            <svg viewBox="0 0 100 100" class="ring-svg">
              <circle cx="50" cy="50" r="46" class="ring-track thin secondary" stroke-dasharray="4 4" />
              <circle cx="50" cy="50" r="38" class="ring-track primary" />
            </svg>
          </div>
          <!-- Inner Ring (Focus) -->
          <div class="armillary-ring r-inner">
            <svg viewBox="0 0 100 100" class="ring-svg">
              <circle cx="50" cy="50" r="48" class="ring-track thin" />
              <path d="M50,2 L50,8 M50,92 L50,98 M2,50 L8,50 M92,50 L98,50" class="ring-pointers primary" />
            </svg>
          </div>
        </div>

        <div class="celestial-pulse"></div>
      </div>

      <!-- Output (Floating Right) -->
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
                :size="84"
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
  --arcane-primary: 192, 132, 252;
  --arcane-secondary: 34, 211, 238;
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

/* Background & Canvas */
.constellation-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 1;
}

.void-backdrop {
  position: absolute;
  inset: 0;
  border-radius: 18px;
  background:
    radial-gradient(ellipse at 50% 50%, rgba(var(--arcane-primary), 0.04) 0%, transparent 50%),
    linear-gradient(180deg, rgba(8, 12, 18, 0.35), rgba(4, 6, 10, 0.55));
  pointer-events: none;
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
  border-radius: 50%;
  opacity: 0.42;
  will-change: transform, opacity;
  animation: ambientDrift 16s ease-in-out infinite alternate;
}

.void-orb {
  top: 15%; left: 25%;
  width: 260px; height: 260px;
  background: radial-gradient(circle, rgba(var(--arcane-secondary), 0.06) 0%, transparent 60%);
}

.arcane-orb {
  right: 25%; bottom: 15%;
  width: 320px; height: 320px;
  background: radial-gradient(circle, rgba(var(--arcane-primary), 0.06) 0%, transparent 60%);
  animation-delay: -5s;
}

/* The Mystic Deck (No borders, pure layout) */
.mystic-deck {
  position: relative;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 64px;
  width: 100%;
  max-width: 1100px;
}

/* Research text floating gracefully */
.floating-research {
  width: 180px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  text-shadow: 0 4px 12px rgba(0, 0, 0, 0.8);
}

.research-title {
  font-size: 13px;
  letter-spacing: 0.25em;
  color: rgba(var(--arcane-secondary), 0.9);
  font-weight: 700;
  text-transform: uppercase;
  text-shadow: 0 0 16px rgba(var(--arcane-secondary), 0.4);
}

.research-lines {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.research-line {
  font-size: 15px;
  line-height: 1.5;
  color: rgba(226, 232, 240, 0.95);
  font-family: ui-serif, Georgia, Cambria, "Times New Roman", Times, serif;
  font-style: italic;
}

.research-lines.muted .research-line {
  color: rgba(148, 163, 184, 0.6);
}

/* Center Altar */
.arcane-altar {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 380px;
  height: 380px;
}

/* Sacred Geometry Hexagram Background */
.sacred-geometry {
  position: absolute;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  width: 590px; height: 590px;
  pointer-events: none;
  z-index: -1;
  display: flex;
  align-items: center;
  justify-content: center;
  filter:
    drop-shadow(0 0 18px rgba(148, 163, 184, 0.10))
    drop-shadow(0 0 12px rgba(var(--arcane-primary), 0.06));
  opacity: 0.82;
}

.sacred-geometry::before {
  content: '';
  position: absolute;
  inset: 13%;
  border-radius: 50%;
  background:
    radial-gradient(circle at 50% 50%, rgba(255, 255, 255, 0.035) 0%, transparent 12%),
    conic-gradient(from 18deg, transparent 0deg, rgba(148, 163, 184, 0.070) 32deg, transparent 70deg, rgba(var(--arcane-primary), 0.042) 122deg, transparent 170deg, rgba(99, 102, 241, 0.035) 236deg, transparent 306deg, rgba(203, 213, 225, 0.035) 344deg, transparent 360deg);
  mask-image: radial-gradient(circle, transparent 0 31%, black 34% 60%, transparent 66%);
  animation: geo-spin 140s linear infinite reverse;
  opacity: 0.62;
}

.hexagram-svg {
  width: 100%; height: 100%;
  overflow: visible;
  opacity: 0.94;
  shape-rendering: geometricPrecision;
}

.geo-line {
  fill: none;
  stroke: rgba(148, 163, 184, 0.32);
  stroke-width: 0.42;
  vector-effect: non-scaling-stroke;
  filter: url(#geo-glow);
  stroke-linecap: round;
  stroke-linejoin: round;
}

.circle-line {
  stroke: rgba(203, 213, 225, 0.34);
  stroke-width: 0.54;
}

.outer-bound {
  stroke: rgba(71, 85, 105, 0.40);
}

.circle-rune {
  stroke: rgba(148, 163, 184, 0.20);
  stroke-width: 0.46;
  stroke-dasharray: 1.2 7.6;
  stroke-linecap: butt;
}

.circle-inner,
.inner-seal {
  stroke: rgba(139, 92, 246, 0.18);
  stroke-dasharray: 13 11;
}

.tri-up {
  stroke: url(#geo-rite-primary);
  stroke-width: 0.70;
}

.tri-down {
  stroke: rgba(100, 116, 139, 0.26);
  stroke-width: 0.54;
}

.arc-rite {
  stroke: url(#geo-rite-arc);
  stroke-width: 0.58;
}

.arc-quiet,
.fold-quiet {
  opacity: 0.52;
}

.arc-white {
  stroke: rgba(148, 163, 184, 0.24);
  stroke-width: 0.56;
}

.pillar-lines,
.rite-fold,
.inner-arches {
  stroke: rgba(100, 116, 139, 0.24);
  stroke-width: 0.34;
}

.inner-arches {
  stroke: rgba(165, 180, 252, 0.18);
  stroke-width: 0.30;
}

.geo-axis {
  fill: none;
  stroke: rgba(148, 163, 184, 0.22);
  stroke-width: 0.28;
  vector-effect: non-scaling-stroke;
  stroke-linecap: round;
}

.axis-faint {
  stroke: rgba(139, 92, 246, 0.14);
}

.geo-orbit-outer,
.geo-orbit-middle {
  transform-origin: 100px 100px;
}

.geo-orbit-outer {
  animation: geo-spin 128s linear infinite;
}

.geo-orbit-middle {
  animation: geo-spin 172s linear infinite reverse;
}

@keyframes geo-spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.light-wave {
  position: absolute;
  top: 50%; left: 50%;
  width: 210px; height: 210px;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  border: 1px solid rgba(148, 163, 184, 0.11);
  box-shadow:
    0 0 22px rgba(148, 163, 184, 0.08),
    inset 0 0 18px rgba(255, 255, 255, 0.045);
  animation: wave-emit 8s cubic-bezier(0.1, 0.7, 0.3, 1) infinite;
  opacity: 0;
}

.wave-2 { 
  animation-delay: 4s; 
  border-color: rgba(139, 92, 246, 0.08);
  box-shadow:
    0 0 26px rgba(139, 92, 246, 0.07),
    inset 0 0 18px rgba(var(--arcane-primary), 0.06);
}

@keyframes wave-emit {
  0% { width: 180px; height: 180px; opacity: 0; border-width: 1px; }
  18% { opacity: 0.56; }
  100% { width: 690px; height: 690px; opacity: 0; border-width: 0px; }
}

/* Void Matrix Grid */
.void-matrix {
  display: grid;
  grid-template-columns: repeat(3, 72px);
  grid-template-rows: repeat(3, 72px);
  gap: 16px;
  z-index: 2;
  margin-bottom: 42px;
}

.void-slot {
  width: 72px;
  height: 72px;
  border-radius: 20px;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  background: radial-gradient(circle at 50% 50%, rgba(12, 16, 24, 0.5) 0%, rgba(4, 6, 10, 0.8) 100%);
  box-shadow:
    inset 0 8px 16px rgba(0,0,0,0.8),
    inset 0 0 0 1px rgba(255,255,255,0.02),
    0 0 24px rgba(0,0,0,0.4);
  transition: transform 0.3s ease, box-shadow 0.3s ease;
}

.void-slot.empty {
  opacity: 0.35;
}

.void-slot:hover:not(.empty) {
  transform: translateY(-2px);
  box-shadow:
    inset 0 8px 16px rgba(0,0,0,0.8),
    inset 0 0 0 1px rgba(var(--arcane-secondary), 0.15),
    0 8px 24px rgba(var(--arcane-secondary), 0.12);
}

.slot-item {
  width: 100%; height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.item-icon {
  image-rendering: pixelated;
  filter: drop-shadow(0 4px 8px rgba(0,0,0,0.8));
}

.magnetic-hover {
  transition: transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1);
  cursor: pointer;
}

.void-slot:hover .magnetic-hover {
  transform: scale(1.06);
}

.mystic-badge {
  position: absolute;
  right: -2px; bottom: -2px;
  background: rgba(8, 12, 18, 0.9);
  color: #e2e8f0;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11px;
  font-weight: 500;
  border: 1px solid rgba(var(--arcane-secondary), 0.25);
  border-radius: 6px;
  padding: 2px 6px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.4), 0 0 8px rgba(var(--arcane-secondary), 0.15);
  pointer-events: none;
}

/* Aspects Orbiting Constellation */
.aspect-constellation {
  position: absolute;
  top: 50%; left: 50%;
  width: 1px; height: 1px;
  z-index: 3;
  pointer-events: none;
}

.aspect-star {
  position: absolute;
  top: 0; left: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  width: 64px;
  pointer-events: auto;
  /* Orbital transform calculation */
  transform: 
    rotate(var(--angle)) 
    translateY(calc(-1 * var(--radius))) 
    rotate(calc(-1 * var(--angle))) 
    translate(-50%, -50%);
}

.aspect-star.is-clickable {
  cursor: pointer;
}

.aspect-star.is-clickable:hover .aspect-icon {
  transform: translateY(-6px) scale(1.15);
  filter: drop-shadow(0 0 24px color-mix(in srgb, var(--accent) 80%, transparent));
}

.aspect-icon {
  width: 56px; height: 56px;
  image-rendering: pixelated;
  transition: transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1), filter 0.3s ease;
  filter: drop-shadow(0 0 16px color-mix(in srgb, var(--accent) 50%, transparent));
}

.aspect-amount {
  font-size: 16px;
  font-weight: 700;
  color: #fff;
  text-shadow: 0 2px 12px rgba(0, 0, 0, 1), 0 0 8px color-mix(in srgb, var(--accent) 60%, transparent);
}

/* Minimalist Armillary Bridge */
.armillary-bridge {
  width: 180px;
  height: 90px;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  perspective: 700px;
  z-index: 10;
  transform: translateX(45px);
}

.focal-thread {
  position: absolute;
  width: 100%;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(var(--arcane-secondary), 0.2), rgba(var(--arcane-primary), 0.5), transparent);
  box-shadow: 0 0 12px rgba(var(--arcane-primary), 0.6);
  opacity: 0.8;
}

.armillary-tunnel {
  position: absolute;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: space-evenly;
  transform-style: preserve-3d;
}

.armillary-ring {
  position: relative;
  transform-style: preserve-3d;
  transform: rotateY(70deg);
  filter: drop-shadow(0 0 12px rgba(var(--arcane-primary), 0.25));
}

.ring-svg {
  width: 100%;
  height: 100%;
  fill: none;
  overflow: visible;
  stroke-linecap: round;
}

/* Elegant, razor-thin styling */
.ring-track {
  stroke: rgba(148, 163, 184, 0.2);
  stroke-width: 1px;
}
.ring-track.thin {
  stroke-width: 0.5px;
}
.ring-track.primary {
  stroke: rgba(var(--arcane-primary), 0.6);
}
.ring-track.secondary {
  stroke: rgba(var(--arcane-secondary), 0.4);
}

.ring-marks {
  stroke: rgba(var(--arcane-primary), 0.8);
  stroke-width: 1px;
}

.ring-pointers {
  stroke: rgba(var(--arcane-primary), 0.9);
  stroke-width: 1.5px;
}

/* 3 Minimal Rings */
.r-outer { width: 75px; height: 75px; animation: spin-lens 24s linear infinite; }
.r-core { width: 90px; height: 90px; margin-left: -25px; margin-right: -25px; animation: spin-core 18s linear infinite reverse; }
.r-inner { width: 65px; height: 65px; animation: spin-focus 20s linear infinite; }

@keyframes spin-lens { 0% { transform: rotateY(70deg) rotateZ(0deg); } 100% { transform: rotateY(70deg) rotateZ(360deg); } }
@keyframes spin-core { 0% { transform: rotateY(75deg) rotateZ(360deg); } 100% { transform: rotateY(75deg) rotateZ(0deg); } }
@keyframes spin-focus { 0% { transform: rotateY(65deg) rotateZ(0deg) rotateX(10deg); } 100% { transform: rotateY(65deg) rotateZ(360deg) rotateX(10deg); } }

.celestial-pulse {
  position: absolute;
  left: 0;
  width: 20px;
  height: 2px;
  background: #fff;
  border-radius: 50%;
  box-shadow: 
    0 0 16px 4px rgba(255,255,255,0.8),
    0 0 32px 12px rgba(var(--arcane-primary), 0.8);
  animation: celestial-transit 4s cubic-bezier(0.4, 0, 0.2, 1) infinite;
  opacity: 0;
}

@keyframes celestial-transit {
  0% { transform: translateX(0) scaleX(0.2); opacity: 0; }
  25% { opacity: 1; transform: translateX(45px) scaleX(1); }
  75% { opacity: 1; transform: translateX(135px) scaleX(1.5); }
  100% { transform: translateX(180px) scaleX(0.2); opacity: 0; }
}

/* Output Void */
.floating-output {
  display: flex;
  align-items: center;
  justify-content: center;
}

.output-void {
  width: 120px; height: 120px;
  border-radius: 50%;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  background: radial-gradient(circle at 50% 50%, rgba(16, 20, 28, 0.6) 0%, rgba(4, 6, 10, 0.85) 100%);
  box-shadow:
    inset 0 8px 24px rgba(0,0,0,0.9),
    inset 0 0 0 1px rgba(var(--arcane-primary), 0.1),
    0 0 32px rgba(0,0,0,0.6);
  transition: box-shadow 0.4s ease;
}

.output-void::before {
  content: '';
  position: absolute;
  inset: -30px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(var(--arcane-primary), 0.12) 0%, rgba(var(--arcane-secondary), 0.05) 40%, transparent 70%);
  z-index: -1;
  pointer-events: none;
  animation: outputPulse 4s ease-in-out infinite alternate;
}

.output-void.empty {
  opacity: 0.35;
}

.output-void:hover:not(.empty) {
  box-shadow:
    inset 0 8px 24px rgba(0,0,0,0.9),
    inset 0 0 0 1px rgba(var(--arcane-primary), 0.25),
    0 0 42px rgba(var(--arcane-primary), 0.18);
}

.output-lift {
  width: 100%; height: 100%;
}

.output-void:hover .magnetic-hover {
  transform: scale(1.08) translateY(-4px);
  filter: drop-shadow(0 12px 24px rgba(var(--arcane-primary), 0.25));
}

@keyframes ambientDrift {
  from { transform: translate3d(0, 0, 0) scale(0.96); opacity: 0.24; }
  to { transform: translate3d(6px, -8px, 0) scale(1.06); opacity: 0.42; }
}

@keyframes outputPulse {
  from { transform: scale(0.9); opacity: 0.6; }
  to { transform: scale(1.05); opacity: 1; }
}

@media (max-width: 1080px) {
  .mystic-deck {
    flex-direction: column;
    gap: 48px;
    padding-top: 40px;
  }
  .floating-research {
    width: auto;
    text-align: center;
  }
  .void-gap {
    transform: rotate(90deg);
  }
}
</style>
