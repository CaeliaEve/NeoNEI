<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { BrowserVariantGroup, Item } from "../../services/api";
import { createNativeSurfaceController } from "../../native-surface/NativeSurfaceController";
import type {
  NativeRendererBackendKind,
  NativeSurfaceEntryKind,
  NativeSurfaceId,
  NativeSurfaceFrameProjectionMetrics,
  NativeSurfacePointer,
  NativeSurfaceViewportRole,
} from "../../native-surface/contracts";
import type { NativeRuntimePackProfile } from "../../native-surface/NativeRuntimeProfilePolicy";
import {
  exposeNativeSurfaceMetricsForDebug,
  recordNativeSurfaceFault,
} from "../../native-surface/NativeSurfaceMetricsRegistry";
import type { NativeSurfaceFaultDomain } from "../../native-surface/NativeSurfaceFaultControlPlane";
import { createNativeRenderWorkerClient } from "../../native-surface/NativeRenderWorkerClient";
import { createNativeRenderPipelineClient } from "../../native-surface/NativeRenderPipelineClient";
import { requireNativeFrameTextureDescriptors } from "../../native-surface/NativeFrameTextureResolution";
import { getItemImageUrlFromEntity } from "../../services/api/images";
import CatalogIcon from '../CatalogIcon.vue';
import ResidentIcon from '../ResidentIcon.vue';
import { residentCatalog } from '../../browser/resident';
import { useFavorites } from '../../browser/favorites';
import { usePreferences } from '../../state/preferences';
import {scheduleRecipeWarm,cancelRecipeWarm,prioritizeRecipe} from '../../browser/recipe-warm';
import {
  getAllGlobalBrowserAtlasTextureDescriptors,
  getGlobalBrowserAtlasTextureDescriptorsForKeys,
} from "../../services/globalBrowserAtlas";

const props = withDefaults(defineProps<{
  catalog?: boolean;
  surfaceId: NativeSurfaceId;
  viewportRole?: NativeSurfaceViewportRole;
  itemSize: number;
  page?: number;
  searchQuery?: string;
  modId?: string | null;
  expandedGroups?: string[];
  manifestUrl?: string | null;
  enableAnimation?: boolean;
  historyItemIds?: string[];
  selectedItemId?: string | null;
  fallbackItems?: Item[];
}>(), {
  viewportRole: "browser",
  page: 1,
  manifestUrl: null,
  expandedGroups: () => [],
  enableAnimation: true,
  historyItemIds: () => [],
  selectedItemId: null,
});

const emit = defineEmits<{
  itemClick: [item: Item];
  itemContextmenu: [item: Item, event: MouseEvent];
  groupClick: [group: BrowserVariantGroup];
  groupContextmenu: [group: BrowserVariantGroup, event: MouseEvent];
  viewportResize: [element: HTMLElement | null];
  runtimeProjectionUpdate: [metrics: NativeSurfaceFrameProjectionMetrics];
}>();

const { ids: favoriteIds, toggle: toggleFavorite } = useFavorites(residentCatalog);
const {preferences}=usePreferences();

function handleFallbackClick(item: Item, event: MouseEvent): void {
  if (props.catalog && event.altKey) {
    cancelRecipeWarm();
    toggleFavorite(item);
    return;
  }
  if (props.catalog) prioritizeRecipe(item.itemId, 'recipes');
  emit('itemClick', item);
}

function resolveRuntimePackProfile(): NativeRuntimePackProfile {
  return props.viewportRole === "history" ? "history-surface" : "browser-surface";
}

const hostRef = ref<HTMLElement | null>(null);
const nativeRenderCanvasRef = ref<HTMLCanvasElement | null>(null);
const controller = createNativeSurfaceController(props.surfaceId);
const nativeRenderWorker = createNativeRenderWorkerClient(props.surfaceId);
const nativeRenderPipeline = createNativeRenderPipelineClient(props.surfaceId, nativeRenderWorker);
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
  kind: NativeSurfaceEntryKind;
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
const nativeSurfaceFaultMessage = ref("");
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
let nativeRenderFaulted = false;
let nativeSurfaceEngineFaulted = false;

const itemIdsSignature = computed(() => props.historyItemIds.join("|"));

function normalizeNativeRenderBackend(value: unknown): NativeRendererBackendKind {
  const normalized = `${value ?? ""}`.trim().toLowerCase();
  if (normalized === "webgpu" || normalized === "auto") return normalized;
  if (normalized === "webgl2") return "webgl2";
  return "webgl2";
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

function normalizeNativeSurfaceFaultMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  const message = `${error ?? ""}`.trim();
  return message || "unknown native surface fault";
}

function reportNativeRenderFailure(
  phase: string,
  error: unknown,
  domain: NativeSurfaceFaultDomain = "render",
): void {
  nativeRenderFaulted = true;
  nativeRenderInitialized = false;
  nativeRenderInitializing = false;
  activeResidentAtlasTextureLoadPromise = null;
  activeResidentAtlasTextureSignature = "";
  nativeSurfaceFaultMessage.value = `${domain}:${phase}: ${normalizeNativeSurfaceFaultMessage(error)}`;
  recordNativeSurfaceFault(props.surfaceId, { domain, phase, error });
  clearNativeAnimationTimer();
  resetNativeRenderReadiness();
  void nativeRenderPipeline.disconnect()
    .catch(() => undefined)
    .finally(() => nativeRenderWorker.reset());
  if (typeof console !== "undefined") {
    console.error(`[NeoNEI native render] ${phase} failed`, error);
  }
}

function reportNativeSurfaceEngineFailure(phase: string, error: unknown): void {
  nativeSurfaceEngineFaulted = true;
  nativeHitSeq += 1;
  nativePendingHitPointer = null;
  nativeHoveredHit.value = null;
  reportNativeRenderFailure(phase, error, "engine");
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

function resolveNativeRenderBackend(): NativeRendererBackendKind {
  const envBackend = normalizeNativeRenderBackend(import.meta.env.VITE_NATIVE_RENDER_BACKEND);
  if (envBackend === "webgpu") return "webgpu";
  if (typeof window === "undefined") return envBackend;
  try {
    const explicitBackend = normalizeNativeRenderBackend(window.localStorage.getItem("neonei:native-render-backend"));
    if (explicitBackend === "webgpu") {
      // Retire stale browser-side WebGPU overrides from earlier experiments.
      // The current validated native path is WASM + WebGL2 resident atlas; WebGPU
      // remains available only through the build-time env gate until it passes the
      // same pixel gates. Keeping the old localStorage value can make real Chrome
      // show black pages while headless WebGL2 stays healthy.
      window.localStorage.removeItem("neonei:native-render-backend");
      return envBackend;
    }
    return explicitBackend;
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

function emitViewportResize() {
  emit("viewportResize", hostRef.value);
}

async function initializeNativeRenderWorker(width: number, height: number) {
  const canvas = nativeRenderCanvasRef.value;
  if (
    nativeRenderInitialized
    || nativeRenderInitializing
    || nativeRenderFaulted
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
    const response = await nativeRenderWorker.post({
      type: "initialize",
      canvas: offscreen,
      renderer: resolveNativeRenderBackend(),
    });
    if (response.type === "ready") {
      await nativeRenderPipeline.connect();
      nativeRenderInitialized = true;
    }
    updateNativeRenderVisibility();
    if (nativeRenderInitialized) {
      requestNativeFrame();
    }
  } catch (error) {
    reportNativeRenderFailure("initialize", error);
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
  if (nativeSurfaceEngineFaulted) return;
  controller.setViewport(viewport);
  if (!nativeRenderInitialized) {
    void initializeNativeRenderWorker(nextWidth, nextHeight);
  } else if (nativeRenderInitialized && !nativeRenderFaulted) {
    void nativeRenderWorker.post({ type: "resize", viewport }).catch((error) => {
      reportNativeRenderFailure("resize", error);
    });
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
  if (nativeSurfaceEngineFaulted) return;
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
    void controller.hitTest(latestPointer)
      .then((hit) => {
        if (requestSeq !== nativeHitSeq) return;
        nativeHoveredHit.value = hit
          ? {
            kind: hit.kind,
            item: hit.item,
            group: hit.group,
            nativeTooltip: hit.nativeTooltip ?? null,
          }
          : null;
      })
      .catch((error) => {
        if (requestSeq !== nativeHitSeq) return;
        reportNativeSurfaceEngineFailure("hitTest", error);
      });
  };
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(run);
  } else {
    setTimeout(run, 0);
  }
}

function handlePointerMove(event: MouseEvent) {
  if (props.catalog) return;
  if (nativeSurfaceEngineFaulted) return;
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
  if (props.catalog) return;
  if (!nativeRenderVisible.value || nativeSurfaceEngineFaulted) return;
  try {
    const hit = await controller.hitTest(toLocalPointer(event));
    if (!hit) return;
    if (hit.kind === "item") {
      emit("itemClick", hit.item);
      return;
    }
    if (hit.group) emit("groupClick", hit.group);
  } catch (error) {
    reportNativeSurfaceEngineFailure("clickHitTest", error);
  }
}

async function handleNativeContextMenu(event: MouseEvent) {
  if (props.catalog) return;
  if (!nativeRenderVisible.value || nativeSurfaceEngineFaulted) return;
  try {
    const hit = await controller.hitTest(toLocalPointer(event));
    if (!hit) return;
    event.preventDefault();
    if (hit.kind === "item") {
      emit("itemContextmenu", hit.item, event);
      return;
    }
    if (hit.group) emit("groupContextmenu", hit.group, event);
  } catch (error) {
    reportNativeSurfaceEngineFailure("contextMenuHitTest", error);
  }
}

async function syncNativeFrame() {
  nativeFrameScheduled = false;
  if (nativeSurfaceEngineFaulted) return;
  const seq = ++nativeFrameSeq;
  const nowMs = performance.now();
  let frame: Awaited<ReturnType<typeof controller.requestFrame>>;
  try {
    frame = await controller.requestFrame(nowMs);
  } catch (error) {
    reportNativeSurfaceEngineFailure("requestFrame", error);
    return;
  }
  if (seq !== nativeFrameSeq) return;
  if (
    props.viewportRole === "browser"
    && frame?.runtimeProjection
    && frame.runtimeProjection.runtimeReady
    && frame.runtimeProjection.source === "runtime-browser-pack"
    && frame.runtimeProjection.pageSize > 0
  ) {
    emit("runtimeProjectionUpdate", frame.runtimeProjection);
  }
  if (nativeRenderInitialized && !nativeRenderFaulted && frame) {
    try {
      const texturesChanged = await syncNativeTexturesForFrame(
        frame.missingTextureKeys ?? [],
      );
      if (seq !== nativeFrameSeq) return;
      if (texturesChanged) {
        requestNativeFrame();
        return;
      }
      if (!frame.rendered) return;
      nativeFirstFrameReady = true;
      updateNativeRenderVisibility();
      if (nativeFirstFrameReady) {
        queueResidentAtlasBackgroundUpload();
      }
      if (frame.hasAnimatedSprites) {
        scheduleNextAnimatedNativeFrame(frame.nextFrameDelayMs);
      } else {
        clearNativeAnimationTimer();
      }
    } catch (error) {
      reportNativeRenderFailure("frame", error);
    }
  }
}

function requestNativeFrame() {
  if (props.catalog) return;
  clearNativeAnimationTimer();
  if (!nativeRenderInitialized || nativeRenderFaulted || nativeSurfaceEngineFaulted || nativeFrameScheduled) return;
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
  if (residentAtlasBackgroundUploadStarted || !nativeRenderInitialized || nativeRenderFaulted) return;
  residentAtlasBackgroundUploadStarted = true;
  window.setTimeout(() => {
    void (async () => {
      const textures = await getAllGlobalBrowserAtlasTextureDescriptors();
      if (!nativeRenderInitialized || textures.length <= 0) return;
      const signature = buildTextureSignature(textures);
      if (signature === residentAtlasBackgroundSignature) return;
      residentAtlasBackgroundSignature = signature;
      await nativeRenderWorker.post({
        type: "loadTextures",
        textures,
      });
    })()
      .catch((error) => {
        reportNativeRenderFailure("backgroundTextureUpload", error);
      })
      .finally(() => {
        residentAtlasBackgroundUploadStarted = false;
      });
  }, 0);
}

async function syncNativeTexturesForFrame(
  missingTextureKeys: string[] = [],
): Promise<boolean> {
  if (!nativeRenderInitialized || nativeRenderFaulted) return false;
  const seq = ++nativeTextureSeq;
  const textureKeys = Array.from(new Set(missingTextureKeys.filter(Boolean)));
  const textures = requireNativeFrameTextureDescriptors(
    textureKeys,
    getGlobalBrowserAtlasTextureDescriptorsForKeys(textureKeys),
  );
  if (seq !== nativeTextureSeq) return false;
  if (textureKeys.length <= 0) {
    nativeTexturesReady = true;
    updateNativeRenderVisibility();
    return false;
  }
  const signature = buildTextureSignature(textures);
  nativeTexturesReady = false;
  updateNativeRenderVisibility();
  const previousTextureSignature = activeResidentAtlasTextureSignature;
  activeResidentAtlasTextureSignature = signature;
  if (!activeResidentAtlasTextureLoadPromise || signature !== previousTextureSignature) {
    activeResidentAtlasTextureLoadPromise = nativeRenderWorker.post({
      type: "loadTextures",
      textures,
    })
      .then((response) => response.type === "textureLoaded" && response.loaded > 0)
      .catch((error) => {
        if (activeResidentAtlasTextureSignature === signature) {
          activeResidentAtlasTextureLoadPromise = null;
          activeResidentAtlasTextureSignature = "";
        }
        throw error;
      });
  }
  const loaded = await activeResidentAtlasTextureLoadPromise;
  if (seq !== nativeTextureSeq && activeResidentAtlasTextureSignature !== signature) return false;
  residentAtlasTextureSignature = signature;
  if (activeResidentAtlasTextureSignature === signature) {
    activeResidentAtlasTextureLoadPromise = null;
  }
  nativeTexturesReady = loaded;
  updateNativeRenderVisibility();
  return loaded;
}

onMounted(async () => {
  if (props.catalog) {
    emitViewportResize();
    resizeObserver = new ResizeObserver(() => emitViewportResize());
    if (hostRef.value) resizeObserver.observe(hostRef.value);
    return;
  }
  exposeNativeSurfaceMetricsForDebug();
  try {
    await controller.initialize({
      surfaceId: props.surfaceId,
      manifestUrl: props.manifestUrl ?? undefined,
      runtimePackProfile: resolveRuntimePackProfile(),
      preferredRenderer: "webgl2",
      enableAnimations: props.enableAnimation,
      enableHistoryViewport: props.viewportRole === "history",
    });
    controller.setItemSize(props.itemSize);
    controller.setPage(props.page);
    controller.setSearch(props.searchQuery ?? "");
    controller.setModFilter(props.modId === "all" ? null : props.modId ?? null);
    controller.setExpandedGroups(props.expandedGroups);
    controller.setSelectedItemId(props.selectedItemId);
    controller.setHistoryItems(props.historyItemIds);
    syncViewport();
    requestNativeFrame();
  } catch (error) {
    reportNativeSurfaceEngineFailure("initialize", error);
  }
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
  cancelRecipeWarm();
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
    nativeRenderInitialized = false;
    nativeRenderInitializing = false;
    resetNativeRenderReadiness();
    void nativeRenderPipeline.disconnect()
      .then(() => nativeRenderWorker.post({ type: "dispose" }))
      .catch((error) => {
        reportNativeRenderFailure("dispose", error);
      })
      .finally(() => nativeRenderWorker.destroy());
  } else {
    nativeRenderWorker.destroy();
  }
  controller.destroy();
  emit("viewportResize", null);
});

watch(
  () => props.page,
  (page) => {
    if (nativeSurfaceEngineFaulted) return;
    controller.setPage(page);
    requestNativeFrame();
  },
);

watch(
  () => props.searchQuery,
  (query) => {
    if (nativeSurfaceEngineFaulted) return;
    controller.setSearch(query ?? "");
    controller.setPage(1);
    requestNativeFrame();
  },
);

watch(
  () => props.modId,
  (modId) => {
    if (nativeSurfaceEngineFaulted) return;
    controller.setModFilter(modId === "all" ? null : modId ?? null);
    controller.setPage(props.page);
    requestNativeFrame();
  },
);

watch(
  () => props.expandedGroups.join("|"),
  () => {
    if (nativeSurfaceEngineFaulted) return;
    controller.setExpandedGroups(props.expandedGroups);
    controller.setPage(props.page);
    requestNativeFrame();
  },
);

watch(
  () => props.itemSize,
  (size) => {
    if (nativeSurfaceEngineFaulted) return;
    controller.setItemSize(size);
    requestNativeFrame();
  },
);

watch(
  () => props.selectedItemId,
  (itemId) => {
    if (nativeSurfaceEngineFaulted) return;
    controller.setSelectedItemId(itemId ?? null);
    requestNativeFrame();
  },
);

watch(
  () => props.enableAnimation,
  (enabled) => {
    if (props.catalog) return;
    if (nativeSurfaceEngineFaulted) return;
    void controller.initialize({
      surfaceId: props.surfaceId,
      manifestUrl: props.manifestUrl ?? undefined,
      runtimePackProfile: resolveRuntimePackProfile(),
      preferredRenderer: "webgl2",
      enableAnimations: enabled,
      enableHistoryViewport: props.viewportRole === "history",
    }).catch((error) => {
      reportNativeSurfaceEngineFailure("animationInitialize", error);
    });
  },
);

watch(itemIdsSignature, () => {
  cancelRecipeWarm();
  if (nativeSurfaceEngineFaulted) return;
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
      v-if="!nativeRenderVisible && (props.fallbackItems?.length ?? 0) > 0"
      class="native-browser-surface__fallback"
      :class="{ 'native-browser-surface__catalog-grid': catalog }"
      :style="{ '--browser-item-size': itemSize + 'px' }"
      role="list"
    >
      <div
        v-for="item in props.fallbackItems"
        :key="item.itemId"
        class="native-browser-surface__cell"
        role="listitem"
      >
      <button
        type="button"
        class="native-browser-surface__fallback-item"
        :class="{ 'native-browser-surface__fallback-item--selected': item.itemId === props.selectedItemId }"
        :title="item.localizedName"
        :aria-label="item.localizedName"
        @mouseenter="catalog && scheduleRecipeWarm(item.itemId)"
        @mouseleave="cancelRecipeWarm()"
        @focus="catalog && scheduleRecipeWarm(item.itemId)"
        @blur="cancelRecipeWarm()"
        @click.stop="handleFallbackClick(item, $event)"
        @contextmenu.prevent.stop="catalog && prioritizeRecipe(item.itemId, 'uses'); emit('itemContextmenu', item, $event)"
      >
        <ResidentIcon v-if="catalog && typeof item.residentSprite === 'number' && item.residentSprite >= 0" :id="item.itemId" :sprite="item.residentSprite" :size="Math.max(1, Math.floor(itemSize * 0.9))" :label="item.localizedName" :animate="enableAnimation && preferences.animate" />
        <CatalogIcon v-else-if="catalog" :id="item.itemId" :size="Math.max(1, Math.floor(itemSize * 0.9))" :label="item.localizedName" :animate="enableAnimation && preferences.animate" />
        <img v-else :src="getItemImageUrlFromEntity(item)" :alt="item.localizedName" loading="lazy" decoding="async" />
        <span v-if="!catalog">{{ item.localizedName }}</span>
      </button>
      <button
        v-if="catalog && residentCatalog"
        type="button"
        class="native-browser-surface__favorite"
        :class="{ 'native-browser-surface__favorite--saved': favoriteIds.has(item.itemId) }"
        :aria-label="`${favoriteIds.has(item.itemId) ? '取消收藏' : '收藏'} ${item.localizedName}`"
        :aria-pressed="favoriteIds.has(item.itemId)"
        :title="`${favoriteIds.has(item.itemId) ? '取消收藏' : '收藏'}（Alt + 单击物品）`"
        @mouseenter="cancelRecipeWarm()"
        @focus="cancelRecipeWarm()"
        @click.stop="toggleFavorite(item)"
        @contextmenu.prevent.stop
      >{{ favoriteIds.has(item.itemId) ? '★' : '☆' }}</button>
      </div>
    </div>
    <div
      v-else-if="!nativeRenderVisible && !catalog"
      class="native-browser-surface__status"
      aria-live="polite"
    >
      <div class="native-browser-surface__status-orb" />
      <div class="native-browser-surface__status-text">
        <span>{{ nativeSurfaceFaultMessage || 'Native GPU runtime is preparing the resident atlas' }}</span>
        <small>{{ nativeSurfaceFaultMessage ? 'Native surface fault is recorded in the control plane.' : 'Browser grid DOM renderer is retired on this path.' }}</small>
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

.native-browser-surface__fallback {
  position: absolute;
  inset: 0;
  z-index: 3;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(64px, 1fr));
  align-content: start;
  gap: 10px;
  overflow: auto;
  padding: 12px;
}

.native-browser-surface__fallback-item {
  min-width: 0;
  min-height: 72px;
  display: grid;
  place-items: center;
  gap: 4px;
  padding: 6px;
  border: 1px solid rgba(163, 181, 201, 0.16);
  border-radius: 9px;
  background: rgba(9, 13, 18, 0.46);
  color: rgba(233, 241, 251, 0.94);
  cursor: pointer;
}
.native-browser-surface__cell {
  position: relative;
  min-width: 0;
}
.native-browser-surface__cell > .native-browser-surface__fallback-item {
  width: 100%;
  height: 100%;
}
.native-browser-surface__favorite {
  position: absolute;
  top: 0;
  right: 0;
  z-index: 1;
  width: 16px;
  height: 16px;
  padding: 0;
  border: 0;
  border-radius: 2px;
  background: rgba(9, 13, 18, 0.9);
  color: #e2e8f0;
  font-size: 13px;
  line-height: 16px;
  cursor: pointer;
  opacity: 0;
}
.native-browser-surface__cell:hover .native-browser-surface__favorite,
.native-browser-surface__cell:focus-within .native-browser-surface__favorite,
.native-browser-surface__favorite--saved {
  opacity: 1;
}
.native-browser-surface__favorite--saved { color: #fbbf24; }
.native-browser-surface__favorite:focus-visible { outline: 1px solid #fbbf24; }
@media (hover: none) {
  .native-browser-surface__favorite { opacity: 1; }
}
.native-browser-surface__fallback-item:hover, .native-browser-surface__fallback-item--selected {
  border-color: rgba(195, 211, 231, 0.45);
  background: rgba(18, 24, 31, 0.82);
}
.native-browser-surface__fallback-item img { width: 42px; height: 42px; object-fit: contain; image-rendering: pixelated; }
.native-browser-surface__fallback-item span { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 10px; }

/* Match optimize's native surface geometry; the enclosing shell supplies padding. */
.native-browser-surface__catalog-grid {
  grid-template-columns: repeat(auto-fill, var(--browser-item-size));
  grid-auto-rows: var(--browser-item-size);
  gap: 4px;
  padding: 0;
}
.native-browser-surface__catalog-grid .native-browser-surface__fallback-item {
  width: var(--browser-item-size);
  height: var(--browser-item-size);
  min-height: 0;
  padding: 0;
  gap: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
}
.native-browser-surface__catalog-grid .native-browser-surface__fallback-item:hover,
.native-browser-surface__catalog-grid .native-browser-surface__fallback-item--selected {
  background: rgba(255, 255, 255, 0.1);
}
.native-browser-surface__catalog-grid .native-browser-surface__fallback-item:focus-visible {
  outline: 1px solid rgba(245, 158, 11, 0.8);
  outline-offset: -1px;
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
