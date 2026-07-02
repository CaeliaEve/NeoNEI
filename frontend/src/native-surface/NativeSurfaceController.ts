import type {
  NativeHitResult,
  NativeNeiSurfaceController,
  NativeRendererBackendKind,
  NativeSurfaceId,
  NativeSurfaceInitializeOptions,
  NativeSurfaceMetrics,
  NativeSurfacePointer,
  NativeTooltipPayload,
  NativeSurfaceViewport,
} from "./contracts";
import {
  createNativeSurfaceMetrics,
  getNativeSurfaceMetrics,
  updateNativeSurfaceMetrics,
} from "./NativeSurfaceMetrics";
import { postNativeSurfaceEngineEvent } from "./NativeSurfaceEngineClient";
import type { NativeSurfaceEngineMutation } from "./NativeSurfaceEngineProtocol";
import {
  beginNativeRuntimeLoad,
  createNativeRuntimeControlState,
  markNativeRuntimeError,
  markNativeRuntimeReady,
  toNativeRuntimeMetricsPatch,
} from "./NativeRuntimeControlPlane";
import {
  loadNativeRuntimeBuffersForProfile,
} from "./runtimePackCache";
import type { NativeRuntimePackProfile } from "./NativeRuntimeProfilePolicy";
import type { BrowserVariantGroup, Item } from "../services/api";

function normalizeRenderer(renderer?: NativeRendererBackendKind): NativeRendererBackendKind {
  if (renderer === "webgpu" || renderer === "webgl2" || renderer === "auto") return renderer;
  return "webgl2";
}

function buildSyntheticItem(itemId: string, tooltip: NativeTooltipPayload | null): Item {
  const publicItemId = tooltip?.publicItemId ? `${tooltip.publicItemId}` : null;
  return {
    itemId,
    publicItemId,
    localizedName: tooltip?.localizedName || tooltip?.title || itemId,
    modId: tooltip?.modId || "",
    internalName: tooltip?.internalName || itemId,
    browserGroupKey: tooltip?.groupKey ?? null,
    browserGroupLabel: tooltip?.groupLabel ?? null,
    browserGroupSize: tooltip?.groupSize ?? null,
  };
}

function buildSyntheticGroup(item: Item, tooltip: NativeTooltipPayload | null): BrowserVariantGroup | null {
  const groupKey = `${tooltip?.groupKey ?? item.browserGroupKey ?? ""}`.trim();
  if (!groupKey) return null;
  const groupSize = Math.max(1, Math.floor(Number(tooltip?.groupSize ?? item.browserGroupSize ?? 1) || 1));
  return {
    key: groupKey,
    representative: {
      ...item,
      browserGroupKey: groupKey,
      browserGroupLabel: tooltip?.groupLabel ?? item.browserGroupLabel ?? tooltip?.title ?? null,
      browserGroupSize: groupSize,
    },
    size: groupSize,
    visibleCount: groupSize,
    expandable: groupSize > 1,
    label: tooltip?.groupLabel || item.browserGroupLabel || tooltip?.title || groupKey,
    semanticFamily: null,
    semanticClassification: null,
    groupSource: "native-runtime",
  };
}

export class NativeSurfaceController implements NativeNeiSurfaceController {
  private readonly surfaceId: NativeSurfaceId;
  private initialized = false;
  private renderer: NativeRendererBackendKind = "webgl2";
  private viewport: NativeSurfaceViewport | null = null;
  private itemSize = 0;
  private animationEnabled = false;
  private historyViewportEnabled = false;
  private hover: NativeSurfacePointer | null = null;
  private historyItems: string[] = [];
  private page = 1;
  private search = "";
  private modFilter: string | null = null;
  private expandedGroups: string[] = [];
  private selectedItemId: string | null = null;
  private nativeRuntime = createNativeRuntimeControlState();
  private pendingMutations = new Map<NativeSurfaceEngineMutation["type"], NativeSurfaceEngineMutation>();
  private mutationFlushTimer: ReturnType<typeof setTimeout> | number | null = null;
  private mutationFlushTimerKind: "raf" | "timeout" | null = null;
  private mutationFlushPromise: Promise<void> | null = null;
  private mutationFlushResolve: (() => void) | null = null;

  constructor(surfaceId: NativeSurfaceId) {
    this.surfaceId = surfaceId;
    updateNativeSurfaceMetrics(surfaceId, createNativeSurfaceMetrics(surfaceId), "construct");
  }

  async initialize(options: NativeSurfaceInitializeOptions): Promise<void> {
    this.initialized = true;
    this.renderer = normalizeRenderer(options.preferredRenderer);
    this.animationEnabled = Boolean(options.enableAnimations);
    this.historyViewportEnabled = Boolean(options.enableHistoryViewport);
    void postNativeSurfaceEngineEvent({
      type: "initialize",
      surfaceId: this.surfaceId,
      preferredRenderer: this.renderer,
      enableAnimations: this.animationEnabled,
      enableHistoryViewport: this.historyViewportEnabled,
    });
    if (options.manifestUrl) {
      await this.loadRuntimePacks(options.manifestUrl, options.runtimePackProfile);
    }
    this.touch("initialize");
  }

  destroy(): void {
    void this.flushMutationsNow();
    this.initialized = false;
    this.hover = null;
    void postNativeSurfaceEngineEvent({
      type: "destroy",
      surfaceId: this.surfaceId,
    });
    this.touch("destroy");
  }

  setViewport(viewport: NativeSurfaceViewport): void {
    this.viewport = viewport;
    this.queueMutation({ type: "viewport", viewport });
    this.touch("setViewport");
  }

  setPage(page: number): void {
    this.page = Math.max(1, Math.floor(Number(page) || 1));
    this.queueMutation({ type: "page", page: this.page });
    this.touch("setPage");
  }

  setSearch(query: string): void {
    this.search = `${query ?? ""}`;
    this.queueMutation({ type: "search", query: this.search });
    this.touch("setSearch");
  }

  setModFilter(modId: string | null): void {
    this.modFilter = modId ? `${modId}` : null;
    this.queueMutation({ type: "modFilter", modId: this.modFilter });
    this.touch("setModFilter");
  }

  setExpandedGroups(groupKeys: string[]): void {
    this.expandedGroups = Array.from(new Set(groupKeys.map((key) => `${key ?? ""}`.trim()).filter(Boolean)));
    this.queueMutation({ type: "expandedGroups", groupKeys: this.expandedGroups });
    this.touch("setExpandedGroups");
  }

  setItemSize(size: number): void {
    this.itemSize = Math.max(1, Math.floor(Number(size) || 1));
    this.queueMutation({ type: "itemSize", itemSize: this.itemSize });
    this.touch("setItemSize");
  }

  setSelectedItemId(itemId: string | null): void {
    const normalized = itemId ? `${itemId}`.trim() : "";
    this.selectedItemId = normalized || null;
    this.queueMutation({ type: "selectedItem", itemId: this.selectedItemId });
    this.touch("setSelectedItemId");
  }

  setHover(pointer: NativeSurfacePointer | null): void {
    this.hover = pointer;
    this.touch("setHover");
  }

  setHistoryItems(itemIds: string[]): void {
    this.historyItems = Array.from(new Set(itemIds.map((itemId) => `${itemId ?? ""}`.trim()).filter(Boolean)));
    this.queueMutation({ type: "historyItems", itemIds: this.historyItems });
    this.touch("setHistoryItems");
  }

  async requestFrame(nowMs: number) {
    await this.flushMutationsNow();
    const response = await postNativeSurfaceEngineEvent({
      type: "frame",
      surfaceId: this.surfaceId,
      nowMs,
    });
    this.touch("requestFrame");
    if (!response || response.type !== "frame") return null;
    return {
      drawCommands: response.drawCommands,
      spriteCommands: response.spriteCommands,
      drawCommandBuffer: response.commandBuffer,
      drawCommandStride: response.commandStride,
      drawCommandCount: response.commandCount,
      hasAnimatedSprites: response.hasAnimatedSprites,
      animatedSpriteCount: response.animatedSpriteCount,
      nextFrameDelayMs: response.nextFrameDelayMs,
      runtimeProjection: response.metrics ? {
        source: response.metrics.projectionSource,
        projectionSource: response.metrics.lastProjectionSource,
        totalEntries: response.metrics.lastProjectionTotalEntries,
        pageSize: response.metrics.currentPageSize,
        currentPage: response.metrics.currentPage,
        windowEntries: response.metrics.currentWindowEntries,
        query: response.metrics.currentQuery,
        modId: response.metrics.currentModFilter,
        runtimeReady: response.metrics.runtimeReady,
      } : null,
    };
  }

  async hitTest(pointer: NativeSurfacePointer): Promise<NativeHitResult | null> {
    await this.flushMutationsNow();
    const response = await postNativeSurfaceEngineEvent({
      type: "hitTest",
      surfaceId: this.surfaceId,
      x: pointer.x,
      y: pointer.y,
      clientX: pointer.clientX,
      clientY: pointer.clientY,
      viewport: pointer.viewport,
    });
    if (!response || response.type !== "hitTest" || !response.hit) return null;
    const nativeTooltip = response.hit.tooltip
      ? {
        title: response.hit.tooltip.groupLabel || response.hit.tooltip.localizedName || response.hit.tooltip.itemId,
        subtitle: response.hit.tooltip.modId ?? undefined,
        itemId: response.hit.tooltip.itemId,
        publicItemId: response.hit.tooltip.publicItemId ?? null,
        groupKey: response.hit.tooltip.groupKey ?? response.hit.groupKey ?? undefined,
        localizedName: response.hit.tooltip.localizedName ?? null,
        modId: response.hit.tooltip.modId ?? null,
        internalName: response.hit.tooltip.internalName ?? null,
        groupLabel: response.hit.tooltip.groupLabel ?? null,
        groupSize: response.hit.tooltip.groupSize ?? null,
      }
      : null;
    const syntheticItem = buildSyntheticItem(response.hit.itemId, nativeTooltip);
    const syntheticGroup = response.hit.kind !== "item" || response.hit.groupKey
      ? buildSyntheticGroup(syntheticItem, nativeTooltip)
      : null;
    return {
      viewport: response.hit.viewport,
      key: response.hit.key,
      kind: syntheticGroup ? "group-collapsed" : "item",
      item: syntheticGroup?.representative ?? syntheticItem,
      group: syntheticGroup ?? undefined,
      groupKey: response.hit.groupKey ?? null,
      nativeTooltip,
    };
  }

  async getMetrics(): Promise<NativeSurfaceMetrics> {
    return getNativeSurfaceMetrics(this.surfaceId);
  }

  private touch(eventName: string): void {
    updateNativeSurfaceMetrics(this.surfaceId, {
      initialized: this.initialized,
      renderer: this.renderer,
      entries: this.nativeRuntime.ready ? this.nativeRuntime.packCount : 0,
      itemSize: this.itemSize,
      viewportWidth: this.viewport?.width ?? 0,
      viewportHeight: this.viewport?.height ?? 0,
      animationEnabled: this.animationEnabled,
      historyViewportEnabled: this.historyViewportEnabled,
      ...toNativeRuntimeMetricsPatch(this.nativeRuntime),
    }, eventName);
  }

  private queueMutation(mutation: NativeSurfaceEngineMutation): void {
    this.pendingMutations.set(mutation.type, mutation);
    if (!this.mutationFlushPromise) {
      this.mutationFlushPromise = new Promise<void>((resolve) => {
        this.mutationFlushResolve = resolve;
      });
    }
    if (this.mutationFlushTimer !== null) return;
    const useRaf = typeof requestAnimationFrame === "function";
    const schedule = useRaf
      ? requestAnimationFrame
      : (callback: FrameRequestCallback) => setTimeout(() => callback(performance.now()), 0);
    this.mutationFlushTimerKind = useRaf ? "raf" : "timeout";
    this.mutationFlushTimer = schedule(() => {
      this.mutationFlushTimer = null;
      this.mutationFlushTimerKind = null;
      void this.flushMutationsNow();
    });
  }


  private async flushMutationsNow(): Promise<void> {
    if (this.mutationFlushTimer !== null && this.mutationFlushTimerKind === "raf" && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(Number(this.mutationFlushTimer));
    } else if (this.mutationFlushTimer !== null && this.mutationFlushTimerKind === "timeout") {
      clearTimeout(this.mutationFlushTimer);
    }
    this.mutationFlushTimer = null;
    this.mutationFlushTimerKind = null;
    if (this.pendingMutations.size <= 0) {
      this.resolveMutationFlush();
      return;
    }
    const mutations = Array.from(this.pendingMutations.values());
    this.pendingMutations.clear();
    await postNativeSurfaceEngineEvent({
      type: "mutationBatch",
      surfaceId: this.surfaceId,
      mutations,
    });
    this.touch(`mutationBatch:${mutations.length}`);
    this.resolveMutationFlush();
  }

  private resolveMutationFlush(): void {
    this.mutationFlushResolve?.();
    this.mutationFlushResolve = null;
    this.mutationFlushPromise = null;
  }

  private async loadRuntimePacks(manifestUrl: string, profile: NativeRuntimePackProfile = "full"): Promise<void> {
    this.nativeRuntime = beginNativeRuntimeLoad(this.nativeRuntime);
    this.touch("runtimePacks:loading");
    try {
      const runtime = await loadNativeRuntimeBuffersForProfile(manifestUrl, profile);
      const packs = Object.values(runtime.packs).filter(Boolean).map((pack) => ({
        name: pack.name,
        path: pack.path,
        url: pack.url,
        schema: pack.header.schema,
        byteLength: pack.header.byteLength,
        payloadLength: pack.header.payloadLength,
        payloadEncoding: pack.payloadEncoding,
        // postMessage transfers pack buffers to the worker; clone so the shared
        // runtime pack cache remains resident for other surfaces.
        buffer: pack.payloadBuffer.slice(0),
      }));
      const response = await postNativeSurfaceEngineEvent({
        type: "runtimePacks",
        surfaceId: this.surfaceId,
        manifestUrl: runtime.manifestUrl,
        packs,
      });
      this.nativeRuntime = markNativeRuntimeReady(this.nativeRuntime, Boolean(response), packs.length);
      this.touch(this.nativeRuntime.ready ? "runtimePacks:ready" : "runtimePacks:error");
    } catch (error) {
      this.nativeRuntime = markNativeRuntimeError(this.nativeRuntime, error);
      this.touch("runtimePacks:error");
    }
  }
}

export function createNativeSurfaceController(surfaceId: NativeSurfaceId): NativeNeiSurfaceController {
  return new NativeSurfaceController(surfaceId);
}
