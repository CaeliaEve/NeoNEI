<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { BrowserGridEntry, BrowserVariantGroup, Item } from "../../services/api";
import type { PageAtlasResult } from "../../services/pageAtlas";
import { createNativeSurfaceController } from "../../native-surface/NativeSurfaceController";
import type {
  NativeRendererBackendKind,
  NativeSurfaceId,
  NativeSurfaceLayoutCommand,
  NativeSurfaceViewportRole,
} from "../../native-surface/contracts";
import { exposeNativeSurfaceMetricsForDebug } from "../../native-surface/NativeSurfaceMetrics";
import { postNativeRenderEvent } from "../../native-surface/NativeRenderWorkerClient";
import {
  ensureGlobalBrowserAtlasIndex,
  getGlobalBrowserAtlasSpriteDescriptorForItem,
  getGlobalBrowserAtlasTextureDescriptorsForItems,
} from "../../services/globalBrowserAtlas";
import type { NativeRenderSpriteCommand } from "../../native-surface/NativeSurfaceRenderProtocol";

const HomeCanvasGrid = defineAsyncComponent(() => import("../HomeCanvasGrid.vue"));

const props = withDefaults(defineProps<{
  surfaceId: NativeSurfaceId;
  viewportRole?: NativeSurfaceViewportRole;
  entries: BrowserGridEntry[];
  itemSize: number;
  atlas?: PageAtlasResult | null;
  manifestUrl?: string | null;
  enableAnimation?: boolean;
  preferAtlas?: boolean;
  historyItemIds?: string[];
}>(), {
  viewportRole: "browser",
  atlas: null,
  manifestUrl: null,
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
const nativeRenderCanvasRef = ref<HTMLCanvasElement | null>(null);
const controller = createNativeSurfaceController(props.surfaceId);
let resizeObserver: ResizeObserver | null = null;
let nativeFrameSeq = 0;
let nativeTextureSeq = 0;
let nativeHitSeq = 0;
const nativeLayoutCommands = ref<NativeSurfaceLayoutCommand[] | null>(null);
const nativeLayoutCommandBuffer = ref<ArrayBuffer | null>(null);
const nativeLayoutCommandStride = ref(0);
const nativeLayoutCommandCount = ref(0);
const nativeRenderVisible = ref(false);
const nativeHoveredHit = ref<{
  kind: BrowserGridEntry["kind"];
  item: Item;
  group?: BrowserVariantGroup;
} | null>(null);
const nativeHoveredPointer = ref({ x: 0, y: 0 });
let nativeRenderInitialized = false;
let nativeRenderInitializing = false;

const itemIdsSignature = computed(() => props.historyItemIds.join("|"));

function normalizeNativeRenderBackend(value: unknown): Exclude<NativeRendererBackendKind, "compat-canvas"> {
  const normalized = `${value ?? ""}`.trim().toLowerCase();
  if (normalized === "webgpu" || normalized === "auto") return normalized;
  return "webgl2";
}

function resolveNativeRenderBackend(): Exclude<NativeRendererBackendKind, "compat-canvas"> {
  const envBackend = normalizeNativeRenderBackend(import.meta.env.VITE_NATIVE_RENDER_BACKEND);
  if (envBackend !== "webgl2") return envBackend;
  if (typeof window === "undefined") return envBackend;
  try {
    return normalizeNativeRenderBackend(window.localStorage.getItem("neonei:native-render-backend"));
  } catch {
    return envBackend;
  }
}

const nativeTooltipTitle = computed(() => {
  const hit = nativeHoveredHit.value;
  if (!hit) return "";
  if (hit.kind === "item") {
    const baseName = hit.item.localizedName || hit.item.internalName || hit.item.itemId;
    if (hit.item.browserGroupKey && Number(hit.item.browserGroupSize ?? 1) > 1) {
      return `${baseName} · variant`;
    }
    return baseName;
  }
  return hit.group?.label || hit.group?.key || hit.item.localizedName || hit.item.itemId;
});

const nativeTooltipSubtitle = computed(() => {
  const hit = nativeHoveredHit.value;
  if (!hit) return "";
  if (hit.kind === "item") {
    if (hit.item.browserGroupKey && Number(hit.item.browserGroupSize ?? 1) > 1) {
      return `Variant in ${hit.item.browserGroupSize} item semantic group · Left click: recipes · Right click: uses`;
    }
    return hit.item.modId ? `${hit.item.modId} · Left click: recipes · Right click: uses` : "Left click: recipes · Right click: uses";
  }
  return hit.group ? `${hit.group.size} grouped variants · Click to expand` : "Grouped variants";
});

const nativeTooltipStyle = computed<Record<string, string> | null>(() => {
  const host = hostRef.value;
  if (!nativeHoveredHit.value || !host) return null;
  const maxWidth = 260;
  const x = Math.min(Math.max(8, nativeHoveredPointer.value.x + 14), Math.max(8, host.clientWidth - maxWidth - 8));
  const y = Math.min(Math.max(8, nativeHoveredPointer.value.y + 14), Math.max(8, host.clientHeight - 72));
  return {
    transform: `translate(${Math.round(x)}px, ${Math.round(y)}px)`,
  };
});

function getEntryItem(entry: BrowserGridEntry): Item {
  return entry.kind === "item" ? entry.item : entry.group.representative;
}

function findEntryByNativeHit(hit: Awaited<ReturnType<typeof controller.hitTest>>): BrowserGridEntry | null {
  if (!hit) return null;
  return props.entries.find((entry) => {
    if (hit.groupKey) {
      return entry.kind !== "item" && entry.group.key === hit.groupKey;
    }
    return getEntryItem(entry).itemId === hit.item.itemId;
  }) ?? null;
}

function emitViewportResize() {
  emit("viewportResize", hostRef.value);
}

async function initializeNativeRenderWorker(width: number, height: number) {
  const canvas = nativeRenderCanvasRef.value;
  if (
    nativeRenderInitialized
    || nativeRenderInitializing
    || !canvas
    || typeof canvas.transferControlToOffscreen !== "function"
  ) {
    return;
  }
  nativeRenderInitializing = true;
  try {
    canvas.width = Math.max(1, width);
    canvas.height = Math.max(1, height);
    const offscreen = canvas.transferControlToOffscreen();
    const response = await postNativeRenderEvent({
      type: "initialize",
      canvas: offscreen,
      renderer: resolveNativeRenderBackend(),
    });
    nativeRenderInitialized = response?.type === "ready";
    nativeRenderVisible.value = nativeRenderInitialized;
  } finally {
    nativeRenderInitializing = false;
  }
}

function syncViewport(width?: number, height?: number) {
  const host = hostRef.value;
  if (!host) return;
  const nextWidth = Math.max(0, Math.floor(width ?? host.clientWidth));
  const nextHeight = Math.max(0, Math.floor(height ?? host.clientHeight));
  const viewport = {
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
  };
  controller.setViewport(viewport);
  if (!nativeRenderInitialized) {
    void initializeNativeRenderWorker(nextWidth, nextHeight).then(() => syncNativeTextures());
  } else if (nativeRenderInitialized) {
    void postNativeRenderEvent({ type: "resize", viewport });
  }
  void syncNativeFrame();
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
  nativeHoveredPointer.value = { x: pointer.x, y: pointer.y };
  const seq = ++nativeHitSeq;
  void controller.hitTest(pointer).then((hit) => {
    if (seq !== nativeHitSeq) return;
    nativeHoveredHit.value = hit
      ? {
        kind: hit.kind,
        item: hit.item,
        group: hit.group,
      }
      : null;
  });
}

function handlePointerLeave() {
  nativeHitSeq += 1;
  controller.setHover(null);
  nativeHoveredHit.value = null;
}

async function handleNativeClick(event: MouseEvent) {
  if (!nativeRenderVisible.value) return;
  const hit = await controller.hitTest(toLocalPointer(event));
  if (!hit) return;
  const entry = findEntryByNativeHit(hit);
  if (!entry) return;
  if (entry.kind === "item") {
    emit("itemClick", entry.item);
    return;
  }
  emit("groupClick", entry.group);
}

async function handleNativeContextMenu(event: MouseEvent) {
  if (!nativeRenderVisible.value) return;
  const hit = await controller.hitTest(toLocalPointer(event));
  if (!hit) return;
  const entry = findEntryByNativeHit(hit);
  if (!entry) return;
  event.preventDefault();
  if (entry.kind === "item") {
    emit("itemContextmenu", entry.item, event);
    return;
  }
  emit("groupContextmenu", entry.group, event);
}

async function syncNativeFrame() {
  const seq = ++nativeFrameSeq;
  const nowMs = performance.now();
  const frame = await controller.requestFrame(performance.now());
  if (seq !== nativeFrameSeq) return;
  nativeLayoutCommands.value = frame?.drawCommands ?? null;
  nativeLayoutCommandBuffer.value = frame?.drawCommandBuffer ?? null;
  nativeLayoutCommandStride.value = frame?.drawCommandStride ?? 0;
  nativeLayoutCommandCount.value = frame?.drawCommandCount ?? 0;
  if (nativeRenderInitialized && frame?.drawCommandBuffer && frame.drawCommandCount && frame.drawCommandStride) {
    void postNativeRenderEvent({
      type: "render",
      commandBuffer: frame.drawCommandBuffer.slice(0),
      commandStride: frame.drawCommandStride,
      commandCount: frame.drawCommandCount,
      spriteCommands: buildNativeSpriteCommands(frame.drawCommands ?? [], nowMs),
      nowMs: performance.now(),
    });
  }
}

function buildNativeSpriteCommands(
  commands: NativeSurfaceLayoutCommand[],
  nowMs: number,
): NativeRenderSpriteCommand[] {
  const result: NativeRenderSpriteCommand[] = [];
  for (let index = 0; index < commands.length; index += 1) {
    const command = commands[index];
    if (!command?.itemId) continue;
    const sprite = getGlobalBrowserAtlasSpriteDescriptorForItem(command.itemId, nowMs);
    if (!sprite) continue;
    result.push({
      textureKey: sprite.textureKey,
      sourceX: sprite.sourceX,
      sourceY: sprite.sourceY,
      sourceWidth: sprite.sourceWidth,
      sourceHeight: sprite.sourceHeight,
      destX: command.iconX,
      destY: command.iconY,
      destWidth: command.iconSize,
      destHeight: command.iconSize,
    });
  }
  return result;
}

async function syncNativeTextures() {
  if (!nativeRenderInitialized) return;
  const seq = ++nativeTextureSeq;
  const itemIds = Array.from(new Set(props.entries.map((entry) => getEntryItem(entry).itemId).filter(Boolean)));
  if (itemIds.length <= 0) return;
  await ensureGlobalBrowserAtlasIndex();
  if (seq !== nativeTextureSeq) return;
  const textures = getGlobalBrowserAtlasTextureDescriptorsForItems(itemIds);
  if (textures.length <= 0) return;
  void postNativeRenderEvent({
    type: "loadTextures",
    textures,
  });
}

onMounted(async () => {
  exposeNativeSurfaceMetricsForDebug();
  await controller.initialize({
    surfaceId: props.surfaceId,
    manifestUrl: props.manifestUrl ?? undefined,
    preferredRenderer: "compat-canvas",
    enableAnimations: props.enableAnimation,
    enableHistoryViewport: props.viewportRole === "history",
  });
  controller.setItemSize(props.itemSize);
  controller.setCompatEntries({ entries: props.entries, atlas: props.atlas ?? null });
  controller.setHistoryItems(props.historyItemIds);
  syncViewport();
  void syncNativeFrame();
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
  if (nativeRenderInitialized) {
    void postNativeRenderEvent({ type: "dispose" });
    nativeRenderInitialized = false;
    nativeRenderInitializing = false;
    nativeRenderVisible.value = false;
  }
  controller.destroy();
  emit("viewportResize", null);
});

watch(
  () => [props.entries, props.atlas] as const,
  () => {
    controller.setCompatEntries({ entries: props.entries, atlas: props.atlas ?? null });
    void syncNativeFrame();
    void syncNativeTextures();
  },
  { deep: false },
);

watch(
  () => props.itemSize,
  (size) => {
    controller.setItemSize(size);
    void syncNativeFrame();
  },
);

watch(
  () => props.enableAnimation,
  (enabled) => {
    void controller.initialize({
      surfaceId: props.surfaceId,
      manifestUrl: props.manifestUrl ?? undefined,
      preferredRenderer: "compat-canvas",
      enableAnimations: enabled,
      enableHistoryViewport: props.viewportRole === "history",
    });
  },
);

watch(itemIdsSignature, () => {
  controller.setHistoryItems(props.historyItemIds);
  void syncNativeFrame();
});
</script>

<template>
  <div
    ref="hostRef"
    class="native-browser-surface h-full w-full overflow-hidden"
    @mousemove="handlePointerMove"
    @mouseleave="handlePointerLeave"
    @click="handleNativeClick"
    @contextmenu="handleNativeContextMenu"
  >
    <canvas
      ref="nativeRenderCanvasRef"
      class="native-browser-surface__render"
      :class="{ 'native-browser-surface__render--visible': nativeRenderVisible }"
      aria-hidden="true"
    />
    <HomeCanvasGrid
      :entries="entries"
      :item-size="itemSize"
      :atlas="atlas"
      :enable-animation="enableAnimation"
      :prefer-atlas="preferAtlas"
      :native-layout-commands="nativeLayoutCommands"
      :native-layout-command-buffer="nativeLayoutCommandBuffer"
      :native-layout-command-stride="nativeLayoutCommandStride"
      :native-layout-command-count="nativeLayoutCommandCount"
      :suspend-rendering="nativeRenderVisible"
      :suspend-interactions="nativeRenderVisible"
      @item-click="emit('itemClick', $event)"
      @item-contextmenu="(item, event) => emit('itemContextmenu', item, event)"
      @group-click="emit('groupClick', $event)"
      @group-contextmenu="(group, event) => emit('groupContextmenu', group, event)"
    />
    <div
      v-if="nativeRenderVisible && nativeHoveredHit && nativeTooltipStyle"
      class="native-browser-surface__tooltip"
      :style="nativeTooltipStyle"
    >
      <div class="native-browser-surface__tooltip-title">{{ nativeTooltipTitle }}</div>
      <div class="native-browser-surface__tooltip-subtitle">{{ nativeTooltipSubtitle }}</div>
    </div>
  </div>
</template>

<style scoped>
.native-browser-surface {
  position: relative;
}

.native-browser-surface__render {
  position: absolute;
  inset: 0;
  z-index: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  pointer-events: none;
  image-rendering: pixelated;
  transition: opacity 120ms ease;
}

.native-browser-surface__render--visible {
  opacity: 1;
}

.native-browser-surface :deep(.home-canvas-grid) {
  position: relative;
  z-index: 1;
}

.native-browser-surface__tooltip {
  position: absolute;
  left: 0;
  top: 0;
  z-index: 12;
  max-width: 260px;
  border: 1px solid rgba(125, 211, 252, 0.28);
  border-radius: 10px;
  background: rgba(5, 9, 16, 0.94);
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.42), 0 0 20px rgba(34, 211, 238, 0.12);
  padding: 8px 10px;
  pointer-events: none;
  backdrop-filter: blur(10px);
}

.native-browser-surface__tooltip-title {
  color: rgba(248, 250, 252, 0.98);
  font-size: 13px;
  font-weight: 700;
  line-height: 1.35;
}

.native-browser-surface__tooltip-subtitle {
  margin-top: 4px;
  color: rgba(148, 163, 184, 0.92);
  font-size: 11px;
  line-height: 1.4;
}
</style>






