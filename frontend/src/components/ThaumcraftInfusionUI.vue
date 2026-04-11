<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { api, getImageUrl, type Recipe } from '../services/api';
import type { UITypeConfig } from '../services/uiTypeMapping';
import { useSound } from '../services/sound.service';
import { buildOutputSlots, parseAdditionalData, type ResolvedSlot } from '../composables/useRecipeSlots';
import {
  buildThaumcraftAspectCosts,
  collectRecipeItemStacks,
  getThaumcraftAspectImagePath,
  mergeRecipeMetadata,
  type RitualAspectCost,
  type RitualItemStack,
  isThaumcraftAspectItem,
  normalizeCount,
} from '../composables/ritualFamilyMetadata';
import RecipeItemTooltip from './RecipeItemTooltip.vue';

interface Props {
  recipe: Recipe;
  uiConfig?: UITypeConfig;
}

interface Emits {
  (e: 'item-click', itemId: string): void;
}

interface IndexedInputEntry {
  slotIndex?: number;
  itemId?: string;
  count?: number;
  stackSize?: number;
  localizedName?: string;
  item?: { itemId?: string; localizedName?: string };
  items?: Array<{
    item?: { itemId?: string; localizedName?: string };
    itemId?: string;
    count?: number;
    stackSize?: number;
    localizedName?: string;
  }>;
}

interface RitualLayoutItem extends RitualItemStack {
  slotIndex?: number;
  rawX?: number | null;
  rawY?: number | null;
}

interface PositionedIngredient {
  item: RitualLayoutItem;
  style: { left: string; top: string; width: string; height: string };
  angle: number;
}

const ALTAR_SIZE = 352;
const ALTAR_RING_INSET = 39;
const SLOT_SIZE = 44;
const HALF_SLOT = SLOT_SIZE / 2;
const ALTAR_CENTER_X = ALTAR_SIZE / 2;
const ALTAR_CENTER_Y = ALTAR_SIZE / 2;
const ALTAR_RADIUS = 118;

const props = defineProps<Props>();
const emit = defineEmits<Emits>();
const { playClick } = useSound();

const centerItem = ref<RitualLayoutItem | null>(null);
const ingredientLayout = ref<PositionedIngredient[]>([]);
const outputSlot = ref<ResolvedSlot | null>(null);
const aspectCosts = ref<RitualAspectCost[]>([]);
const instability = ref<number | null>(null);

const mergedMetadata = computed(() => mergeRecipeMetadata(props.recipe));
const researchLines = computed(() => {
  const keys = ['research', 'researchKey', 'requiredResearch', 'research_name'];
  return keys
    .map((key) => mergedMetadata.value[key])
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .slice(0, 2);
});
const machineLabel = computed(() => {
  const raw = props.recipe.machineInfo?.machineType?.trim() || '';
  return raw && !raw.includes('�') ? raw : '奥术注魔';
});
const primaryOutputId = computed(() => {
  const first = Array.isArray(props.recipe.outputs) ? props.recipe.outputs[0] : null;
  if (!first || typeof first !== 'object') return null;
  const record = first as Record<string, unknown>;
  const nested = typeof record.item === 'object' && record.item !== null
    ? (record.item as Record<string, unknown>)
    : null;
  const itemId = typeof record.itemId === 'string'
    ? record.itemId
    : typeof nested?.itemId === 'string'
      ? nested.itemId
      : null;
  return itemId && itemId.trim() ? itemId.trim() : null;
});
const centerItemLabel = computed(() => centerItem.value?.localizedName || centerItem.value?.itemId || '未识别');
const outputLabel = computed(() => outputSlot.value?.localizedName || outputSlot.value?.itemId || '配方产物');
const ritualStats = computed(() => [
  { label: '祭坛材料', value: String(ingredientLayout.value.length) },
  { label: '要素种类', value: String(aspectCosts.value.length) },
  { label: '不稳定度', value: instability.value === null ? '未导出' : String(instability.value) },
]);
const centerStyle = computed(() => {
  const centerSize = 52;
  return {
    left: '50%',
    top: '50%',
    width: `${centerSize}px`,
    height: `${centerSize}px`,
    transform: 'translate(-50%, -50%)',
  };
});

function slotStyle(left: number, top: number, size = SLOT_SIZE) {
  return {
    left: `${Math.round(ALTAR_RING_INSET + left)}px`,
    top: `${Math.round(ALTAR_RING_INSET + top)}px`,
    width: `${size}px`,
    height: `${size}px`,
  };
}

function decodeSlotCoordinates(slotIndex: number | undefined): { rawX: number; rawY: number } | null {
  if (typeof slotIndex !== 'number' || !Number.isFinite(slotIndex) || slotIndex < 0) {
    return null;
  }

  const rawX = Math.floor(slotIndex / 100);
  const rawY = slotIndex % 100;
  if (rawX > 120 || rawY > 120) {
    return null;
  }

  return { rawX, rawY };
}

function resolveIndexedInput(entry: IndexedInputEntry): RitualLayoutItem | null {
  const directItemId = typeof entry.itemId === 'string' ? entry.itemId : null;
  const nestedItemId =
    entry.item && typeof entry.item.itemId === 'string' ? entry.item.itemId : null;
  const firstCandidate = Array.isArray(entry.items) ? entry.items[0] : null;
  const listItemId =
    firstCandidate && typeof firstCandidate.itemId === 'string'
      ? firstCandidate.itemId
      : firstCandidate && firstCandidate.item && typeof firstCandidate.item.itemId === 'string'
        ? firstCandidate.item.itemId
        : null;

  const itemId = directItemId || nestedItemId || listItemId;
  if (!itemId) return null;

  const localizedName =
    (typeof entry.localizedName === 'string' && entry.localizedName) ||
    (entry.item && typeof entry.item.localizedName === 'string' ? entry.item.localizedName : undefined) ||
    (firstCandidate && typeof firstCandidate.localizedName === 'string' ? firstCandidate.localizedName : undefined) ||
    (firstCandidate && firstCandidate.item && typeof firstCandidate.item.localizedName === 'string'
      ? firstCandidate.item.localizedName
      : undefined);

  const count = normalizeCount(
    entry.count ??
      entry.stackSize ??
      firstCandidate?.count ??
      firstCandidate?.stackSize,
  );

  const coords = decodeSlotCoordinates(typeof entry.slotIndex === 'number' ? entry.slotIndex : undefined);

  return {
    itemId,
    count,
    localizedName,
    slotIndex: typeof entry.slotIndex === 'number' ? entry.slotIndex : undefined,
    rawX: coords?.rawX ?? null,
    rawY: coords?.rawY ?? null,
  };
}

function extractIndexedInfusionInputs(source: unknown): RitualLayoutItem[] {
  if (!Array.isArray(source)) return [];
  const entries = source as IndexedInputEntry[];
  if (!entries.length) return [];

  return entries
    .filter((entry) => typeof entry === 'object' && entry !== null)
    .sort(
      (a, b) =>
        Number(a.slotIndex ?? Number.MAX_SAFE_INTEGER)
        - Number(b.slotIndex ?? Number.MAX_SAFE_INTEGER),
    )
    .map((entry) => resolveIndexedInput(entry))
    .filter((entry): entry is RitualLayoutItem => Boolean(entry));
}

async function resolveItemNames(items: RitualLayoutItem[]): Promise<RitualLayoutItem[]> {
  return Promise.all(
    items.map(async (item) => {
      if (item.localizedName && item.localizedName.trim()) {
        return item;
      }
      try {
        const detail = await api.getItem(item.itemId);
        return { ...item, localizedName: detail.localizedName };
      } catch {
        return item;
      }
    }),
  );
}

function getRingRadius(itemCount: number): number {
  if (itemCount <= 0) return ALTAR_RADIUS;
  if (itemCount <= 8) return ALTAR_RADIUS - 8;
  if (itemCount <= 12) return ALTAR_RADIUS + 4;
  return ALTAR_RADIUS + Math.min(18, (itemCount - 12) * 2);
}

function buildCircularLayout(items: RitualLayoutItem[], startAngle = -Math.PI / 2): PositionedIngredient[] {
  if (items.length === 0) return [];

  const radius = getRingRadius(items.length);
  const step = (Math.PI * 2) / Math.max(items.length, 1);

  return items.map((item, index) => {
    const angle = startAngle + index * step;
    return {
      item,
      angle,
      style: slotStyle(
        ALTAR_CENTER_X + Math.cos(angle) * radius - HALF_SLOT,
        ALTAR_CENTER_Y + Math.sin(angle) * radius - HALF_SLOT,
      ),
    };
  });
}

function inferCenterItem(items: RitualLayoutItem[]): RitualLayoutItem | null {
  if (items.length === 0) return null;

  // NESQL++ preserves NEI's infusion ingredient order: center catalyst first,
  // followed by pedestal components and aspect stacks.
  return items[0] ?? null;
}

function selectCenterItem(
  items: RitualLayoutItem[],
  metadata: Record<string, unknown>,
): RitualLayoutItem | null {
  const centerSlotIndex = Number(metadata.centerInputSlotIndex);
  if (Number.isFinite(centerSlotIndex)) {
    const bySlot = items.find((item) => item.slotIndex === Math.floor(centerSlotIndex));
    if (bySlot) return bySlot;
  }

  const centerItemId = typeof metadata.centralItemId === 'string' ? metadata.centralItemId.trim() : '';
  if (centerItemId) {
    const byId = items.find((item) => item.itemId === centerItemId);
    if (byId) return byId;
  }

  return inferCenterItem(items);
}

function orderRingItems(
  items: RitualLayoutItem[],
  metadata: Record<string, unknown>,
): RitualLayoutItem[] {
  const componentOrder = Array.isArray(metadata.componentSlotOrder)
    ? metadata.componentSlotOrder.filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
    : [];

  if (componentOrder.length === 0) {
    return items;
  }

  const bySlot = new Map(items.map((item) => [item.slotIndex, item] as const));
  const ordered: RitualLayoutItem[] = [];
  const seen = new Set<RitualLayoutItem>();

  for (const slotIndex of componentOrder) {
    const item = bySlot.get(Math.floor(slotIndex));
    if (item && !seen.has(item)) {
      ordered.push(item);
      seen.add(item);
    }
  }

  for (const item of items) {
    if (!seen.has(item)) {
      ordered.push(item);
      seen.add(item);
    }
  }

  return ordered;
}

function buildLayoutFromCoordinates(
  items: RitualLayoutItem[],
  metadata: Record<string, unknown>,
): {
  center: RitualLayoutItem | null;
  ring: PositionedIngredient[];
} {
  const center = selectCenterItem(items, metadata);
  const ringItems = orderRingItems(center ? items.filter((item) => item !== center) : items, metadata);

  return {
    center,
    ring: buildCircularLayout(ringItems),
  };
}

function handleItemClick(itemId: string) {
  playClick();
  emit('item-click', itemId);
}

async function initialize() {
  const additional = parseAdditionalData(props.recipe);
  const metadata = mergeRecipeMetadata(props.recipe);
  const rawSource = (additional?.rawIndexedInputs as unknown) ?? props.recipe.inputs;
  const indexedInputs = extractIndexedInfusionInputs(rawSource);
  const rawInputs: RitualLayoutItem[] = indexedInputs.length > 0 ? indexedInputs : [];

  if (rawInputs.length === 0) {
    collectRecipeItemStacks(rawSource, rawInputs);
  }

  const nonAspectInputs = rawInputs.filter((item) => !isThaumcraftAspectItem(item.itemId, item.localizedName));
  const resolved = await resolveItemNames(nonAspectInputs);
  const layout = buildLayoutFromCoordinates(resolved, metadata);

  centerItem.value = layout.center;
  ingredientLayout.value = layout.ring;
  aspectCosts.value = buildThaumcraftAspectCosts(props.recipe, rawSource);

  const [output] = await buildOutputSlots(props.recipe, 1);
  outputSlot.value = output ?? null;

  const rawInstability = Number(metadata.instability ?? additional?.stability ?? additional?.instability);
  instability.value = Number.isFinite(rawInstability) ? Math.floor(rawInstability) : null;
}

onMounted(() => {
  void initialize();
});

watch(
  () => props.recipe,
  () => {
    void initialize();
  },
  { deep: true },
);

const aspectEntries = computed(() => {
  return aspectCosts.value.map((aspect) => ({
    aspect,
    accent: aspect.color || '#8bdcff',
  }));
});
</script>

<template>
  <div class="infusion-shell">
    <section class="info-card left-card">
      <div class="card-kicker">RITUAL PROFILE</div>
      <h3 class="card-title">{{ machineLabel }}</h3>
      <div class="research-panel">
        <div class="panel-label">研究需求</div>
        <div v-if="researchLines.length" class="research-lines">
          <span v-for="line in researchLines" :key="line" class="research-line">{{ line }}</span>
        </div>
        <div v-else class="research-lines muted">
          <span class="research-line">Infusion Study</span>
        </div>
      </div>
      <div class="stats-grid">
        <div v-for="entry in ritualStats" :key="entry.label" class="stat-chip">
          <span class="stat-label">{{ entry.label }}</span>
          <strong class="stat-value">{{ entry.value }}</strong>
        </div>
      </div>
      <div class="focus-summary">
        <div class="summary-label">中心催化</div>
        <div class="summary-value">{{ centerItemLabel }}</div>
      </div>
    </section>

    <section class="altar-stage">
      <div class="stage-header">
        <div class="header-pill">Infusion Matrix</div>
        <div class="header-pill accent-pill">NeoNEI Ritual View</div>
      </div>

      <div class="result-lane" v-if="outputSlot && primaryOutputId">
        <div class="result-connector" aria-hidden="true" />
        <RecipeItemTooltip
          :item-id="primaryOutputId"
          :count="outputSlot.count"
          @click="handleItemClick(primaryOutputId)"
        >
          <div class="result-slot">
            <img
              :src="getImageUrl(primaryOutputId)"
              class="item-icon result-icon"
              @error="(e) => { (e.target as HTMLImageElement).src = '/placeholder.png'; }"
            />
            <span v-if="outputSlot.count > 1" class="count">{{ outputSlot.count }}</span>
          </div>
        </RecipeItemTooltip>
      </div>

      <div class="altar-board">
        <div class="altar-rings" aria-hidden="true">
          <div class="ring ring-outer" />
          <div class="ring ring-middle" />
          <div class="ring ring-inner" />
          <div class="crosshair crosshair-h" />
          <div class="crosshair crosshair-v" />
        </div>

        <div
          v-for="entry in ingredientLayout"
          :key="`infusion-${entry.item.itemId}-${entry.style.left}-${entry.style.top}`"
          class="slot-anchor"
          :style="entry.style"
        >
          <RecipeItemTooltip
            :item-id="entry.item.itemId"
            :count="entry.item.count"
            @click="handleItemClick(entry.item.itemId)"
          >
            <div class="slot pedestal-slot slot-fill">
              <img
                :src="getImageUrl(entry.item.itemId)"
                class="item-icon"
                @error="(e) => { (e.target as HTMLImageElement).src = '/placeholder.png'; }"
              />
              <span v-if="entry.item.count > 1" class="count">{{ entry.item.count }}</span>
            </div>
          </RecipeItemTooltip>
        </div>

        <div v-if="centerItem" class="slot-anchor center-anchor" :style="centerStyle">
          <RecipeItemTooltip
            :item-id="centerItem.itemId"
            :count="centerItem.count"
            @click="handleItemClick(centerItem.itemId)"
          >
            <div class="slot center-slot slot-fill">
              <img
                :src="getImageUrl(centerItem.itemId)"
                class="item-icon center-icon"
                @error="(e) => { (e.target as HTMLImageElement).src = '/placeholder.png'; }"
              />
              <span v-if="centerItem.count > 1" class="count">{{ centerItem.count }}</span>
            </div>
          </RecipeItemTooltip>
        </div>
        <div v-else class="slot-anchor center-anchor" :style="centerStyle">
          <div class="slot center-slot empty-slot slot-fill" />
        </div>
      </div>
    </section>

    <section class="info-card right-card">
      <div class="card-kicker">OUTPUT</div>
      <h3 class="card-title output-title">{{ outputLabel }}</h3>

      <div class="aspects-panel">
        <div class="panel-label">ASPECT COST</div>
        <div class="aspect-stack">
          <div
            v-for="entry in aspectEntries"
            :key="`${entry.aspect.name}-${entry.aspect.hash || 'plain'}`"
            class="aspect-row"
            :style="{ '--accent': entry.accent }"
          >
            <div class="aspect-main">
              <img
                :src="getThaumcraftAspectImagePath(entry.aspect)"
                class="aspect-icon"
                :alt="entry.aspect.name"
                @error="(e) => { (e.target as HTMLImageElement).src = '/placeholder.png'; }"
              />
              <span class="aspect-name">{{ entry.aspect.name }}</span>
            </div>
            <strong class="aspect-amount">{{ entry.aspect.amount }}</strong>
          </div>
        </div>
      </div>

      <div class="instability-card" :class="{ 'is-muted': instability === null }">
        <span class="instability-label">不稳定度</span>
        <strong class="instability-value">{{ instability === null ? '未导出' : instability }}</strong>
      </div>
    </section>
  </div>
</template>

<style scoped>
.infusion-shell {
  display: grid;
  grid-template-columns: minmax(220px, 260px) minmax(380px, 1fr) minmax(220px, 260px);
  gap: 18px;
  align-items: stretch;
  width: 100%;
  max-width: 1160px;
  margin: 0 auto;
  padding: 10px 0 6px;
}

.info-card,
.altar-stage {
  position: relative;
  overflow: hidden;
  border-radius: 20px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  background:
    linear-gradient(180deg, rgba(10, 16, 28, 0.96), rgba(6, 10, 18, 0.98)),
    radial-gradient(circle at top, rgba(34, 211, 238, 0.08), transparent 42%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.04),
    0 16px 42px rgba(2, 8, 23, 0.32);
}

.info-card::before,
.altar-stage::before {
  content: '';
  position: absolute;
  inset: 12px;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.04);
  pointer-events: none;
}

.info-card {
  padding: 22px 18px 18px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.left-card {
  background:
    linear-gradient(180deg, rgba(9, 15, 28, 0.98), rgba(6, 10, 18, 0.98)),
    radial-gradient(circle at top left, rgba(56, 189, 248, 0.1), transparent 44%);
}

.right-card {
  background:
    linear-gradient(180deg, rgba(12, 16, 30, 0.98), rgba(6, 10, 18, 0.98)),
    radial-gradient(circle at top right, rgba(168, 85, 247, 0.1), transparent 42%);
}

.card-kicker {
  position: relative;
  z-index: 1;
  font-size: 11px;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: rgba(125, 211, 252, 0.74);
}

.card-title {
  position: relative;
  z-index: 1;
  margin: 0;
  font-size: 20px;
  line-height: 1.25;
  color: #eef6ff;
}

.output-title {
  color: #f5e9ff;
}

.research-panel,
.aspects-panel,
.focus-summary,
.instability-card {
  position: relative;
  z-index: 1;
  padding: 14px;
  border-radius: 16px;
  border: 1px solid rgba(148, 163, 184, 0.14);
  background: rgba(9, 15, 27, 0.72);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
}

.panel-label,
.summary-label,
.instability-label,
.stat-label {
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(148, 163, 184, 0.72);
}

.research-lines {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 10px;
}

.research-line,
.summary-value,
.aspect-name {
  color: rgba(226, 232, 240, 0.92);
}

.research-lines.muted .research-line {
  color: rgba(148, 163, 184, 0.68);
}

.stats-grid {
  position: relative;
  z-index: 1;
  display: grid;
  gap: 10px;
}

.stat-chip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid rgba(148, 163, 184, 0.14);
  background: rgba(12, 18, 31, 0.68);
}

.stat-value,
.instability-value,
.aspect-amount {
  color: #f8fbff;
  font-size: 17px;
}

.summary-value {
  margin-top: 8px;
  font-size: 14px;
  line-height: 1.45;
}

.altar-stage {
  padding: 18px 18px 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  background:
    linear-gradient(180deg, rgba(10, 15, 26, 0.98), rgba(6, 10, 18, 0.99)),
    radial-gradient(circle at top, rgba(56, 189, 248, 0.08), transparent 40%),
    radial-gradient(circle at bottom, rgba(168, 85, 247, 0.06), transparent 42%);
}

.stage-header {
  position: relative;
  z-index: 1;
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
}

.header-pill {
  padding: 7px 12px;
  border-radius: 999px;
  border: 1px solid rgba(125, 211, 252, 0.18);
  background: rgba(7, 13, 23, 0.74);
  color: rgba(226, 232, 240, 0.8);
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.accent-pill {
  border-color: rgba(192, 132, 252, 0.22);
  color: rgba(233, 213, 255, 0.84);
}

.result-lane {
  position: relative;
  z-index: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 72px;
}

.result-connector {
  position: absolute;
  width: 180px;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(125, 211, 252, 0.4), transparent);
  filter: drop-shadow(0 0 8px rgba(56, 189, 248, 0.18));
}

.result-slot,
.slot {
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 14px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  background:
    linear-gradient(180deg, rgba(14, 21, 35, 0.96), rgba(8, 12, 21, 0.98)),
    radial-gradient(circle at top, rgba(255, 255, 255, 0.08), transparent 52%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.05),
    0 10px 24px rgba(2, 8, 23, 0.24);
}

.slot-anchor {
  position: absolute;
  width: 44px;
  height: 44px;
  z-index: 2;
}

.center-anchor {
  width: 52px;
  height: 52px;
  z-index: 3;
}

.slot-fill {
  position: relative;
  inset: auto;
  width: 100%;
  height: 100%;
}

.slot-anchor :deep(.recipe-item-tooltip-container) {
  display: block;
  width: 100%;
  height: 100%;
}

.result-slot {
  position: relative;
  width: 58px;
  height: 58px;
  border-color: rgba(125, 211, 252, 0.4);
  box-shadow:
    0 0 0 1px rgba(125, 211, 252, 0.08),
    0 12px 28px rgba(14, 165, 233, 0.16),
    inset 0 1px 0 rgba(255, 255, 255, 0.06);
}

.altar-board {
  position: relative;
  z-index: 1;
  align-self: center;
  width: 100%;
  max-width: 430px;
  aspect-ratio: 1 / 1;
  min-height: 430px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 22px;
  border: 1px solid rgba(148, 163, 184, 0.12);
  background:
    radial-gradient(circle at center, rgba(13, 20, 34, 0.94), rgba(6, 10, 18, 0.98) 70%),
    linear-gradient(rgba(255, 255, 255, 0.02) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.02) 1px, transparent 1px);
  background-size: auto, 24px 24px, 24px 24px;
}

.altar-rings {
  position: absolute;
  inset: 39px;
  pointer-events: none;
}

.ring {
  position: absolute;
  inset: 0;
  border-radius: 50%;
}

.ring-outer {
  border: 1px dashed rgba(56, 189, 248, 0.26);
  box-shadow: 0 0 16px rgba(56, 189, 248, 0.08);
}

.ring-middle {
  inset: 56px;
  border: 1px solid rgba(168, 85, 247, 0.2);
}

.ring-inner {
  inset: 116px;
  border: 1px solid rgba(245, 158, 11, 0.16);
}

.ring,
.ring-outer,
.ring-middle,
.ring-inner {
  aspect-ratio: 1 / 1;
}

.crosshair {
  position: absolute;
  background: linear-gradient(90deg, transparent, rgba(148, 163, 184, 0.18), transparent);
}

.crosshair-h {
  left: 32px;
  right: 32px;
  top: calc(50% - 0.5px);
  height: 1px;
}

.crosshair-v {
  top: 32px;
  bottom: 32px;
  left: calc(50% - 0.5px);
  width: 1px;
  background: linear-gradient(180deg, transparent, rgba(148, 163, 184, 0.18), transparent);
}

.slot {
  transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
}

.slot:hover,
.result-slot:hover {
  transform: translateY(-1px) scale(1.02);
}

.pedestal-slot {
  border-color: rgba(103, 232, 249, 0.2);
}

.pedestal-slot:hover {
  border-color: rgba(103, 232, 249, 0.52);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.08),
    0 0 0 1px rgba(103, 232, 249, 0.08),
    0 12px 24px rgba(14, 116, 144, 0.16);
}

.center-slot {
  border-color: rgba(192, 132, 252, 0.36);
  box-shadow:
    0 0 0 1px rgba(192, 132, 252, 0.08),
    0 16px 32px rgba(76, 29, 149, 0.2),
    inset 0 1px 0 rgba(255, 255, 255, 0.06);
}

.center-slot:hover {
  border-color: rgba(216, 180, 254, 0.62);
}

.empty-slot {
  border-style: dashed;
  border-color: rgba(71, 85, 105, 0.22);
  background: rgba(15, 23, 42, 0.22);
}

.item-icon {
  width: 30px;
  height: 30px;
  image-rendering: pixelated;
}

.result-icon,
.center-icon {
  width: 34px;
  height: 34px;
}

.count {
  position: absolute;
  right: 4px;
  bottom: 3px;
  padding: 1px 4px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.86);
  border: 1px solid rgba(148, 163, 184, 0.18);
  font-size: 10px;
  font-weight: 700;
  color: #f8fafc;
  text-shadow: 0 1px 2px rgba(2, 8, 23, 0.9);
}

.aspect-stack {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 12px;
}

.aspect-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 14px;
  border: 1px solid color-mix(in srgb, var(--accent) 30%, rgba(148, 163, 184, 0.1));
  background:
    linear-gradient(90deg, color-mix(in srgb, var(--accent) 10%, rgba(15, 23, 42, 0.9)), rgba(9, 14, 25, 0.82));
}

.aspect-main {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.aspect-icon {
  width: 24px;
  height: 24px;
  image-rendering: pixelated;
  flex: 0 0 auto;
}

.aspect-name {
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.instability-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-color: rgba(249, 115, 22, 0.18);
  background:
    linear-gradient(180deg, rgba(39, 16, 8, 0.52), rgba(18, 10, 8, 0.66)),
    rgba(17, 24, 39, 0.5);
}

.instability-card.is-muted {
  border-color: rgba(71, 85, 105, 0.2);
  background: rgba(9, 15, 27, 0.58);
}

@media (max-width: 1080px) {
  .infusion-shell {
    grid-template-columns: 1fr;
  }

  .altar-stage {
    order: -1;
  }

  .altar-board {
    min-height: 400px;
  }
}
</style>
