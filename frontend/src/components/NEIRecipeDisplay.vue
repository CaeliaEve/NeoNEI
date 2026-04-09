<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  ref,
} from 'vue';
import type { Recipe } from '../services/api';
import { getFluidImageUrlFromFluid, getImageUrl, getImageUrlFromFileName, getImageUrlFromRenderAssetRef } from '../services/api';
import RecipeActionButtons from './RecipeActionButtons.vue';
import RecipeItemTooltip from './RecipeItemTooltip.vue';
import AnimatedItemIcon from './AnimatedItemIcon.vue';
import { useSound } from '../services/sound.service';
import { sendOverlayPayload, type OverlayPayload } from '../services/overlay.service';
import type { RecipeDisplayHandle, RecipeOverlayUiState } from '../domain/recipeDisplayContract';
import { normalizeRecipeForDisplay } from '../domain/recipeNormalization';

interface Props {
  recipe: Recipe;
  recipeId?: string;
  isFavorite?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  isFavorite: false,
});

const isDev = import.meta.env.DEV;
const debugLog = (...args: unknown[]) => {
  if (isDev) {
    console.log(...args);
  }
};
const debugWarn = (...args: unknown[]) => {
  if (isDev) {
    console.warn(...args);
  }
};

// Sound service
const { playClick } = useSound();

const defaultOverlayState = (): RecipeOverlayUiState => ({
  status: 'idle',
  message: '',
  canRetry: false,
  requestId: null,
  updatedAt: Date.now(),
});

const overlayState = ref<RecipeOverlayUiState>(defaultOverlayState());
let overlayRequestSeq = 0;

const commitOverlayState = (
  patch: Partial<RecipeOverlayUiState>,
  requestSeq?: number,
): RecipeOverlayUiState => {
  if (requestSeq !== undefined && requestSeq !== overlayRequestSeq) {
    return overlayState.value;
  }
  const next: RecipeOverlayUiState = {
    ...overlayState.value,
    ...patch,
    updatedAt: Date.now(),
  };
  overlayState.value = next;
  emit('overlay-state-change', next);
  return next;
};

// Define emits
const emit = defineEmits<{
  (e: 'item-click', itemId: string): void;
  (e: 'item-contextmenu', itemId: string): void;
  (e: 'overlay'): void;
  (e: 'overlay-state-change', state: RecipeOverlayUiState): void;
  (e: 'toggle-favorite', recipeId: string): void;
}>();

// Get image path for item - using shared utility from api.ts
const getImagePath = getImageUrl;

interface DisplayFluid {
  modId?: string;
  internalName?: string;
  localizedName?: string;
  amount?: number;
  temperature?: number;
  [key: string]: unknown;
}

// Get fluid image path
const getFluidImagePath = (fluid: DisplayFluid | null | undefined): string => {
  if (!fluid) return '';
  return getFluidImageUrlFromFluid(fluid as { renderAssetRef?: string | null; fluidId?: string | null }) || '';
};

// Check if fluid has image
const fluidHasImage = (fluid: DisplayFluid | null | undefined): boolean => {
  return !!(fluid && fluid.modId && fluid.internalName);
};

// Format voltage tier
const formatVoltageTier = (tier?: string): string => {
  if (!tier) return '';
  const tierMap: Record<string, string> = {
    'ULV': 'ULV',
    'LV': 'LV',
    'MV': 'MV',
    'HV': 'HV',
    'EV': 'EV',
    'IV': 'IV',
    'LuV': 'LuV',
    'ZPM': 'ZPM',
    'UV': 'UV',
    'UHV': 'UHV',
    'UEV': 'UEV',
    'UIV': 'UIV',
    'UMV': 'UMV',
    'UXV': 'UXV',
    'MAX': 'MAX'
  };
  return tierMap[tier] || tier;
};

// Format duration
const formatDuration = (ticks?: number): string => {
  if (!ticks) return '';
  const seconds = (ticks / 20).toFixed(1);
  return `${seconds}s`;
};

// Format EU/t
const formatEUt = (voltage?: number, amperage?: number): string => {
  if (!voltage) return '';
  const amp = amperage || 1;
  const totalEU = voltage * amp;
  return `${totalEU} EU/t`;
};

// Get machine name
const getMachineName = (recipeType: string): string => {
  const match = recipeType.match(/gregtech\s*-\s*(.+?)\s*\(/);
  return match ? match[1].trim() : recipeType;
};

// Get voltage tier color
const getVoltageColor = (tier?: string): string => {
  if (!tier) return 'text-gray-400';
  const colorMap: Record<string, string> = {
    'ULV': 'text-gray-500',
    'LV': 'text-gray-600',
    'MV': 'text-gray-700',
    'HV': 'text-gray-800',
    'EV': 'text-gray-900',
    'IV': 'text-gray-900',
    'LuV': 'text-black',
    'ZPM': 'text-black',
    'UV': 'text-black',
    'UHV': 'text-black',
    'UEV': 'text-black',
    'UIV': 'text-black',
    'UMV': 'text-black',
    'UXV': 'text-black',
    'MAX': 'text-black'
  };
  return colorMap[tier] || 'text-gray-400';
};

// Check if has GT data
const hasGTData = computed(() => {
  const machineType = `${props.recipe.machineInfo?.machineType || ''}`.toLowerCase();
  const recipeType = `${props.recipe.recipeType || ''}`.toLowerCase();
  const category = `${props.recipe.machineInfo?.category || ''}`.toLowerCase();
  const isGregTech =
    machineType.includes('gregtech')
    || recipeType.includes('gregtech')
    || category.includes('gregtech');

  if (!isGregTech) {
    return false;
  }

  return !!(props.recipe.additionalData &&
    (props.recipe.additionalData.voltageTier ||
      props.recipe.additionalData.duration ||
      props.recipe.additionalData.voltage));
});

// Get machine icon path
const getMachineIconPath = computed(() => {
  if (!props.recipe.recipeTypeData?.machineIcon) {
    return null;
  }

  const icon = props.recipe.recipeTypeData.machineIcon;
  if (icon.renderAssetRef) {
    const renderAssetUrl = getImageUrlFromRenderAssetRef(icon.renderAssetRef);
    if (renderAssetUrl) return renderAssetUrl;
  }
  if (icon.itemId) {
    return getImageUrl(icon.itemId);
  }

  if (icon.imageFileName) {
    return getImageUrlFromFileName(icon.imageFileName);
  }

  return null;
});

// Check if has machine icon
const hasMachineIcon = computed(() => {
  return !!getMachineIconPath.value;
});

const normalizedRecipe = computed(() => normalizeRecipeForDisplay(props.recipe));

// Get input grid dimensions
const inputGridDims = computed(() => {
  if (normalizedRecipe.value.recipeTypeData?.itemInputDimension) {
    return normalizedRecipe.value.recipeTypeData.itemInputDimension;
  }

  const rows = normalizedRecipe.value.inputs || [];
  if (rows.length > 0) {
    const width = rows.reduce((max, row) => Math.max(max, Array.isArray(row) ? row.length : 0), 0);
    return {
      width: Math.max(1, width),
      height: Math.max(1, rows.length),
    };
  }

  // Default to 3x3 for crafting tables
  return { width: 3, height: 3 };
});

// Get output grid dimensions
const outputGridDims = computed(() => {
  if (normalizedRecipe.value.recipeTypeData?.itemOutputDimension) {
    return normalizedRecipe.value.recipeTypeData.itemOutputDimension;
  }
  // Default to 3x1 for machine recipes
  return { width: 3, height: 1 };
});

// Get total input slots (based on grid size, not item count)
const totalInputSlots = computed(() => {
  return inputGridDims.value.width * inputGridDims.value.height;
});

interface DisplayItem {
  itemId: string;
  count: number;
  probability?: number;
  renderAssetRef?: string | null;
}

// Resolve input item at specific slot index (flat index)
const resolveInputItem = (slotIndex: number): DisplayItem | null => {
  const inputs = normalizedRecipe.value.inputs;
  if (!inputs || inputs.length === 0) {
    return null;
  }

  const gridWidth = inputGridDims.value.width;
  const row = Math.floor(slotIndex / gridWidth);
  const col = slotIndex % gridWidth;
  const cell = inputs[row]?.[col];
  if (!Array.isArray(cell) || cell.length === 0) {
    return null;
  }

  const first = cell[0];
  return {
    itemId: first.itemId,
    count: first.count || 1,
    probability: first.probability,
    renderAssetRef: typeof first.renderAssetRef === 'string' ? first.renderAssetRef : null,
  };
};

const inputSlotViewModels = computed(() => {
  return Array.from({ length: totalInputSlots.value }, (_, slotIndex) => ({
    key: `input-slot-${slotIndex}`,
    slotIndex,
    item: resolveInputItem(slotIndex)
  }));
});

const outputSlotViewModels = computed(() => {
  const totalOutputSlots = outputGridDims.value.width * outputGridDims.value.height;
  return Array.from({ length: totalOutputSlots }, (_, flatIndex) => {
    const output = normalizedRecipe.value.outputs[flatIndex];
    return {
      key: `output-slot-${flatIndex}`,
      flatIndex,
      item: output ? {
        itemId: output.itemId,
        count: output.count || 1,
        probability: output.probability,
        renderAssetRef: typeof output.renderAssetRef === 'string' ? output.renderAssetRef : null,
      } : null
    };
  });
});

// Calculate total EU consumption
const getTotalEU = (): number => {
  if (!props.recipe.additionalData?.voltage || !props.recipe.additionalData?.duration) {
    return 0;
  }
  const voltage = props.recipe.additionalData.voltage;
  const amperage = props.recipe.additionalData.amperage || 1;
  const durationSeconds = props.recipe.additionalData.duration / 20;
  return Math.round(voltage * amperage * durationSeconds);
};

const fluidInputViewModels = computed(() => {
  const result: DisplayFluid[] = [];
  if (!props.recipe.fluidInputs) return result;

  for (const slotRow of props.recipe.fluidInputs as unknown[]) {
    if (Array.isArray(slotRow)) {
      for (const slot of slotRow) {
        const slotRecord = slot as { fluids?: unknown[] } | null;
        if (slotRecord && Array.isArray(slotRecord.fluids) && slotRecord.fluids.length > 0) {
          result.push(slotRecord.fluids[0] as DisplayFluid);
        }
      }
    }
  }
  return result;
});

const fluidOutputViewModels = computed(() => {
  const result: DisplayFluid[] = [];
  if (!props.recipe.fluidOutputs) return result;

  for (const slotRow of props.recipe.fluidOutputs as unknown[]) {
    if (Array.isArray(slotRow)) {
      for (const slot of slotRow) {
        if (!slot) continue;
        const slotRecord = slot as {
          fluid?: DisplayFluid;
          amount?: number;
          fluids?: DisplayFluid[];
        };

        if (slotRecord.fluid && typeof slotRecord.fluid === 'object') {
          result.push({
            ...slotRecord.fluid,
            amount: slotRecord.amount || slotRecord.fluid.amount || 0
          });
        } else if (slotRecord.fluids && Array.isArray(slotRecord.fluids) && slotRecord.fluids.length > 0) {
          result.push(slotRecord.fluids[0]);
        }
      }
    }
  }
  return result;
});

// Check if has fluids
const hasFluids = computed(() => {
  return fluidInputViewModels.value.length > 0 || fluidOutputViewModels.value.length > 0;
});

// Fluid tooltip state
const fluidTooltip = ref({
  visible: false,
  x: 0,
  y: 0,
  fluid: null as DisplayFluid | null
});

// Show fluid tooltip
const showFluidTooltip = (event: MouseEvent, fluid: DisplayFluid) => {
  const offset = 15;
  let x = event.clientX + offset;
  let y = event.clientY + offset;

  fluidTooltip.value = {
    visible: true,
    x,
    y,
    fluid
  };

  // Wait for tooltip render and then correct viewport position
  nextTick(() => {
    const tooltipEl = document.querySelector('.fluid-tooltip-content') as HTMLElement;
    if (tooltipEl) {
      const rect = tooltipEl.getBoundingClientRect();

      // Right boundary
      if (event.clientX + rect.width + offset > window.innerWidth) {
        x = event.clientX - rect.width - offset;
      }

      // Bottom boundary
      if (event.clientY + rect.height + offset > window.innerHeight) {
        y = event.clientY - rect.height - offset;
      }

      // Keep inside top/left boundaries
      x = Math.max(10, x);
      y = Math.max(10, y);

      fluidTooltip.value.x = x;
      fluidTooltip.value.y = y;
    }
  });
};

// Hide fluid tooltip
const hideFluidTooltip = () => {
  fluidTooltip.value.visible = false;
};

// Get fluid icon color based on fluid name
const getFluidColor = (fluidName: string | undefined): string => {
  if (!fluidName) return '#00fff7'; // default cyan
  const name = fluidName.toLowerCase();
  if (name.includes('lava') || name.includes('岩浆')) return '#ff4500';
  if (name.includes('water')) return '#00bfff';
  if (name.includes('oil')) return '#2f2f2f';
  if (name.includes('steam') || name.includes('蒸汽')) return '#e6e6fa';
  if (name.includes('gas')) return '#90ee90';
  return '#00fff7'; // default cyan
};

// WebSocket connection state
const ws = ref<WebSocket | null>(null);
const wsConnected = ref(false);

// Initialize WebSocket connection
const initWebSocket = () => {
  if (ws.value && ws.value.readyState === WebSocket.OPEN) {
    return;
  }

  try {
    // Connect to game client via WebSocket
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/ws/overlay`;
    ws.value = new WebSocket(wsUrl);

    ws.value.onopen = () => {
      debugLog('WebSocket connected for recipe overlay');
      wsConnected.value = true;
    };

    ws.value.onclose = () => {
      debugLog('WebSocket disconnected');
      wsConnected.value = false;
    };

    ws.value.onerror = (error) => {
      debugWarn('WebSocket error:', error);
      wsConnected.value = false;
    };
  } catch (error) {
    console.error('Failed to initialize WebSocket:', error);
    wsConnected.value = false;
  }
};

// Handle item click
const handleItemClick = (itemId: string) => {
  playClick();
  emit('item-click', itemId);
};

// Handle item right-click
const handleItemContextMenu = (itemId: string, event: MouseEvent) => {
  event.preventDefault();
  emit('item-contextmenu', itemId);
};

// Handle recipe overlay - via overlayService (schema validation + ACK + timeout logs)
const waitForOverlaySocketReady = async (timeoutMs: number): Promise<boolean> => {
  const started = Date.now();
  while (Date.now() - started <= timeoutMs) {
    if (ws.value && ws.value.readyState === WebSocket.OPEN) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return false;
};

const handleRecipeOverlay = async () => {
  if (!props.recipe || !props.recipe.recipeId) {
    debugWarn('Invalid recipe data for overlay');
    commitOverlayState({
      status: 'error',
      message: '\u5f53\u524d\u914d\u65b9\u7f3a\u5c11 recipeId\uff0c\u65e0\u6cd5\u53d1\u9001\u5230 Overlay\u3002',
      canRetry: false,
      requestId: null,
    });
    return;
  }

  const requestSeq = ++overlayRequestSeq;
  const overlayMessage: OverlayPayload = {
    type: 'recipe_overlay',
    requestId: `ovl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    schemaVersion: 'v1',
    recipeId: props.recipe.recipeId,
    recipeType: props.recipe.recipeType,
    inputs: props.recipe.inputs || [],
    outputs: props.recipe.outputs || [],
    fluidInputs: props.recipe.fluidInputs || [],
    fluidOutputs: props.recipe.fluidOutputs || [],
    machineName: getMachineName(props.recipe.recipeType),
    timestamp: Date.now(),
  };

  commitOverlayState(
    {
      status: 'loading',
      message: '\u6b63\u5728\u53d1\u9001 Overlay \u5230\u6e38\u620f\u7aef\u2026',
      canRetry: false,
      requestId: overlayMessage.requestId,
    },
    requestSeq,
  );

  const ipcResult = await sendOverlayPayload(overlayMessage);
  if (ipcResult.ok) {
    debugLog(`[overlay] ack ${ipcResult.ackMs}ms`);
    commitOverlayState(
      {
        status: 'success',
        message: `Overlay \u5df2\u53d1\u9001\uff08IPC ACK ${ipcResult.ackMs}ms\uff09`,
        canRetry: false,
      },
      requestSeq,
    );
    return;
  }

  if (!ws.value || ws.value.readyState !== WebSocket.OPEN) {
    initWebSocket();
  }

  const ready = await waitForOverlaySocketReady(500);
  if (!ready) {
    debugWarn('[overlay] timeout > 500ms without ACK on fallback channel');
    commitOverlayState(
      {
        status: 'error',
        message: `Overlay \u53d1\u9001\u5931\u8d25\uff1a${ipcResult.error || 'IPC \u4e0d\u53ef\u7528\u4e14 WebSocket \u672a\u5c31\u7eea'}\u3002`,
        canRetry: true,
      },
      requestSeq,
    );
    return;
  }

  try {
    ws.value?.send(JSON.stringify(overlayMessage));
    debugWarn(`[overlay] IPC fallback to WebSocket, reason=${ipcResult.error}`);
    commitOverlayState(
      {
        status: 'success',
        message: 'Overlay \u5df2\u901a\u8fc7 WebSocket \u515c\u5e95\u53d1\u9001\u3002',
        canRetry: false,
      },
      requestSeq,
    );
  } catch (error) {
    console.error('[overlay] websocket fallback send failed', error);
    commitOverlayState(
      {
        status: 'error',
        message: 'Overlay \u515c\u5e95\u53d1\u9001\u5931\u8d25\uff0c\u8bf7\u91cd\u8bd5\u3002',
        canRetry: true,
      },
      requestSeq,
    );
  }
};

// Cleanup WebSocket on unmount
onBeforeUnmount(() => {
  if (ws.value) {
    ws.value.close();
  }
});

// Expose handleRecipeOverlay to parent components
defineExpose<RecipeDisplayHandle & { overlayState: typeof overlayState }>({
  handleRecipeOverlay,
  overlayState,
});
</script>

<template>
  <div class="nei-recipe-wrapper">
    <div class="nei-recipe">
      <!-- Recipe Action Buttons -->
      <RecipeActionButtons
        v-if="props.recipeId"
        :recipe-id="props.recipeId"
        :is-favorite="props.isFavorite"
        @overlay="handleRecipeOverlay"
        @toggle-favorite="emit('toggle-favorite', $event)"
      />

      <div class="nei-title-bar">
        <div class="nei-title-shell">
          <img
            v-if="hasMachineIcon && getMachineIconPath"
            :src="getMachineIconPath"
            :alt="getMachineName(recipe.recipeType)"
            class="nei-machine-icon"
          />
          <div class="nei-title">{{ getMachineName(recipe.recipeType) }}</div>
        </div>
      </div>

      <!-- Recipe Area -->
      <div class="nei-recipe-area">
        <div class="nei-grid-panel nei-grid-panel-input">
          <div class="nei-panel-label">Input</div>
          <div
            class="nei-input-grid"
            :style="{
              gridTemplateColumns: `repeat(${inputGridDims.width}, 44px)`,
              gridTemplateRows: `repeat(${inputGridDims.height}, 44px)`
            }"
          >
            <template v-for="slot in inputSlotViewModels" :key="slot.key">
              <RecipeItemTooltip
                v-if="slot.item"
                :item-id="slot.item.itemId"
                :count="slot.item.count"
                @click="handleItemClick(slot.item.itemId)"
              >
                <div
                  class="nei-slot nei-slot-clickable"
                  @contextmenu="handleItemContextMenu(slot.item.itemId, $event)"
                >
                  <AnimatedItemIcon
                    :item-id="slot.item.itemId"
                    :render-asset-ref="slot.item.renderAssetRef || null"
                    :size="28"
                    class="nei-item-icon"
                  />
                  <span
                    v-if="slot.item.count > 1"
                    class="nei-item-count"
                  >
                    {{ slot.item.count }}
                  </span>
                </div>
              </RecipeItemTooltip>

              <div
                v-else
                class="nei-slot nei-slot-empty"
              />
            </template>
          </div>
        </div>

        <div class="nei-arrow-lane">
          <div class="nei-arrow">
            <svg viewBox="0 0 24 24" class="nei-arrow-icon" aria-hidden="true">
              <path d="M4 11h12.17l-5.59-5.59L12 4l8 8-8 8-1.41-1.41L16.17 13H4v-2z" fill="currentColor" />
            </svg>
          </div>
        </div>

        <div class="nei-grid-panel nei-grid-panel-output">
          <div class="nei-panel-label">Output</div>
          <div
            class="nei-output-grid"
            :style="{
              gridTemplateColumns: `repeat(${outputGridDims.width}, 44px)`,
              gridTemplateRows: `repeat(${outputGridDims.height}, 44px)`
            }"
          >
            <template v-for="slot in outputSlotViewModels" :key="slot.key">
              <RecipeItemTooltip
                v-if="slot.item"
                :item-id="slot.item.itemId"
                :count="slot.item.count"
                @click="handleItemClick(slot.item.itemId)"
              >
                <div
                  class="nei-slot nei-slot-clickable"
                  @contextmenu="handleItemContextMenu(slot.item.itemId, $event)"
                >
                  <AnimatedItemIcon
                    :item-id="slot.item.itemId"
                    :render-asset-ref="slot.item.renderAssetRef || null"
                    :size="28"
                    class="nei-item-icon"
                  />
                  <span
                    v-if="slot.item.count > 1"
                    class="nei-item-count"
                  >
                    {{ slot.item.count }}
                  </span>
                  <span
                    v-if="slot.item.probability && slot.item.probability < 1"
                    class="nei-probability"
                  >
                    {{ Math.round(slot.item.probability * 100) }}%
                  </span>
                </div>
              </RecipeItemTooltip>

              <div
                v-else
                class="nei-slot nei-slot-empty"
              />
            </template>
          </div>
        </div>
      </div>

    <!-- Fluid Inputs/Outputs - Bottom -->
    <div v-if="hasFluids" class="nei-fluid-area">
      <div v-if="fluidInputViewModels.length > 0" class="nei-fluid-section">
        <div class="nei-fluid-label">Fluid Input</div>
        <div class="nei-fluid-grid">
          <div
            v-for="(fluid, idx) in fluidInputViewModels"
            :key="`fluid-in-${idx}`"
            class="nei-fluid-slot"
            @mouseenter="showFluidTooltip($event, fluid)"
            @mouseleave="hideFluidTooltip"
            @mousemove="showFluidTooltip($event, fluid)"
          >
            <!-- Fluid Icon - Real texture or fallback -->
            <div class="nei-fluid-icon">
              <img
                v-if="fluidHasImage(fluid)"
                :src="getFluidImagePath(fluid)"
                :alt="fluid.localizedName || fluid.internalName"
                class="nei-fluid-image"
                @error="(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).nextElementSibling?.classList.remove('nei-fluid-fallback-hidden'); }"
              />
              <div
                class="nei-fluid-fallback"
                :class="{ 'nei-fluid-fallback-hidden': fluidHasImage(fluid) }"
                :style="{ background: getFluidColor(fluid.localizedName || fluid.internalName) }"
              >
                <svg viewBox="0 0 24 24" class="nei-fluid-svg">
                  <path d="M12 2c-5.33 4.55-8 8.48-8 11.8 0 4.98 3.8 8.2 8 8.2s8-3.22 8-8.2c0-3.32-2.67-7.25-8-11.8zm0 18c-3.35 0-6-2.57-6-6.2 0-2.34 1.95-5.44 6-9.14 4.05 3.7 6 6.8 6 9.14 0 3.63-2.65 6.2-6 6.2z" fill="currentColor"/>
                </svg>
              </div>
            </div>
            <span class="nei-fluid-name">{{ fluid.localizedName || fluid.internalName }}</span>
            <span class="nei-fluid-amount">{{ fluid.amount }}L</span>
          </div>
        </div>
      </div>
      <div v-if="fluidOutputViewModels.length > 0" class="nei-fluid-section">
        <div class="nei-fluid-label">Fluid Output</div>
        <div class="nei-fluid-grid">
          <div
            v-for="(fluid, idx) in fluidOutputViewModels"
            :key="`fluid-out-${idx}`"
            class="nei-fluid-slot"
            @mouseenter="showFluidTooltip($event, fluid)"
            @mouseleave="hideFluidTooltip"
            @mousemove="showFluidTooltip($event, fluid)"
          >
            <!-- Fluid Icon - Real texture or fallback -->
            <div class="nei-fluid-icon">
              <img
                v-if="fluidHasImage(fluid)"
                :src="getFluidImagePath(fluid)"
                :alt="fluid.localizedName || fluid.internalName"
                class="nei-fluid-image"
                @error="(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).nextElementSibling?.classList.remove('nei-fluid-fallback-hidden'); }"
              />
              <div
                class="nei-fluid-fallback"
                :class="{ 'nei-fluid-fallback-hidden': fluidHasImage(fluid) }"
                :style="{ background: getFluidColor(fluid.localizedName || fluid.internalName) }"
              >
                <svg viewBox="0 0 24 24" class="nei-fluid-svg">
                  <path d="M12 2c-5.33 4.55-8 8.48-8 11.8 0 4.98 3.8 8.2 8 8.2s8-3.22 8-8.2c0-3.32-2.67-7.25-8-11.8zm0 18c-3.35 0-6-2.57-6-6.2 0-2.34 1.95-5.44 6-9.14 4.05 3.7 6 6.8 6 9.14 0 3.63-2.65 6.2-6 6.2z" fill="currentColor"/>
                </svg>
              </div>
            </div>
            <span class="nei-fluid-name">{{ fluid.localizedName || fluid.internalName }}</span>
            <span class="nei-fluid-amount">{{ fluid.amount }}L</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Fluid Tooltip - Teleported to body -->
    <Teleport to="body">
      <div
        v-if="fluidTooltip.visible && fluidTooltip.fluid"
        class="fluid-tooltip-content"
        :style="{ left: fluidTooltip.x + 'px', top: fluidTooltip.y + 'px' }"
      >
        <!-- Fluid Header -->
        <div class="fluid-tooltip-header">
          <div class="fluid-tooltip-icon" :style="{ background: getFluidColor(fluidTooltip.fluid.localizedName || fluidTooltip.fluid.internalName) }">
            <!-- Real fluid image with SVG fallback -->
            <img
              v-if="fluidHasImage(fluidTooltip.fluid)"
              :src="getFluidImagePath(fluidTooltip.fluid)"
              :alt="fluidTooltip.fluid.localizedName || fluidTooltip.fluid.internalName"
              class="fluid-tooltip-image"
              @error="(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).nextElementSibling?.classList.remove('fluid-tooltip-svg-hidden'); }"
            />
            <svg viewBox="0 0 24 24" class="fluid-tooltip-svg" :class="{ 'fluid-tooltip-svg-hidden': fluidHasImage(fluidTooltip.fluid) }">
              <path d="M12 2c-5.33 4.55-8 8.48-8 11.8 0 4.98 3.8 8.2 8 8.2s8-3.22 8-8.2c0-3.32-2.67-7.25-8-11.8zm0 18c-3.35 0-6-2.57-6-6.2 0-2.34 1.95-5.44 6-9.14 4.05 3.7 6 6.8 6 9.14 0 3.63-2.65 6.2-6 6.2z" fill="white"/>
            </svg>
          </div>
          <div class="fluid-tooltip-title">
            <h3 class="fluid-name">{{ fluidTooltip.fluid.localizedName || fluidTooltip.fluid.internalName }}</h3>
            <p class="fluid-type">Fluid</p>
          </div>
        </div>

        <!-- Fluid Details -->
        <div class="fluid-tooltip-details">
          <div class="fluid-detail-row">
            <span class="fluid-detail-label">Amount:</span>
            <span class="fluid-detail-value">{{ fluidTooltip.fluid.amount }} L</span>
          </div>
          <div v-if="fluidTooltip.fluid.temperature" class="fluid-detail-row">
            <span class="fluid-detail-label">Temperature:</span>
            <span class="fluid-detail-value">{{ fluidTooltip.fluid.temperature }} K</span>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Parameters Area - Bottom -->
    <div v-if="hasGTData" class="nei-params-area">
      <div v-if="recipe.additionalData?.voltage" class="nei-param-row">
        <span class="nei-param-label">Total EU:</span>
        <span class="nei-param-value">{{ getTotalEU() }} EU</span>
      </div>
      <div v-if="recipe.additionalData?.voltage" class="nei-param-row">
        <span class="nei-param-label">Power Draw:</span>
        <span class="nei-param-value">{{ formatEUt(recipe.additionalData.voltage, recipe.additionalData.amperage) }}</span>
      </div>
      <div v-if="recipe.additionalData?.duration" class="nei-param-row">
        <span class="nei-param-label">Duration:</span>
        <span class="nei-param-value">{{ formatDuration(recipe.additionalData.duration) }}</span>
      </div>
      <div v-if="recipe.additionalData?.heatCapacity" class="nei-param-row">
        <span class="nei-param-label">Heat:</span>
        <span class="nei-param-value">{{ recipe.additionalData.heatCapacity }} K</span>
      </div>
      <div v-if="recipe.additionalData?.voltageTier" class="nei-param-row">
        <span class="nei-param-label">Voltage Tier:</span>
        <span :class="['nei-param-value', getVoltageColor(recipe.additionalData.voltageTier)]">
          {{ formatVoltageTier(recipe.additionalData.voltageTier) }}
        </span>
      </div>
        </div>
      </div>
  </div>
</template>

<style scoped>
/* ========================================
   CYBERPUNK RECIPE DISPLAY
   Industrial-style recipe detail display
   ======================================== */

/* Scaling Wrapper */
.nei-recipe-wrapper {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Main Recipe Container - Industrial Tech Panel */
.nei-recipe {
  background:
    linear-gradient(180deg, rgba(9, 13, 20, 0.95), rgba(6, 10, 16, 0.98)),
    radial-gradient(circle at top, rgba(34, 211, 238, 0.08), transparent 42%);
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 18px;
  padding: 0;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 13px;
  color: #d9ecff;
  box-shadow:
    0 18px 50px rgba(2, 8, 23, 0.38),
    inset 0 1px 0 rgba(255, 255, 255, 0.06);
  margin-bottom: 12px;
  position: relative;
  overflow: hidden;
}

.nei-recipe::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.03),
    inset 0 1px 0 rgba(255, 255, 255, 0.04);
  pointer-events: none;
}

.nei-recipe:hover::before {
  box-shadow:
    inset 0 0 0 1px rgba(148, 163, 184, 0.16),
    inset 0 1px 0 rgba(255, 255, 255, 0.06);
}

/* Grid Pattern Overlay */
.nei-recipe::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background:
    linear-gradient(rgba(255, 255, 255, 0.014) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.014) 1px, transparent 1px);
  background-size: 18px 18px;
  pointer-events: none;
  opacity: 0.35;
}

/* Title Bar - Holographic Header */
.nei-title-bar {
  background:
    linear-gradient(180deg, rgba(29, 36, 47, 0.94), rgba(18, 23, 30, 0.98)),
    linear-gradient(90deg, rgba(255, 255, 255, 0.06), transparent 58%);
  border-bottom: 1px solid rgba(148, 163, 184, 0.18);
  padding: 10px 18px 9px;
  display: flex;
  justify-content: center;
  position: relative;
}

.nei-title-bar::before {
  content: '';
  position: absolute;
  bottom: 0;
  left: 18px;
  right: 18px;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(148, 163, 184, 0.3), transparent);
}

.nei-title-shell {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  max-width: 100%;
}

.nei-machine-icon {
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  image-rendering: pixelated;
  image-rendering: crisp-edges;
  filter: drop-shadow(0 1px 1px rgba(15, 23, 42, 0.55));
}

.nei-title {
  color: #f3f7fb;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 1.2px;
  text-transform: uppercase;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Recipe Area - Main Layout */
.nei-recipe-area {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 18px 16px 14px;
  background:
    linear-gradient(180deg, rgba(11, 16, 24, 0.86), rgba(8, 12, 18, 0.92)),
    url('/textures/nei/recipebg.png');
  background-repeat: repeat;
  background-size: auto, 128px 128px;
  position: relative;
  z-index: 1;
}

.nei-grid-panel {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 88px;
  padding: 18px 12px 12px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 12px;
  background:
    linear-gradient(180deg, rgba(18, 24, 32, 0.94), rgba(10, 14, 20, 0.98)),
    radial-gradient(circle at top, rgba(255, 255, 255, 0.05), transparent 48%),
    url('/textures/nei/recipebg.png');
  background-repeat: no-repeat, no-repeat, repeat;
  background-size: auto, auto, 96px 96px;
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.03),
    0 10px 24px rgba(2, 8, 23, 0.2);
}

.nei-grid-panel::after {
  content: '';
  position: absolute;
  inset: 8px;
  border: 1px solid rgba(255, 255, 255, 0.04);
  border-radius: 8px;
  pointer-events: none;
}

.nei-grid-panel-output {
  background:
    linear-gradient(180deg, rgba(32, 27, 20, 0.92), rgba(16, 13, 10, 0.98)),
    radial-gradient(circle at top, rgba(245, 208, 138, 0.08), transparent 48%),
    url('/textures/nei/recipebg.png');
  background-repeat: no-repeat, no-repeat, repeat;
  background-size: auto, auto, 96px 96px;
}

.nei-panel-label,
.nei-fluid-label {
  position: absolute;
  top: -9px;
  left: 12px;
  min-width: 86px;
  padding: 4px 10px 3px 12px;
  background:
    linear-gradient(180deg, rgba(74, 80, 89, 0.98), rgba(54, 59, 67, 0.98)),
    url('/textures/nei/catalyst_tab.png');
  background-repeat: no-repeat;
  background-position: center;
  background-size: cover;
  border: 1px solid rgba(198, 207, 220, 0.24);
  border-radius: 6px 6px 4px 4px;
  color: #eef4fb;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.14em;
  line-height: 1;
  text-transform: uppercase;
  box-shadow: 0 4px 10px rgba(2, 8, 23, 0.22);
  z-index: 1;
}

/* Input/Output Grids */
.nei-input-grid,
.nei-output-grid {
  display: grid;
  gap: 4px;
  background: transparent;
  padding: 0;
  border: none;
  position: relative;
  justify-content: center;
  align-content: center;
  z-index: 1;
}

.nei-grid-panel-output .nei-slot {
  border-color: rgba(217, 182, 122, 0.3);
}

.nei-grid-panel-output .nei-slot-clickable:hover {
  border-color: rgba(245, 208, 138, 0.78);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.14),
    0 0 0 1px rgba(245, 208, 138, 0.12),
    0 10px 18px rgba(180, 83, 9, 0.18);
}

/* Slot - Enhanced Tech Design */
.nei-slot {
  position: relative;
  width: 44px;
  height: 44px;
  background:
    linear-gradient(180deg, rgba(11, 16, 24, 0.88), rgba(6, 10, 16, 0.92)),
    url('/textures/nei/slot.png');
  background-repeat: no-repeat;
  background-position: center;
  background-size: 100% 100%, 18px 18px;
  border: 1px solid rgba(148, 163, 184, 0.28);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.06),
    0 6px 12px rgba(2, 8, 23, 0.28);
  transition: all 0.22s ease;
  overflow: hidden;
}

.nei-slot::before {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 30% 25%, rgba(255, 255, 255, 0.14), transparent 48%);
  opacity: 0.55;
}

.nei-slot-clickable:hover::before {
  opacity: 0.9;
}

.nei-slot-empty {
  background:
    linear-gradient(180deg, rgba(8, 12, 18, 0.72), rgba(6, 10, 16, 0.8)),
    url('/textures/nei/slot.png');
  background-repeat: no-repeat;
  background-position: center;
  background-size: 100% 100%, 18px 18px;
  border-color: rgba(148, 163, 184, 0.12);
  opacity: 0.45;
}

.nei-slot-clickable {
  cursor: pointer;
}

.nei-slot-clickable:hover {
  border-color: rgba(103, 232, 249, 0.7);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.14),
    0 0 0 1px rgba(34, 211, 238, 0.18),
    0 10px 18px rgba(8, 145, 178, 0.2);
  transform: translateY(-1px);
}

/* Item Icon - Enhanced with Glow + Lazy Loading */
.nei-item-icon {
  width: 28px;
  height: 28px;
  image-rendering: pixelated;
  image-rendering: crisp-edges;
  display: block;
  transition: all 0.3s ease;
  position: relative;
  z-index: 1;
  filter: drop-shadow(0 1px 2px rgba(15, 23, 42, 0.6));
  animation: item-pop-in 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
  /* Lazy loading and layout stability */
  contain: strict;
  content-visibility: auto;
  min-height: 28px;
  min-width: 28px;
}

@keyframes item-pop-in {
  0% {
    transform: scale(0);
    opacity: 0;
  }
  50% {
    transform: scale(1.2);
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}

.nei-slot-clickable:hover .nei-item-icon {
  transform: scale(1.06);
  filter: drop-shadow(0 2px 4px rgba(8, 145, 178, 0.28));
}

/* Item Count - Tech Badge Style */
.nei-item-count {
  position: absolute;
  bottom: 2px;
  right: 2px;
  background: rgba(15, 23, 42, 0.82);
  color: #f8fafc;
  font-size: 10px;
  font-weight: bold;
  padding: 1px 3px;
  border-radius: 4px;
  text-shadow: 0 1px 1px rgba(15, 23, 42, 0.92);
  line-height: 1;
  pointer-events: none;
  border: 1px solid rgba(148, 163, 184, 0.24);
  z-index: 2;
  font-family: 'Consolas', monospace;
  animation: count-pop 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55) 0.1s both;
}

@keyframes count-pop {
  0% {
    transform: scale(0) translateY(10px);
    opacity: 0;
  }
  70% {
    transform: scale(1.2) translateY(-2px);
  }
  100% {
    transform: scale(1) translateY(0);
    opacity: 1;
  }
}

.nei-probability {
  position: absolute;
  top: 2px;
  left: 2px;
  background: rgba(255, 244, 214, 0.94);
  color: #9a3412;
  font-size: 8px;
  font-weight: bold;
  padding: 1px 3px;
  border-radius: 999px;
  text-shadow: none;
  line-height: 1;
  pointer-events: none;
  border: 1px solid rgba(251, 191, 36, 0.24);
  box-shadow: none;
  z-index: 2;
  font-family: 'Consolas', monospace;
  animation: probability-pop 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55) 0.15s both;
}

@keyframes probability-pop {
  0% {
    transform: scale(0) rotate(-15deg);
    opacity: 0;
  }
  60% {
    transform: scale(1.3) rotate(5deg);
  }
  100% {
    transform: scale(1) rotate(0deg);
    opacity: 1;
  }
}

@keyframes probability-pulse {
  0%, 100% {
    box-shadow: 0 0 15px rgba(255, 0, 60, 0.7);
  }
  50% {
    box-shadow: 0 0 20px rgba(255, 0, 60, 1);
  }
}

.nei-arrow-lane {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 30px;
  align-self: stretch;
}

.nei-arrow {
  width: 30px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  color: rgba(210, 218, 230, 0.86);
}

.nei-arrow-icon {
  width: 18px;
  height: 18px;
  position: relative;
  z-index: 1;
}

.nei-arrow::before {
  content: '';
  position: absolute;
  left: 1px;
  right: 5px;
  top: 50%;
  height: 6px;
  transform: translateY(-50%);
  background: url('/textures/nei/dash.png') center / 100% 2px no-repeat;
  opacity: 0.55;
}

/* Fluid Area - Industrial Panel */
.nei-fluid-area {
  padding: 12px 16px 14px;
  background: linear-gradient(180deg, rgba(10, 14, 20, 0.86), rgba(7, 10, 15, 0.96));
  border-top: 1px solid rgba(148, 163, 184, 0.16);
  display: flex;
  flex-direction: column;
  gap: 10px;
  position: relative;
  z-index: 1;
}

.nei-fluid-section {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 10px;
  padding: 16px 12px 12px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 12px;
  background:
    linear-gradient(180deg, rgba(17, 22, 29, 0.92), rgba(10, 13, 18, 0.98)),
    url('/textures/nei/recipebg.png');
  background-repeat: no-repeat, repeat;
  background-size: auto, 96px 96px;
}

.nei-fluid-label {
  min-width: 104px;
}

.nei-fluid-grid {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.nei-fluid-slot {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  padding: 8px 8px 7px;
  background:
    linear-gradient(180deg, rgba(19, 24, 31, 0.92), rgba(10, 14, 20, 0.98)),
    url('/textures/nei/slot.png');
  background-repeat: no-repeat;
  background-position: center;
  background-size: auto, 16px 16px;
  border: 1px solid rgba(148, 163, 184, 0.24);
  border-radius: 10px;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.06),
    0 6px 14px rgba(2, 8, 23, 0.18);
  transition: all 0.22s ease;
  cursor: pointer;
  min-width: 66px;
}

.nei-fluid-slot:hover {
  border-color: rgba(103, 232, 249, 0.65);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.14),
    0 0 0 1px rgba(34, 211, 238, 0.12),
    0 10px 18px rgba(8, 145, 178, 0.16);
  transform: translateY(-1px);
}

/* Fluid Icon - Same size as item icons (52px) */
.nei-fluid-icon {
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  box-shadow:
    inset 0 1px 2px rgba(0, 0, 0, 0.35),
    inset 0 1px 0 rgba(255, 255, 255, 0.12),
    0 4px 10px rgba(15, 23, 42, 0.28);
  position: relative;
  overflow: hidden;
  background:
    linear-gradient(180deg, rgba(19, 24, 31, 0.94), rgba(10, 14, 20, 0.98)),
    url('/textures/nei/slot.png');
  background-repeat: no-repeat;
  background-position: center;
  background-size: cover;
}

.nei-fluid-icon::before {
  content: '';
  position: absolute;
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  background: linear-gradient(
    45deg,
    transparent 40%,
    rgba(255, 255, 255, 0.1) 50%,
    transparent 60%
  );
  transform: rotate(0deg);
  transition: transform 0.6s ease;
  pointer-events: none;
  z-index: 1;
}

.nei-fluid-slot:hover .nei-fluid-icon::before {
  transform: rotate(180deg);
}

/* Fluid Image - Real texture */
.nei-fluid-image {
  width: 34px;
  height: 34px;
  image-rendering: pixelated;
  image-rendering: crisp-edges;
  display: block;
  position: relative;
  z-index: 0;
  filter: drop-shadow(0 1px 2px rgba(15, 23, 42, 0.45));
}

/* Fluid Fallback - SVG icon when no image available */
.nei-fluid-fallback {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  position: absolute;
  top: 0;
  left: 0;
  z-index: 0;
}

.nei-fluid-fallback-hidden {
  display: none;
}

.nei-fluid-svg {
  width: 30px;
  height: 30px;
  filter: drop-shadow(0 1px 2px rgba(255, 255, 255, 0.35));
}

.nei-fluid-name {
  color: #dbe8f6;
  font-size: 10px;
  font-weight: 600;
  text-align: center;
  max-width: 90px;
  word-wrap: break-word;
  line-height: 1.15;
}

.nei-fluid-amount {
  color: #a9bed6;
  font-size: 10px;
  font-weight: 700;
}

/* Parameters Area - Tech Info Panel */
.nei-params-area {
  padding: 10px 14px 12px;
  background: linear-gradient(180deg, rgba(10, 14, 20, 0.88), rgba(7, 10, 15, 0.96));
  border-top: 1px solid rgba(148, 163, 184, 0.16);
  display: flex;
  flex-direction: column;
  gap: 4px;
  position: relative;
  z-index: 1;
}

.nei-param-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 0;
  border-bottom: 1px solid rgba(0, 255, 247, 0.1);
  transition: all 0.3s ease;
}

.nei-param-row:last-child {
  border-bottom: none;
}

.nei-param-row:hover {
  background: rgba(148, 163, 184, 0.05);
  padding-left: 8px;
  padding-right: 8px;
  margin-left: -8px;
  margin-right: -8px;
}

.nei-param-label {
  color: #b8c5d6;
  font-size: 11px;
  font-weight: normal;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.nei-param-value {
  color: #f3f7fb;
  font-size: 11px;
  font-weight: bold;
  text-align: right;
  text-shadow: none;
  font-family: 'Consolas', monospace;
}

/* Voltage tier stays color-coded, but without the separate neon visual language. */
.text-ulv { color: #86efac; text-shadow: none; }
.text-lv { color: #fde68a; text-shadow: none; }
.text-mv { color: #fdba74; text-shadow: none; }
.text-hv { color: #fca5a5; text-shadow: none; }
.text-ev { color: #d8b4fe; text-shadow: none; }
.text-iv { color: #93c5fd; text-shadow: none; }
.text-luv { color: #7dd3fc; text-shadow: none; }
.text-zpm { color: #e9d5ff; text-shadow: none; }
.text-uv { color: #e9d5ff; text-shadow: none; }
.text-uhv { color: #c4b5fd; text-shadow: none; }
.text-uev { color: #f0abfc; text-shadow: none; }
.text-uiv { color: #fda4af; text-shadow: none; }
.text-umv { color: #6ee7b7; text-shadow: none; }
.text-uxv { color: #67e8f9; text-shadow: none; }
.text-max { color: #fcd34d; text-shadow: none; }
.text-gray-400 { color: #7a8a9a; text-shadow: none; }

/* Responsive */
@media (max-width: 640px) {
  .nei-title-bar {
    padding-inline: 12px;
  }

  .nei-recipe-area {
    gap: 8px;
    padding: 16px 12px 12px;
    flex-wrap: wrap;
  }

  .nei-arrow-lane {
    min-width: 100%;
    min-height: 18px;
  }

  .nei-fluid-area {
    gap: 8px;
    padding: 10px 12px 12px;
  }

  .nei-params-area {
    padding: 8px 12px 10px;
  }

  .nei-title {
    font-size: 12px;
    letter-spacing: 1px;
  }
}

</style>

<style>
.fluid-tooltip-content {
  position: fixed;
  z-index: 10000;
  pointer-events: none;
  min-width: 260px;
  max-width: 380px;
  background:
    linear-gradient(180deg, rgba(11, 16, 24, 0.96), rgba(7, 11, 17, 0.98)),
    url('/textures/nei/recipebg.png');
  background-repeat: repeat;
  background-size: auto, 96px 96px;
  border: 1px solid rgba(148, 163, 184, 0.26);
  border-radius: 12px;
  backdrop-filter: blur(18px);
  box-shadow:
    0 16px 36px rgba(2, 8, 23, 0.44),
    inset 0 1px 0 rgba(255, 255, 255, 0.08);
  animation: fluid-tooltip-fade-in 0.15s ease-out;
  overflow: hidden;
}

@keyframes fluid-tooltip-fade-in {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.fluid-tooltip-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: linear-gradient(180deg, rgba(29, 36, 47, 0.94), rgba(18, 23, 30, 0.98));
  border-bottom: 1px solid rgba(148, 163, 184, 0.18);
}

.fluid-tooltip-icon {
  width: 52px;
  height: 52px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  box-shadow:
    inset 0 2px 4px rgba(0, 0, 0, 0.24),
    inset 0 1px 0 rgba(255, 255, 255, 0.18),
    0 4px 12px rgba(15, 23, 42, 0.28);
  flex-shrink: 0;
  position: relative;
  overflow: hidden;
}

.fluid-tooltip-icon::before {
  content: '';
  position: absolute;
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  background: linear-gradient(
    45deg,
    transparent 40%,
    rgba(255, 255, 255, 0.15) 50%,
    transparent 60%
  );
  animation: fluid-shimmer 2.6s linear infinite;
}

@keyframes fluid-shimmer {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

.fluid-tooltip-svg {
  width: 36px;
  height: 36px;
  filter: drop-shadow(0 1px 2px rgba(255, 255, 255, 0.4));
}

.fluid-tooltip-svg-hidden {
  display: none;
}

.fluid-tooltip-image {
  width: 48px;
  height: 48px;
  image-rendering: pixelated;
  image-rendering: crisp-edges;
  object-fit: contain;
  display: block;
  position: relative;
  z-index: 1;
  filter: drop-shadow(0 1px 2px rgba(15, 23, 42, 0.45));
}

.fluid-tooltip-title {
  flex: 1;
  min-width: 0;
}

.fluid-tooltip-title .fluid-name {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: #f3f7fb;
  text-shadow: none;
  line-height: 1.3;
  word-wrap: break-word;
}

.fluid-type {
  margin: 2px 0 0 0;
  font-size: 11px;
  color: #9fb2c8;
  font-family: 'Courier New', monospace;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.fluid-tooltip-details {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.fluid-detail-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 13px;
}

.fluid-detail-label {
  color: #a9bed6;
  font-weight: 600;
  flex-shrink: 0;
}

.fluid-detail-value {
  color: #ffffff;
  font-weight: 500;
  text-align: right;
  word-wrap: break-word;
  flex: 1;
}
</style>
