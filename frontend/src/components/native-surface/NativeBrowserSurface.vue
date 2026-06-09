<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { BrowserGridEntry, BrowserVariantGroup, Item } from "../../services/api";
import type { PageAtlasResult } from "../../services/pageAtlas";
import { createNativeSurfaceController } from "../../native-surface/NativeSurfaceController";
import type {
  NativeRendererBackendKind,
  NativeSurfaceId,
  NativeSurfacePointer,
  NativeSurfaceViewportRole,
} from "../../native-surface/contracts";
import type { NativeRuntimePackProfile } from "../../native-surface/runtimePackCache";
import { exposeNativeSurfaceMetricsForDebug } from "../../native-surface/NativeSurfaceMetrics";
import { postNativeRenderEvent } from "../../native-surface/NativeRenderWorkerClient";
import {
  getAllGlobalBrowserAtlasTextureDescriptors,
  getGlobalBrowserAtlasTextureDescriptorsForKeys,
} from "../../services/globalBrowserAtlas";

const props = withDefaults(defineProps<{
  surfaceId: NativeSurfaceId;
  viewportRole?: NativeSurfaceViewportRole;
  entries: BrowserGridEntry[];
  itemSize: number;
  page?: number;
  searchQuery?: string;
  modId?: string | null;
  expandedGroups?: string[];
  atlas?: PageAtlasResult | null;
  manifestUrl?: string | null;
  enableAnimation?: boolean;
  preferAtlas?: boolean;
  historyItemIds?: string[];
  selectedItemId?: string | null;
}>(), {
  viewportRole: "browser",
  page: 1,
  atlas: null,
  manifestUrl: null,
  expandedGroups: () => [],
  enableAnimation: true,
  preferAtlas: true,
  historyItemIds: () => [],
  selectedItemId: null,
});

const emit = defineEmits<{
  itemClick: [item: Item];
  itemContextmenu: [item: Item, event: MouseEvent];
  groupClick: [group: BrowserVariantGroup];
  groupContextmenu: [group: BrowserVariantGroup, event: MouseEvent];
  viewportResize: [element: HTMLElement | null];
}>();

function resolveRuntimePackProfile(): NativeRuntimePackProfile {
  return props.viewportRole === "history" ? "history-surface" : "browser-surface";
}

const hostRef = ref<HTMLElement | null>(null);
const nativeRenderCanvasRef = ref<HTMLCanvasElement | null>(null);
const controller = createNativeSurfaceController(props.surfaceId);
let resizeObserver: ResizeObserver | null = null;
let nativeVisibilityObserver: IntersectionObserver | null = null;
let nativeFrameSeq = 0;
let nativeTextureSeq = 0;
let nativeHitSeq = 0;
let nativeFrameScheduled = false;
let nativeAnimationTimer: number | null = null;
let nativeVisibilityHandler: (() => void) | null = null;
let nativeHitScheduled = false;
let nativePendingHitPointer: NativeSurfacePointer | null = null;
const nativeRenderVisible = ref(false);
const nativeHoveredHit = ref<{
  kind: BrowserGridEntry["kind"];
  item: Item;
  group?: BrowserVariantGroup;
  nativeTooltip?: {
    title: string;
    subtitle?: string;
    itemId?: string;
    publicItemId?: string | null;
    groupKey?: string;
    localizedName?: string | null;
    modId?: string | null;
    internalName?: string | null;
    groupLabel?: string | null;
    groupSize?: number | null;
  } | null;
} | null>(null);
const nativeHoveredPointer = ref({ x: 0, y: 0 });
let nativeRenderInitialized = false;
let nativeRenderInitializing = false;
let nativeTexturesReady = false;
let nativeFirstFrameReady = false;
let nativeSurfaceIntersecting = true;
let residentAtlasTextureSignature = "";
let activeResidentAtlasTextureSignature = "";
let activeResidentAtlasTextureLoadPromise: Promise<boolean> | null = null;
let residentAtlasBackgroundSignature = "";
let residentAtlasBackgroundUploadStarted = false;

const itemIdsSignature = computed(() => props.historyItemIds.join("|"));

function normalizeNativeRenderBackend(value: unknown): Exclude<NativeRendererBackendKind, "compat-canvas"> {
  const normalized = `${value ?? ""}`.trim().toLowerCase();
  if (normalized === "webgpu" || normalized === "auto") return normalized;
  if (normalized === "webgl2") return "webgl2";
  return "auto";
}

function updateNativeRenderVisibility() {
  // Keep the last committed GPU frame visible while the next atlas batch is
  // streaming. Hiding the canvas during rapid page changes reintroduces the
  // old "blank while textures load" feeling; the renderer already drops stale
  // frame tokens, so the correct native-runtime behavior is: show the loading
  // status only before the first frame, then atomically swap to newer frames
  // once their resident atlas textures are ready.
  nativeRenderVisible.value = nativeRenderInitialized && nativeFirstFrameReady;
}

function resetNativeRenderReadiness() {
  nativeTexturesReady = false;
  nativeFirstFrameReady = false;
  nativeRenderVisible.value = false;
}

function isDocumentVisible(): boolean {
  return typeof document === "undefined" || document.visibilityState !== "hidden";
}

function isNativeSurfaceRenderable(): boolean {
  return isDocumentVisible() && nativeSurfaceIntersecting;
}

function clearNativeAnimationTimer() {
  if (nativeAnimationTimer === null) return;
  window.clearTimeout(nativeAnimationTimer);
  nativeAnimationTimer = null;
}

function scheduleNextAnimatedNativeFrame(delayMs: number | null | undefined) {
  clearNativeAnimationTimer();
  if (!props.enableAnimation || !nativeRenderVisible.value || !nativeRenderInitialized || !isNativeSurfaceRenderable()) return;
  const normalizedDelay = Math.max(16, Math.min(250, Math.floor(Number(delayMs) || 50)));
  nativeAnimationTimer = window.setTimeout(() => {
    nativeAnimationTimer = null;
    requestNativeFrame();
  }, normalizedDelay);
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
  if (hit.nativeTooltip?.title) return hit.nativeTooltip.title;
  if (hit.kind === "item") {
    const baseName = hit.item.localizedName || hit.item.internalName || hit.item.itemId;
    if (hit.item.browserGroupKey && Number(hit.item.browserGroupSize ?? 1) > 1) {
      return `${baseName} 路 variant`;
    }
    return baseName;
  }
  return hit.group?.label || hit.group?.key || hit.item.localizedName || hit.item.itemId;
});

const nativeTooltipSubtitle = computed(() => {
  const hit = nativeHoveredHit.value;
  if (!hit) return "";
  if (hit.nativeTooltip) {
    const groupSize = Number(hit.nativeTooltip.groupSize ?? hit.item.browserGroupSize ?? 1);
    if (hit.kind !== "item") {
      return `${groupSize || hit.group?.size || 0} grouped variants 路 Click to expand`;
    }
    if (hit.nativeTooltip.groupKey && groupSize > 1) {
      return `Variant in ${groupSize} item semantic group 路 Left click: recipes 路 Right click: uses`;
    }
    return hit.nativeTooltip.modId
      ? `${hit.nativeTooltip.modId} 路 Left click: recipes 路 Right click: uses`
      : "Left click: recipes 路 Right click: uses";
  }
  if (hit.kind === "item") {
    if (hit.item.browserGroupKey && Number(hit.item.browserGroupSize ?? 1) > 1) {
      return `Variant in ${hit.item.browserGroupSize} item semantic group 路 Left click: recipes 路 Right click: uses`;
    }
    return hit.item.modId ? `${hit.item.modId} 路 Left click: recipes 路 Right click: uses` : "Left click: recipes 路 Right click: uses";
  }
  return hit.group ? `${hit.group.size} grouped variants 路 Click to expand` : "Grouped variants";
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
  resetNativeRenderReadiness();
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
    updateNativeRenderVisibility();
    if (nativeRenderInitialized) {
      requestNativeFrame();
    }
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
    void initializeNativeRenderWorker(nextWidth, nextHeight);
  } else if (nativeRenderInitialized) {
    void postNativeRenderEvent({ type: "resize", viewport });
  }
  requestNativeFrame();
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

function scheduleNativeHitTest(pointer: NativeSurfacePointer) {
  nativePendingHitPointer = pointer;
  nativeHitSeq += 1;
  if (nativeHitScheduled) return;
  nativeHitScheduled = true;
  const run = () => {
    nativeHitScheduled = false;
    const latestPointer = nativePendingHitPointer;
    nativePendingHitPointer = null;
    if (!latestPointer) return;
    const requestSeq = nativeHitSeq;
    void controller.hitTest(latestPointer).then((hit) => {
      if (requestSeq !== nativeHitSeq) return;
      nativeHoveredHit.value = hit
        ? {
          kind: hit.kind,
          item: hit.item,
          group: hit.group,
          nativeTooltip: hit.nativeTooltip ?? null,
        }
        : null;
    });
  };
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(run);
  } else {
    setTimeout(run, 0);
  }
}

function handlePointerMove(event: MouseEvent) {
  const pointer = toLocalPointer(event);
  controller.setHover(pointer);
  nativeHoveredPointer.value = { x: pointer.x, y: pointer.y };
  scheduleNativeHitTest(pointer);
}

function handlePointerLeave() {
  nativeHitSeq += 1;
  nativePendingHitPointer = null;
  controller.setHover(null);
  nativeHoveredHit.value = null;
}

async function handleNativeClick(event: MouseEvent) {
  if (!nativeRenderVisible.value) return;
  const hit = await controller.hitTest(toLocalPointer(event));
  if (!hit) return;
  const entry = findEntryByNativeHit(hit);
  if (!entry) {
    if (hit.kind === "item") emit("itemClick", hit.item);
    return;
  }
  if (entry.kind === "item") {
    emit("itemClick", hit.item);
    return;
  }
  emit("groupClick", entry.group);
}

async function handleNativeContextMenu(event: MouseEvent) {
  if (!nativeRenderVisible.value) return;
  const hit = await controller.hitTest(toLocalPointer(event));
  if (!hit) return;
  const entry = findEntryByNativeHit(hit);
  event.preventDefault();
  if (!entry) {
    if (hit.kind === "item") emit("itemContextmenu", hit.item, event);
    return;
  }
  if (entry.kind === "item") {
    emit("itemContextmenu", hit.item, event);
    return;
  }
  emit("groupContextmenu", entry.group, event);
}

async function syncNativeFrame() {
  nativeFrameScheduled = false;
  const seq = ++nativeFrameSeq;
  const nowMs = performance.now();
  const frame = await controller.requestFrame(nowMs);
  if (seq !== nativeFrameSeq) return;
  if (nativeRenderInitialized && frame?.drawCommandBuffer && frame.drawCommandCount && frame.drawCommandStride) {
    await syncNativeTexturesForFrame(frame.spriteCommands ?? []);
    if (seq !== nativeFrameSeq) return;
    const response = await postNativeRenderEvent({
      type: "render",
      frameToken: seq,
      commandBuffer: frame.drawCommandBuffer.slice(0),
      commandStride: frame.drawCommandStride,
      commandCount: frame.drawCommandCount,
      spriteCommands: frame.spriteCommands ?? [],
      nowMs,
    });
    if (seq !== nativeFrameSeq) return;
    nativeFirstFrameReady = response?.type === "frame";
    updateNativeRenderVisibility();
    if (nativeFirstFrameReady) {
      queueResidentAtlasBackgroundUpload();
    }
    if (frame.hasAnimatedSprites) {
      scheduleNextAnimatedNativeFrame(frame.nextFrameDelayMs);
    } else {
      clearNativeAnimationTimer();
    }
  }
}

function requestNativeFrame() {
  clearNativeAnimationTimer();
  if (nativeFrameScheduled) return;
  nativeFrameScheduled = true;
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(() => {
      void syncNativeFrame();
    });
    return;
  }
  window.setTimeout(() => {
    void syncNativeFrame();
  }, 0);
}

function buildTextureSignature(textures: Array<{ key: string; url: string }>): string {
  return textures.map((texture) => `${texture.key}:${texture.url}`).join("|");
}

function queueResidentAtlasBackgroundUpload(): void {
  if (residentAtlasBackgroundUploadStarted || !nativeRenderInitialized) return;
  residentAtlasBackgroundUploadStarted = true;
  window.setTimeout(() => {
    void (async () => {
      const textures = await getAllGlobalBrowserAtlasTextureDescriptors();
      if (!nativeRenderInitialized || textures.length <= 0) return;
      const signature = buildTextureSignature(textures);
      if (signature === residentAtlasBackgroundSignature) return;
      residentAtlasBackgroundSignature = signature;
      await postNativeRenderEvent({
        type: "loadTextures",
        textures,
      });
    })().finally(() => {
      residentAtlasBackgroundUploadStarted = false;
    });
  }, 0);
}

async function syncNativeTexturesForFrame(spriteCommands: Array<{ textureKey?: string | null }>): Promise<void> {
  if (!nativeRenderInitialized) return;
  const seq = ++nativeTextureSeq;
  const textureKeys = Array.from(new Set(spriteCommands.map((command) => command.textureKey ?? "").filter(Boolean)));
  let textures = getGlobalBrowserAtlasTextureDescriptorsForKeys(textureKeys);
  if (textures.length <= 0 && spriteCommands.length > 0) {
    // This should be rare: sprite commands already carry atlas-file keys. If a
    // malformed key slips through, use the resident index as a corrective path
    // instead of showing a permanently blank native page.
    const allTextures = await getAllGlobalBrowserAtlasTextureDescriptors();
    const wanted = new Set(textureKeys);
    textures = allTextures.filter((texture) => wanted.has(texture.key));
  }
  if (seq !== nativeTextureSeq) return;
  if (textures.length <= 0 && spriteCommands.length <= 0) {
    nativeTexturesReady = true;
    updateNativeRenderVisibility();
    return;
  }
  if (textures.length <= 0) {
    nativeTexturesReady = false;
    updateNativeRenderVisibility();
    return;
  }
  const signature = buildTextureSignature(textures);
  if (signature === residentAtlasTextureSignature) {
    nativeTexturesReady = true;
    updateNativeRenderVisibility();
    return;
  }
  nativeTexturesReady = false;
  updateNativeRenderVisibility();
  const previousTextureSignature = activeResidentAtlasTextureSignature;
  activeResidentAtlasTextureSignature = signature;
  if (!activeResidentAtlasTextureLoadPromise || signature !== previousTextureSignature) {
    activeResidentAtlasTextureLoadPromise = postNativeRenderEvent({
      type: "loadTextures",
      textures,
    }).then((response) => response?.type === "textureLoaded" && response.loaded > 0);
  }
  const loaded = await activeResidentAtlasTextureLoadPromise;
  if (seq !== nativeTextureSeq && activeResidentAtlasTextureSignature !== signature) return;
  residentAtlasTextureSignature = signature;
  if (activeResidentAtlasTextureSignature === signature) {
    activeResidentAtlasTextureLoadPromise = null;
  }
  nativeTexturesReady = loaded;
  updateNativeRenderVisibility();
}

onMounted(async () => {
  exposeNativeSurfaceMetricsForDebug();
  await controller.initialize({
    surfaceId: props.surfaceId,
    manifestUrl: props.manifestUrl ?? undefined,
    runtimePackProfile: resolveRuntimePackProfile(),
    preferredRenderer: "compat-canvas",
    enableAnimations: props.enableAnimation,
    enableHistoryViewport: props.viewportRole === "history",
  });
  controller.setItemSize(props.itemSize);
  controller.setPage(props.page);
  controller.setSearch(props.searchQuery ?? "");
  controller.setModFilter(props.modId === "all" ? null : props.modId ?? null);
  controller.setExpandedGroups(props.expandedGroups);
  controller.setSelectedItemId(props.selectedItemId);
  controller.setCompatEntries({ entries: props.entries, atlas: props.atlas ?? null });
  controller.setHistoryItems(props.historyItemIds);
  syncViewport();
  requestNativeFrame();
  emitViewportResize();
  resizeObserver = new ResizeObserver((entries) => {
    const rect = entries[0]?.contentRect;
    syncViewport(rect?.width, rect?.height);
    emitViewportResize();
  });
  if (hostRef.value) {
    resizeObserver.observe(hostRef.value);
    if (typeof IntersectionObserver !== "undefined") {
      nativeVisibilityObserver = new IntersectionObserver((entries) => {
        nativeSurfaceIntersecting = entries.some((entry) => entry.isIntersecting);
        if (nativeSurfaceIntersecting) {
          requestNativeFrame();
        } else {
          clearNativeAnimationTimer();
        }
      });
      nativeVisibilityObserver.observe(hostRef.value);
    }
  }
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
  nativeVisibilityObserver?.disconnect();
  nativeVisibilityObserver = null;
  clearNativeAnimationTimer();
  if (nativeVisibilityHandler && typeof document !== "undefined") {
    document.removeEventListener("visibilitychange", nativeVisibilityHandler);
    nativeVisibilityHandler = null;
  }
  if (nativeRenderInitialized) {
    void postNativeRenderEvent({ type: "dispose" });
    nativeRenderInitialized = false;
    nativeRenderInitializing = false;
    resetNativeRenderReadiness();
  }
  controller.destroy();
  emit("viewportResize", null);
});

watch(
  () => [props.entries, props.atlas] as const,
  () => {
    controller.setCompatEntries({ entries: props.entries, atlas: props.atlas ?? null });
    requestNativeFrame();
  },
  { deep: false },
);

watch(
  () => props.page,
  (page) => {
    controller.setPage(page);
    requestNativeFrame();
  },
);

watch(
  () => props.searchQuery,
  (query) => {
    controller.setSearch(query ?? "");
    controller.setPage(1);
    requestNativeFrame();
  },
);

watch(
  () => props.modId,
  (modId) => {
    controller.setModFilter(modId === "all" ? null : modId ?? null);
    controller.setPage(props.page);
    requestNativeFrame();
  },
);

watch(
  () => props.expandedGroups.join("|"),
  () => {
    controller.setExpandedGroups(props.expandedGroups);
    controller.setPage(props.page);
    requestNativeFrame();
  },
);

watch(
  () => props.itemSize,
  (size) => {
    controller.setItemSize(size);
    requestNativeFrame();
  },
);

watch(
  () => props.selectedItemId,
  (itemId) => {
    controller.setSelectedItemId(itemId ?? null);
    requestNativeFrame();
  },
);

watch(
  () => props.enableAnimation,
  (enabled) => {
    void controller.initialize({
      surfaceId: props.surfaceId,
      manifestUrl: props.manifestUrl ?? undefined,
      runtimePackProfile: resolveRuntimePackProfile(),
      preferredRenderer: "compat-canvas",
      enableAnimations: enabled,
      enableHistoryViewport: props.viewportRole === "history",
    });
  },
);

watch(itemIdsSignature, () => {
  controller.setHistoryItems(props.historyItemIds);
  requestNativeFrame();
});

if (typeof document !== "undefined") {
  nativeVisibilityHandler = () => {
    if (isNativeSurfaceRenderable()) {
      requestNativeFrame();
    } else {
      clearNativeAnimationTimer();
    }
  };
  document.addEventListener("visibilitychange", nativeVisibilityHandler);
}
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
    <div
      v-if="!nativeRenderVisible"
      class="native-browser-surface__status"
      aria-live="polite"
    >
      <div class="native-browser-surface__status-orb" />
      <div class="native-browser-surface__status-text">
        <span>Native GPU runtime is preparing the resident atlas</span>
        <small>Browser grid DOM fallback is retired on this path.</small>
      </div>
    </div>
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

.native-browser-surface__status {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  border: 1px solid rgba(125, 211, 252, 0.12);
  border-radius: 12px;
  background:
    radial-gradient(circle at 50% 42%, rgba(34, 211, 238, 0.10), transparent 34%),
    linear-gradient(135deg, rgba(5, 10, 18, 0.74), rgba(10, 18, 30, 0.86));
  color: rgba(226, 232, 240, 0.86);
  pointer-events: none;
}

.native-browser-surface__status-orb {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: rgba(34, 211, 238, 0.92);
  box-shadow: 0 0 18px rgba(34, 211, 238, 0.52), 0 0 42px rgba(129, 140, 248, 0.22);
}

.native-browser-surface__status-text {
  display: grid;
  gap: 2px;
  font-size: 12px;
  letter-spacing: 0.01em;
}

.native-browser-surface__status-text small {
  color: rgba(148, 163, 184, 0.82);
  font-size: 10px;
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






