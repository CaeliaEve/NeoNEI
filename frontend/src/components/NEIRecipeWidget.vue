<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Recipe } from '../services/api';
import { getImageUrl } from '../services/api';
import { useSound } from '../services/sound.service';

interface Props {
  recipe: Recipe;
  width?: number;
  showOverlayButton?: boolean;
  showFavoriteButton?: boolean;
  isFavorite?: boolean;
}

interface Emits {
  (e: 'item-click', itemId: string): void;
  (e: 'item-contextmenu', itemId: string, event: MouseEvent): void;
  (e: 'overlay'): void;
  (e: 'toggle-favorite', recipeId: string): void;
}

interface StackItem {
  itemId: string;
  count?: number;
  probability?: number;
}

interface PositionedStack {
  x: number;
  y: number;
  item: StackItem;
  count: number;
}

const SLOT_SIZE = 18;
const PANEL_PADDING_X = 7;
const PANEL_PADDING_Y = 8;
const MIN_GRID_DIMENSION = 3;
const ACTION_RAIL_WIDTH = 18;
const ACTION_BUTTON_SIZE = 14;
const ACTION_BUTTON_GAP = 4;
const ARROW_WIDTH = 20;
const MIN_CENTER_GAP = 28;

const props = withDefaults(defineProps<Props>(), {
  width: 166,
  showOverlayButton: true,
  showFavoriteButton: true,
  isFavorite: false
});

const emit = defineEmits<Emits>();
const { playClick } = useSound();
const getImagePath = getImageUrl;

const getPrimaryInputItem = (cell: Recipe['inputs'][number][number] | undefined): StackItem | null => {
  if (!cell) return null;
  return Array.isArray(cell) ? cell[0] ?? null : cell;
};

const inputColumns = computed(() => {
  const inferredWidth = props.recipe.inputs.reduce((max, row) => Math.max(max, row?.length ?? 0), 0);
  return Math.max(props.recipe.recipeTypeData?.itemInputDimension?.width ?? 0, inferredWidth, MIN_GRID_DIMENSION);
});

const inputRows = computed(() => {
  return Math.max(
    props.recipe.recipeTypeData?.itemInputDimension?.height ?? 0,
    props.recipe.inputs.length,
    MIN_GRID_DIMENSION
  );
});

const outputColumns = computed(() => Math.max(1, Math.min(3, props.recipe.outputs.length || 1)));
const outputRows = computed(() => Math.max(1, Math.ceil((props.recipe.outputs.length || 1) / outputColumns.value)));

const inputGridWidth = computed(() => inputColumns.value * SLOT_SIZE);
const inputGridHeight = computed(() => inputRows.value * SLOT_SIZE);
const outputGridWidth = computed(() => outputColumns.value * SLOT_SIZE);
const outputGridHeight = computed(() => outputRows.value * SLOT_SIZE);

const actionRailWidth = computed(() => (
  props.showOverlayButton || props.showFavoriteButton ? ACTION_RAIL_WIDTH : 0
));

const widgetWidth = computed(() => {
  const minimumWidth = PANEL_PADDING_X * 2 +
    inputGridWidth.value +
    outputGridWidth.value +
    actionRailWidth.value +
    MIN_CENTER_GAP;

  return Math.max(props.width, minimumWidth);
});

const recipeHeight = computed(() => {
  const gridHeight = Math.max(inputRows.value, outputRows.value, MIN_GRID_DIMENSION);
  return gridHeight * SLOT_SIZE + PANEL_PADDING_Y * 2;
});

const inputTop = computed(() => Math.round((recipeHeight.value - inputGridHeight.value) / 2));
const outputTop = computed(() => Math.round((recipeHeight.value - outputGridHeight.value) / 2));
const outputLeft = computed(() => widgetWidth.value - PANEL_PADDING_X - actionRailWidth.value - outputGridWidth.value);
const arrowLeft = computed(() => {
  const laneStart = PANEL_PADDING_X + inputGridWidth.value;
  return Math.round((laneStart + outputLeft.value - ARROW_WIDTH) / 2);
});
const arrowTop = computed(() => Math.round(recipeHeight.value / 2 - SLOT_SIZE / 2));

const visibleButtonCount = computed(() => Number(props.showOverlayButton) + Number(props.showFavoriteButton));
const buttonBlockHeight = computed(() => {
  if (visibleButtonCount.value === 0) return 0;
  return visibleButtonCount.value * ACTION_BUTTON_SIZE +
    Math.max(visibleButtonCount.value - 1, 0) * ACTION_BUTTON_GAP;
});
const buttonTop = computed(() => Math.max(PANEL_PADDING_Y, Math.round((recipeHeight.value - buttonBlockHeight.value) / 2)));
const buttonLeft = computed(() => widgetWidth.value - PANEL_PADDING_X - ACTION_BUTTON_SIZE);

const inputStacks = computed(() => {
  const stacks: PositionedStack[] = [];

  for (let rowIndex = 0; rowIndex < props.recipe.inputs.length; rowIndex++) {
    const row = props.recipe.inputs[rowIndex] || [];
    for (let colIndex = 0; colIndex < row.length; colIndex++) {
      const item = getPrimaryInputItem(row[colIndex]);
      if (!item?.itemId) continue;

      stacks.push({
        x: colIndex * SLOT_SIZE + PANEL_PADDING_X,
        y: rowIndex * SLOT_SIZE + inputTop.value,
        item,
        count: item.count || 1
      });
    }
  }

  return stacks;
});

const outputStacks = computed(() => {
  const stacks: PositionedStack[] = [];

  props.recipe.outputs.forEach((item, index) => {
    const row = Math.floor(index / outputColumns.value);
    const col = index % outputColumns.value;
    stacks.push({
      x: outputLeft.value + col * SLOT_SIZE,
      y: outputTop.value + row * SLOT_SIZE,
      item,
      count: item.count || 1
    });
  });

  return stacks;
});

const catalystStacks = computed(() => {
  if (!props.recipe.additionalData?.catalyst) return [];

  const laneCenterX = Math.round((PANEL_PADDING_X + inputGridWidth.value + outputLeft.value - SLOT_SIZE) / 2);
  const catalystTop = Math.min(
    recipeHeight.value - SLOT_SIZE - PANEL_PADDING_Y,
    Math.round(recipeHeight.value / 2 + 10)
  );

  return [{
    x: laneCenterX,
    y: Math.max(PANEL_PADDING_Y, catalystTop),
    item: { itemId: props.recipe.additionalData.catalyst },
    count: 1
  }];
});

const hoveredStack = ref<{ x: number; y: number; itemId: string } | null>(null);

const handleItemHover = (stack: PositionedStack) => {
  hoveredStack.value = {
    x: stack.x,
    y: stack.y,
    itemId: stack.item.itemId
  };
};

const handleItemLeave = () => {
  hoveredStack.value = null;
};

const handleItemClick = (itemId: string) => {
  playClick();
  emit('item-click', itemId);
};

const handleItemContextMenu = (itemId: string, event: MouseEvent) => {
  event.preventDefault();
  emit('item-contextmenu', itemId, event);
};

const handleOverlay = () => {
  playClick();
  emit('overlay');
};

const handleToggleFavorite = () => {
  playClick();
  emit('toggle-favorite', props.recipe.recipeId);
};
</script>

<template>
  <div
    class="nei-recipe-widget"
    :style="{ width: widgetWidth + 'px', height: recipeHeight + 'px' }"
  >
    <div class="recipe-background"></div>

    <template v-for="stack in inputStacks" :key="'input-' + stack.x + '-' + stack.y">
      <div
        class="nei-slot"
        :class="{ 'nei-slot-hovered': hoveredStack?.x === stack.x && hoveredStack?.y === stack.y }"
        :style="{ left: stack.x + 'px', top: stack.y + 'px' }"
        @mouseenter="handleItemHover(stack)"
        @mouseleave="handleItemLeave"
        @click="handleItemClick(stack.item.itemId)"
        @contextmenu="handleItemContextMenu(stack.item.itemId, $event)"
      >
        <img
          :src="getImagePath(stack.item.itemId)"
          class="nei-item-icon"
          @error="(e) => { (e.target as HTMLImageElement).src = '/placeholder.png'; }"
        />
        <span v-if="stack.count > 1" class="nei-item-count">{{ stack.count }}</span>
      </div>
    </template>

    <div class="nei-arrow" :style="{ left: arrowLeft + 'px', top: arrowTop + 'px' }">
      <svg viewBox="0 0 24 24" width="18" height="18">
        <path d="M5 11h10.5l-4.2-4.2 1.4-1.4L19.3 12l-6.6 6.6-1.4-1.4 4.2-4.2H5z" fill="currentColor" />
      </svg>
    </div>

    <template v-for="stack in outputStacks" :key="'output-' + stack.x + '-' + stack.y">
      <div
        class="nei-slot"
        :class="{ 'nei-slot-hovered': hoveredStack?.x === stack.x && hoveredStack?.y === stack.y }"
        :style="{ left: stack.x + 'px', top: stack.y + 'px' }"
        @mouseenter="handleItemHover(stack)"
        @mouseleave="handleItemLeave"
        @click="handleItemClick(stack.item.itemId)"
        @contextmenu="handleItemContextMenu(stack.item.itemId, $event)"
      >
        <img
          :src="getImagePath(stack.item.itemId)"
          class="nei-item-icon"
          @error="(e) => { (e.target as HTMLImageElement).src = '/placeholder.png'; }"
        />
        <span v-if="stack.count > 1" class="nei-item-count">{{ stack.count }}</span>
        <span
          v-if="stack.item.probability && stack.item.probability < 1"
          class="nei-probability"
        >
          {{ Math.round(stack.item.probability * 100) }}%
        </span>
      </div>
    </template>

    <template v-for="stack in catalystStacks" :key="'catalyst-' + stack.x + '-' + stack.y">
      <div
        class="nei-slot nei-catalyst-slot"
        :class="{ 'nei-slot-hovered': hoveredStack?.x === stack.x && hoveredStack?.y === stack.y }"
        :style="{ left: stack.x + 'px', top: stack.y + 'px' }"
        @mouseenter="handleItemHover(stack)"
        @mouseleave="handleItemLeave"
        @click="handleItemClick(stack.item.itemId)"
      >
        <img
          :src="getImagePath(stack.item.itemId)"
          class="nei-item-icon"
          @error="(e) => { (e.target as HTMLImageElement).src = '/placeholder.png'; }"
        />
      </div>
    </template>

    <div
      v-if="visibleButtonCount > 0"
      class="recipe-buttons"
      :style="{ left: buttonLeft + 'px', top: buttonTop + 'px' }"
    >
      <button
        v-if="showOverlayButton"
        class="recipe-button overlay-button"
        type="button"
        title="Show recipe overlay"
        aria-label="Show recipe overlay"
        @click="handleOverlay"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3 3h4v1H4v3H3zm6 0h4v4h-1V4H9zm3 6h1v4H9v-1h3zM4 9v3h3v1H3V9z" fill="currentColor" />
        </svg>
      </button>
      <button
        v-if="showFavoriteButton"
        class="recipe-button favorite-button"
        :class="{ 'is-favorite': isFavorite }"
        type="button"
        :title="isFavorite ? 'Remove from favorites' : 'Save to favorites'"
        :aria-label="isFavorite ? 'Remove from favorites' : 'Save to favorites'"
        @click="handleToggleFavorite"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M8 1.5l1.9 3.86 4.26.62-3.08 3 0.73 4.24L8 11.17 4.19 13.22l0.73-4.24-3.08-3 4.26-.62z" fill="currentColor" />
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.nei-recipe-widget {
  position: relative;
  margin: 0 auto 8px auto;
  font-family: 'Consolas', 'Monaco', monospace;
  border-radius: 8px;
  overflow: hidden;
  isolation: isolate;
}

.recipe-background {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(180deg, rgba(14, 19, 28, 0.94), rgba(9, 13, 20, 0.97)),
    url('/textures/nei/recipebg.png');
  background-repeat: repeat;
  background-size: auto, 128px 128px;
  border: 1px solid rgba(148, 163, 184, 0.24);
  border-radius: 8px;
  pointer-events: none;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.08),
    0 6px 16px rgba(2, 8, 23, 0.22);
}

.recipe-background::before {
  content: '';
  position: absolute;
  inset: 0;
  background:
    linear-gradient(rgba(255, 255, 255, 0.02) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.02) 1px, transparent 1px);
  background-size: 18px 18px;
  opacity: 0.26;
}

.nei-slot {
  position: absolute;
  width: 18px;
  height: 18px;
  background:
    linear-gradient(180deg, rgba(18, 24, 35, 0.92), rgba(10, 14, 22, 0.96)),
    url('/textures/nei/slot.png');
  background-repeat: no-repeat;
  background-position: center;
  background-size: 100% 100%, 18px 18px;
  border: 1px solid rgba(148, 163, 184, 0.16);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border-radius: 4px;
  overflow: hidden;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.06),
    0 1px 4px rgba(2, 8, 23, 0.28);
  transition: transform 0.16s ease, border-color 0.16s ease, box-shadow 0.16s ease;
  animation: slot-init 0.18s ease-out;
}

.nei-slot::before {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 32% 28%, rgba(255, 255, 255, 0.16), transparent 52%);
  opacity: 0.65;
}

.nei-slot-hovered {
  border-color: rgba(103, 232, 249, 0.72);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.12),
    0 0 0 1px rgba(34, 211, 238, 0.16),
    0 4px 10px rgba(8, 145, 178, 0.22);
  transform: translateY(-1px);
  z-index: 10;
}

.nei-catalyst-slot {
  border-color: rgba(251, 191, 36, 0.34);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.06),
    0 1px 5px rgba(120, 53, 15, 0.28);
}

.nei-item-icon {
  width: 16px;
  height: 16px;
  image-rendering: pixelated;
  image-rendering: crisp-edges;
  display: block;
  position: relative;
  z-index: 1;
  filter: drop-shadow(0 1px 2px rgba(15, 23, 42, 0.72));
  transition: transform 0.16s ease, filter 0.16s ease;
}

.nei-slot-hovered .nei-item-icon {
  transform: scale(1.05);
  filter: drop-shadow(0 2px 3px rgba(8, 145, 178, 0.3));
}

.nei-item-count {
  position: absolute;
  right: 1px;
  bottom: 1px;
  color: #f8fafc;
  font-size: 8px;
  font-weight: 700;
  line-height: 1;
  text-shadow:
    0 1px 0 rgba(15, 23, 42, 0.95),
    0 0 2px rgba(15, 23, 42, 0.95);
  pointer-events: none;
  z-index: 2;
}

.nei-probability {
  position: absolute;
  top: 1px;
  left: 1px;
  padding: 1px 2px;
  border-radius: 2px;
  background: rgba(180, 83, 9, 0.92);
  color: #fffbeb;
  font-size: 6px;
  font-weight: 700;
  line-height: 1;
  pointer-events: none;
  z-index: 2;
  text-shadow: 0 1px 0 rgba(120, 53, 15, 0.9);
  box-shadow: 0 1px 2px rgba(120, 53, 15, 0.28);
}

.nei-arrow {
  position: absolute;
  width: 20px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  color: #cbd5e1;
  opacity: 0.92;
}

.nei-arrow::before {
  content: '';
  position: absolute;
  left: -6px;
  right: -6px;
  top: 50%;
  height: 1px;
  transform: translateY(-50%);
  background: url('/textures/nei/dash.png') center / 3px 1px repeat-x;
  opacity: 0.42;
}

.recipe-buttons {
  position: absolute;
  display: flex;
  flex-direction: column;
  gap: 4px;
  z-index: 20;
}

.recipe-button {
  width: 14px;
  height: 14px;
  padding: 0;
  background: linear-gradient(180deg, rgba(30, 41, 59, 0.92), rgba(15, 23, 42, 0.96));
  border: 1px solid rgba(148, 163, 184, 0.24);
  border-radius: 3px;
  color: #cbd5e1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.06),
    0 1px 3px rgba(2, 8, 23, 0.32);
  transition: transform 0.16s ease, border-color 0.16s ease, box-shadow 0.16s ease, color 0.16s ease;
}

.recipe-button svg {
  width: 9px;
  height: 9px;
}

.recipe-button:hover {
  color: #f8fafc;
  border-color: rgba(125, 211, 252, 0.52);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.1),
    0 0 0 1px rgba(56, 189, 248, 0.18),
    0 2px 8px rgba(14, 116, 144, 0.22);
  transform: translateY(-1px);
}

.recipe-button:focus-visible {
  outline: 1px solid rgba(125, 211, 252, 0.72);
  outline-offset: 1px;
}

.favorite-button.is-favorite {
  color: #fbbf24;
  border-color: rgba(251, 191, 36, 0.42);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.08),
    0 1px 4px rgba(120, 53, 15, 0.25);
}

.favorite-button.is-favorite:hover {
  border-color: rgba(251, 191, 36, 0.72);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.1),
    0 0 0 1px rgba(251, 191, 36, 0.16),
    0 2px 8px rgba(180, 83, 9, 0.25);
}

@keyframes slot-init {
  0% {
    opacity: 0;
    transform: translateY(2px);
  }

  100% {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
