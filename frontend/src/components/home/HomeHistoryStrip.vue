<script setup lang="ts">
import { computed } from "vue";
import type { BrowserGridEntry, Item } from "../../services/api";
import { resolveDistDataNativeRuntimeManifestPath } from "../../services/distDataRuntime";
import NativeBrowserSurface from "../native-surface/NativeBrowserSurface.vue";

const props = defineProps<{
  viewHistoryCount: number;
  historyItemPixelSize: number;
  historyRows: number;
  historyGridGap: number;
  historyBrowserEntries: BrowserGridEntry[];
}>();

const emit = defineEmits<{
  itemClick: [item: Item];
  itemContextmenu: [item: Item, event: MouseEvent];
  panelResize: [element: HTMLElement | null];
}>();

const bindPanelRef = (element: HTMLElement | null) => {
  emit("panelResize", element);
};

const historyItemIds = computed(() =>
  props.historyBrowserEntries.map((entry) =>
    entry.kind === "item" ? entry.item.itemId : entry.group.representative.itemId,
  ),
);

const nativeRuntimeManifestUrl = resolveDistDataNativeRuntimeManifestPath();
</script>

<template>
  <div
    :ref="bindPanelRef"
    class="history-strip flex-shrink-0 overflow-hidden px-4 pt-3 pb-1"
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
      <NativeBrowserSurface
        surface-id="history"
        viewport-role="history"
        :item-size="historyItemPixelSize"
        :manifest-url="nativeRuntimeManifestUrl"
        :enable-animation="false"
        :history-item-ids="historyItemIds"
        @item-click="emit('itemClick', $event)"
        @item-contextmenu="(item, event) => emit('itemContextmenu', item, event)"
        @viewport-resize="emit('panelResize', $event)"
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
