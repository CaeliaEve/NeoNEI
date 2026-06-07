<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { BrowserGridEntry, BrowserVariantGroup, Item } from "../../services/api";
import type { PageAtlasResult } from "../../services/pageAtlas";
import { createNativeSurfaceController } from "../../native-surface/NativeSurfaceController";
import type { NativeSurfaceId, NativeSurfaceViewportRole } from "../../native-surface/contracts";
import { exposeNativeSurfaceMetricsForDebug } from "../../native-surface/NativeSurfaceMetrics";

const HomeCanvasGrid = defineAsyncComponent(() => import("../HomeCanvasGrid.vue"));

const props = withDefaults(defineProps<{
  surfaceId: NativeSurfaceId;
  viewportRole?: NativeSurfaceViewportRole;
  entries: BrowserGridEntry[];
  itemSize: number;
  atlas?: PageAtlasResult | null;
  enableAnimation?: boolean;
  preferAtlas?: boolean;
  historyItemIds?: string[];
}>(), {
  viewportRole: "browser",
  atlas: null,
  enableAnimation: true,
  preferAtlas: true,
  historyItemIds: () => [],
});

const emit = defineEmits<{
  itemClick: [item: Item];
  itemContextmenu: [item: Item, event: MouseEvent];
  groupClick: [group: BrowserVariantGroup];
  groupContextmenu: [group: BrowserVariantGroup, event: MouseEvent];
  viewportResize: [element: HTMLElement | null];
}>();

const hostRef = ref<HTMLElement | null>(null);
const controller = createNativeSurfaceController(props.surfaceId);
let resizeObserver: ResizeObserver | null = null;

const itemIdsSignature = computed(() => props.historyItemIds.join("|"));

function emitViewportResize() {
  emit("viewportResize", hostRef.value);
}

function syncViewport(width?: number, height?: number) {
  const host = hostRef.value;
  if (!host) return;
  const nextWidth = Math.max(0, Math.floor(width ?? host.clientWidth));
  const nextHeight = Math.max(0, Math.floor(height ?? host.clientHeight));
  controller.setViewport({
    width: nextWidth,
    height: nextHeight,
    devicePixelRatio: window.devicePixelRatio || 1,
    browserRect: {
      x: 0,
      y: 0,
      width: nextWidth,
      height: nextHeight,
    },
    historyRect: props.viewportRole === "history"
      ? {
        x: 0,
        y: 0,
        width: nextWidth,
        height: nextHeight,
      }
      : undefined,
  });
}

function toLocalPointer(event: MouseEvent) {
  const host = hostRef.value;
  const bounds = host?.getBoundingClientRect();
  return {
    x: Math.max(0, event.clientX - (bounds?.left ?? 0)),
    y: Math.max(0, event.clientY - (bounds?.top ?? 0)),
    clientX: event.clientX,
    clientY: event.clientY,
    viewport: props.viewportRole,
  };
}

function handlePointerMove(event: MouseEvent) {
  const pointer = toLocalPointer(event);
  controller.setHover(pointer);
  void controller.hitTest(pointer);
}

function handlePointerLeave() {
  controller.setHover(null);
}

onMounted(async () => {
  exposeNativeSurfaceMetricsForDebug();
  await controller.initialize({
    surfaceId: props.surfaceId,
    preferredRenderer: "compat-canvas",
    enableAnimations: props.enableAnimation,
    enableHistoryViewport: props.viewportRole === "history",
  });
  controller.setItemSize(props.itemSize);
  controller.setCompatEntries({ entries: props.entries, atlas: props.atlas ?? null });
  controller.setHistoryItems(props.historyItemIds);
  syncViewport();
  emitViewportResize();
  resizeObserver = new ResizeObserver((entries) => {
    const rect = entries[0]?.contentRect;
    syncViewport(rect?.width, rect?.height);
    emitViewportResize();
  });
  if (hostRef.value) {
    resizeObserver.observe(hostRef.value);
  }
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
  controller.destroy();
  emit("viewportResize", null);
});

watch(
  () => [props.entries, props.atlas] as const,
  () => {
    controller.setCompatEntries({ entries: props.entries, atlas: props.atlas ?? null });
    controller.requestFrame(performance.now());
  },
  { deep: false },
);

watch(
  () => props.itemSize,
  (size) => {
    controller.setItemSize(size);
    controller.requestFrame(performance.now());
  },
);

watch(
  () => props.enableAnimation,
  (enabled) => {
    void controller.initialize({
      surfaceId: props.surfaceId,
      preferredRenderer: "compat-canvas",
      enableAnimations: enabled,
      enableHistoryViewport: props.viewportRole === "history",
    });
  },
);

watch(itemIdsSignature, () => {
  controller.setHistoryItems(props.historyItemIds);
});
</script>

<template>
  <div
    ref="hostRef"
    class="native-browser-surface h-full w-full overflow-hidden"
    @mousemove="handlePointerMove"
    @mouseleave="handlePointerLeave"
  >
    <HomeCanvasGrid
      :entries="entries"
      :item-size="itemSize"
      :atlas="atlas"
      :enable-animation="enableAnimation"
      :prefer-atlas="preferAtlas"
      @item-click="emit('itemClick', $event)"
      @item-contextmenu="(item, event) => emit('itemContextmenu', item, event)"
      @group-click="emit('groupClick', $event)"
      @group-contextmenu="(group, event) => emit('groupContextmenu', group, event)"
    />
  </div>
</template>
