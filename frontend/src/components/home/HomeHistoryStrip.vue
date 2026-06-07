<script setup lang="ts">
import { defineAsyncComponent } from "vue";
import type { BrowserGridEntry, Item } from "../../services/api";
import type { PageAtlasResult } from "../../services/pageAtlas";

const HomeCanvasGrid = defineAsyncComponent(() => import("../HomeCanvasGrid.vue"));

defineProps<{
  viewHistoryCount: number;
  historyItemPixelSize: number;
  historyRows: number;
  historyGridGap: number;
  historyBrowserEntries: BrowserGridEntry[];
  historyAtlas: PageAtlasResult | null | undefined;
}>();

const emit = defineEmits<{
  itemClick: [item: Item];
  itemContextmenu: [item: Item, event: MouseEvent];
  panelResize: [element: HTMLElement | null];
}>();

const bindPanelRef = (element: HTMLElement | null) => {
  emit("panelResize", element);
};
</script>

<template>
  <div
    :ref="bindPanelRef"
    class="flex-shrink-0 overflow-hidden border-t-2 border-dashed border-slate-300/50 px-4 pt-3 pb-1"
    :style="{
      minHeight: `${historyItemPixelSize * historyRows + (historyRows - 1) * historyGridGap + 24}px`,
      height: `${historyItemPixelSize * historyRows + (historyRows - 1) * historyGridGap + 24}px`,
      maxHeight: `${historyItemPixelSize * historyRows + (historyRows - 1) * historyGridGap + 24}px`,
    }"
  >
    <div
      v-if="viewHistoryCount > 0"
      class="h-full w-full overflow-hidden"
    >
      <HomeCanvasGrid
        :entries="historyBrowserEntries"
        :item-size="historyItemPixelSize"
        :atlas="historyAtlas"
        :enable-animation="false"
        :prefer-atlas="true"
        @item-click="emit('itemClick', $event)"
        @item-contextmenu="(item, event) => emit('itemContextmenu', item, event)"
      />
    </div>
    <div
      v-else
      class="h-full flex items-center justify-center text-xs text-slate-200/65"
    >
      暂无浏览记录
    </div>
  </div>
</template>
