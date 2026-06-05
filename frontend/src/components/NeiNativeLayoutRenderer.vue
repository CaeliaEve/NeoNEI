<script setup lang="ts">
import { computed } from 'vue';
import type { Recipe, RecipeItem, RecipeUiPayload } from '../services/api';
import AnimatedItemIcon from './AnimatedItemIcon.vue';
import RecipeItemTooltip from './RecipeItemTooltip.vue';

interface NativeSlotFact {
  role?: string;
  startIndex?: number;
  columns?: number;
  rows?: number;
  x?: number;
  y?: number;
}

interface Props {
  recipe: Recipe;
  uiPayload?: RecipeUiPayload | null;
}

interface Emits {
  (e: 'item-click', itemId: string): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const NATIVE_SLOT = 18;
const VIEW_SLOT = 34;
const NATIVE_SCALE = VIEW_SLOT / NATIVE_SLOT;

const nativeLayout = computed(() => {
  const layout = props.uiPayload?.nativeLayout;
  return layout && typeof layout === 'object' ? layout as Record<string, unknown> : null;
});

const slots = computed<NativeSlotFact[]>(() => {
  const raw = nativeLayout.value?.slots;
  return Array.isArray(raw) ? raw as NativeSlotFact[] : [];
});

const title = computed(() => (
  String(props.uiPayload?.machineType ?? props.recipe.machineInfo?.machineType ?? props.recipe.recipeType ?? 'NEI Recipe')
));

const subtitle = computed(() => (
  String((props.uiPayload?.handler as Record<string, unknown> | undefined)?.displayName
    ?? (props.uiPayload?.handler as Record<string, unknown> | undefined)?.canonicalMachineFamily
    ?? props.uiPayload?.familyKey
    ?? 'native-nei')
));

const layoutWidth = computed(() => Math.max(166, Number(nativeLayout.value?.width ?? 166)));
const layoutHeight = computed(() => Math.max(65, Number(nativeLayout.value?.height ?? 65)));

const canvasStyle = computed(() => ({
  width: `${layoutWidth.value * NATIVE_SCALE}px`,
  height: `${layoutHeight.value * NATIVE_SCALE}px`,
}));

const inputItems = computed<RecipeItem[]>(() => {
  const out: RecipeItem[] = [];
  for (const row of props.recipe.inputs ?? []) {
    if (!Array.isArray(row)) continue;
    for (const cell of row) {
      const item = Array.isArray(cell) ? cell[0] : cell;
      if (item?.itemId) out.push(item as RecipeItem);
    }
  }
  return out;
});

const outputItems = computed<RecipeItem[]>(() => (props.recipe.outputs ?? []).filter((item): item is RecipeItem => Boolean(item?.itemId)));

function itemsForRole(role?: string): RecipeItem[] {
  const normalized = String(role ?? '').toLowerCase();
  if (normalized.includes('output')) return outputItems.value;
  return inputItems.value;
}

function itemAt(slot: NativeSlotFact, index: number): RecipeItem | null {
  const items = itemsForRole(slot.role);
  const rawStart = Math.max(0, Number(slot.startIndex ?? 0));
  const start = rawStart >= items.length ? 0 : rawStart;
  return items[start + index] ?? null;
}

function slotStyle(slot: NativeSlotFact) {
  const columns = Math.max(1, Number(slot.columns ?? 1));
  const rows = Math.max(1, Number(slot.rows ?? 1));
  const x = Math.max(0, Number(slot.x ?? 0));
  const y = Math.max(0, Number(slot.y ?? 0));
  return {
    left: `${x * NATIVE_SCALE}px`,
    top: `${y * NATIVE_SCALE}px`,
    gridTemplateColumns: `repeat(${columns}, ${VIEW_SLOT}px)`,
    gridTemplateRows: `repeat(${rows}, ${VIEW_SLOT}px)`,
  };
}

function slotCount(slot: NativeSlotFact): number {
  return Math.max(1, Number(slot.columns ?? 1)) * Math.max(1, Number(slot.rows ?? 1));
}
</script>

<template>
  <section class="native-nei-card" aria-label="Native NEI recipe layout">
    <header class="native-nei-header">
      <div>
        <div class="native-eyebrow">NATIVE NEI LAYOUT</div>
        <h3>{{ title }}</h3>
      </div>
      <code>{{ subtitle }}</code>
    </header>

    <div class="native-nei-body">
      <div class="native-nei-canvas" :style="canvasStyle">
        <div class="native-flow-line" aria-hidden="true" />
        <div
          v-for="(slot, groupIndex) in slots"
          :key="`${slot.role}-${groupIndex}`"
          class="slot-bank"
          :class="[`role-${slot.role || 'item'}`]"
          :style="slotStyle(slot)"
        >
          <div
            v-for="index in slotCount(slot)"
            :key="index"
            class="native-slot"
            :class="{ output: String(slot.role || '').includes('output') }"
          >
            <RecipeItemTooltip
              v-if="itemAt(slot, index - 1)"
              :item-id="itemAt(slot, index - 1)!.itemId"
              :count="itemAt(slot, index - 1)!.count"
              @click="emit('item-click', itemAt(slot, index - 1)!.itemId)"
            >
              <AnimatedItemIcon
                :item-id="itemAt(slot, index - 1)!.itemId"
                :render-asset-ref="itemAt(slot, index - 1)!.renderAssetRef"
                :image-file-name="itemAt(slot, index - 1)!.imageFileName"
                :size="28"
              />
            </RecipeItemTooltip>
          </div>
        </div>
        <div v-if="slots.length === 0" class="empty-layout">NEI layout facts unavailable</div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.native-nei-card {
  width: min(720px, 100%);
  min-height: 330px;
  padding: 22px;
  border-radius: 22px;
  border: 1px solid rgba(142, 166, 190, 0.2);
  background:
    radial-gradient(circle at 50% 42%, rgba(74, 136, 160, 0.18), transparent 38%),
    linear-gradient(145deg, rgba(12, 17, 24, 0.94), rgba(20, 25, 33, 0.9));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 24px 70px rgba(0, 0, 0, 0.42);
}

.native-nei-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 22px;
}

.native-eyebrow {
  font-size: 10px;
  letter-spacing: 0.22em;
  color: rgba(128, 213, 226, 0.74);
}

h3 {
  margin: 4px 0 0;
  color: rgba(237, 245, 252, 0.96);
  font-size: 19px;
  font-weight: 700;
}

code {
  color: rgba(177, 190, 205, 0.76);
  font-size: 11px;
}

.native-nei-body {
  min-height: 230px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.native-nei-canvas {
  position: relative;
  isolation: isolate;
  border-radius: 18px;
  border: 1px solid rgba(132, 158, 186, 0.18);
  background:
    radial-gradient(circle at 50% 50%, rgba(119, 191, 210, 0.12), transparent 42%),
    linear-gradient(135deg, rgba(8, 13, 19, 0.42), rgba(22, 27, 36, 0.52));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.035),
    inset 0 0 34px rgba(0, 0, 0, 0.18);
}

.native-flow-line {
  position: absolute;
  left: 14%;
  right: 14%;
  top: 50%;
  height: 1px;
  transform: translateY(-50%);
  background: linear-gradient(90deg, transparent, rgba(126, 210, 230, 0.22), rgba(247, 181, 92, 0.2), transparent);
  box-shadow: 0 0 18px rgba(126, 210, 230, 0.1);
  z-index: -1;
}

.slot-bank {
  position: absolute;
  display: grid;
  gap: 2px;
  padding: 0;
  border-radius: 12px;
}

.native-slot {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border-radius: 9px;
  border: 1px solid rgba(160, 178, 198, 0.24);
  background: linear-gradient(145deg, rgba(24, 30, 38, 0.88), rgba(8, 12, 18, 0.9));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05), inset 0 -8px 18px rgba(0, 0, 0, 0.22);
}

.native-slot.output {
  border-color: rgba(248, 181, 92, 0.42);
  box-shadow: 0 0 18px rgba(248, 181, 92, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.06);
}

.empty-layout {
  color: rgba(180, 194, 210, 0.64);
  font-size: 13px;
}
</style>
