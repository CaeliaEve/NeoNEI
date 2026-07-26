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
  recordNativeSurfaceFault,
  updateNativeSurfaceMetrics,
} from "./NativeSurfaceMetricsRegistry";
import { postNativeSurfaceEngineEvent } from "./NativeSurfaceEngineClient";
import type { NativeSurfaceEngineMutation, NativeSurfaceEngineResponse } from "./NativeSurfaceEngineProtocol";
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
import { NativeSurfaceLifecycle } from "./NativeSurfaceLifecycle";

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

class NativeSurfaceControllerProtocolError extends Error {
  constructor(operation: string, expectedType: NativeSurfaceEngineResponse["type"], actualType: string | null) {
    super(`Native surface engine protocol violation during ${operation}: expected ${expectedType}, received ${actualType ?? "empty response"}`);
    this.name = "NativeSurfaceControllerProtocolError";
  }
}

function requireEngineResponse<Type extends NativeSurfaceEngineResponse["type"]>(
  response: NativeSurfaceEngineResponse,
  expectedType: Type,
  operation: string,
): Extract<NativeSurfaceEngineResponse, { type: Type }> {
  if (response.type !== expectedType) {
    throw new NativeSurfaceControllerProtocolError(operation, expectedType, response.type ?? null);
  }
  return response as Extract<NativeSurfaceEngineResponse, { type: Type }>;
}

export class NativeSurfaceController implements NativeNeiSurfaceController {
  private readonly surfaceId: NativeSurfaceId;
  private readonly postEngineEvent: typeof postNativeSurfaceEngineEvent;
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
  private readonly lifecycle = new NativeSurfaceLifecycle();

  constructor(
    surfaceId: NativeSurfaceId,
    postEngineEvent: typeof postNativeSurfaceEngineEvent = postNativeSurfaceEngineEvent,
  ) {
    this.surfaceId = surfaceId;
    this.postEngineEvent = postEngineEvent;
    updateNativeSurfaceMetrics(surfaceId, createNativeSurfaceMetrics(surfaceId), "construct");
  }

  async initialize(options: NativeSurfaceInitializeOptions): Promise<void> {
    const generation = this.lifecycle.beginInitialize();
    this.initialized = false;
    this.renderer = normalizeRenderer(options.preferredRenderer);
    this.animationEnabled = Boolean(options.enableAnimations);
    this.historyViewportEnabled = Boolean(options.enableHistoryViewport);
    try {
      const response = await this.postEngineEvent({
        type: "initialize",
        surfaceId: this.surfaceId,
        preferredRenderer: this.renderer,
        enableAnimations: this.animationEnabled,
        enableHistoryViewport: this.historyViewportEnabled,
      });
      requireEngineResponse(response, "ack", "initialize");
      if (!this.lifecycle.completeInitialize(generation)) return;
      this.initialized = true;
      if (options.manifestUrl) {
        await this.loadRuntimePacks(options.manifestUrl, options.runtimePackProfile, generation);
      }
      if (!this.lifecycle.isCurrent(generation)) return;
      this.touch("initialize");
    } catch (error) {
      if (this.lifecycle.rollbackInitialize(generation)) {
        this.initialized = false;
        this.discardPendingMutations();
        this.touch("initialize:error");
      }
      throw error;
    }
  }

  destroy(): void {
    this.lifecycle.destroy();
    void this.flushMutationsNow().catch((error) => {
      this.reportEngineFailure("destroy:flush:error", error);
    });
    this.initialized = false;
    this.hover = null;
    void this.postEngineEvent({
      type: "destroy",
      surfaceId: this.surfaceId,
    })
      .then((response) => {
        requireEngineResponse(response, "ack", "destroy");
      })
      .catch((error) => {
        this.reportEngineFailure("destroy:error", error);
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
    const response = await this.postEngineEvent({
      type: "frame",
      surfaceId: this.surfaceId,
      nowMs,
    });
    this.touch("requestFrame");
    const frame = requireEngineResponse(response, "frame", "requestFrame");
    return {
      rendered: frame.rendered,
      missingTextureKeys: frame.missingTextureKeys,
      hasAnimatedSprites: frame.hasAnimatedSprites,
      animatedSpriteCount: frame.animatedSpriteCount,
      nextFrameDelayMs: frame.nextFrameDelayMs,
      runtimeProjection: frame.metrics ? {
        source: frame.metrics.projectionSource,
        projectionSource: frame.metrics.lastProjectionSource,
        totalEntries: frame.metrics.lastProjectionTotalEntries,
        pageSize: frame.metrics.currentPageSize,
        currentPage: frame.metrics.currentPage,
        windowEntries: frame.metrics.currentWindowEntries,
        query: frame.metrics.currentQuery,
        modId: frame.metrics.currentModFilter,
        runtimeReady: frame.metrics.runtimeReady,
      } : null,
    };
  }

  async hitTest(pointer: NativeSurfacePointer): Promise<NativeHitResult | null> {
    await this.flushMutationsNow();
    const response = await this.postEngineEvent({
      type: "hitTest",
      surfaceId: this.surfaceId,
      x: pointer.x,
      y: pointer.y,
      clientX: pointer.clientX,
      clientY: pointer.clientY,
      viewport: pointer.viewport,
    });
    const hitTest = requireEngineResponse(response, "hitTest", "hitTest");
    if (!hitTest.hit) return null;
    const nativeTooltip = hitTest.hit.tooltip
      ? {
        title: hitTest.hit.tooltip.groupLabel || hitTest.hit.tooltip.localizedName || hitTest.hit.tooltip.itemId,
        subtitle: hitTest.hit.tooltip.modId ?? undefined,
        itemId: hitTest.hit.tooltip.itemId,
        publicItemId: hitTest.hit.tooltip.publicItemId ?? null,
        groupKey: hitTest.hit.tooltip.groupKey ?? hitTest.hit.groupKey ?? undefined,
        localizedName: hitTest.hit.tooltip.localizedName ?? null,
        modId: hitTest.hit.tooltip.modId ?? null,
        internalName: hitTest.hit.tooltip.internalName ?? null,
        groupLabel: hitTest.hit.tooltip.groupLabel ?? null,
        groupSize: hitTest.hit.tooltip.groupSize ?? null,
      }
      : null;
    const syntheticItem = buildSyntheticItem(hitTest.hit.itemId, nativeTooltip);
    const syntheticGroup = hitTest.hit.kind !== "item" || hitTest.hit.groupKey
      ? buildSyntheticGroup(syntheticItem, nativeTooltip)
      : null;
    return {
      viewport: hitTest.hit.viewport,
      key: hitTest.hit.key,
      kind: syntheticGroup ? "group-collapsed" : "item",
      item: syntheticGroup?.representative ?? syntheticItem,
      group: syntheticGroup ?? undefined,
      groupKey: hitTest.hit.groupKey ?? null,
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
    if (!this.lifecycle.isActive()) return;
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
      void this.flushMutationsNow().catch((error) => {
        this.reportEngineFailure("mutationBatch:error", error);
      });
    });
  }

  private reportEngineFailure(eventName: string, error: unknown): void {
    this.touch(eventName);
    recordNativeSurfaceFault(this.surfaceId, {
      domain: "engine",
      phase: eventName,
      error,
    });
    if (typeof console !== "undefined") {
      console.error(`[NeoNEI native surface ${this.surfaceId}] ${eventName}`, error);
    }
  }

  private discardPendingMutations(): void {
    if (this.mutationFlushTimer !== null && this.mutationFlushTimerKind === "raf" && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(Number(this.mutationFlushTimer));
    } else if (this.mutationFlushTimer !== null && this.mutationFlushTimerKind === "timeout") {
      clearTimeout(this.mutationFlushTimer);
    }
    this.mutationFlushTimer = null;
    this.mutationFlushTimerKind = null;
    this.pendingMutations.clear();
    this.resolveMutationFlush();
  }

  private async flushMutationsNow(): Promise<void> {
    if (this.mutationFlushTimer !== null && this.mutationFlushTimerKind === "raf" && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(Number(this.mutationFlushTimer));
    } else if (this.mutationFlushTimer !== null && this.mutationFlushTimerKind === "timeout") {
      clearTimeout(this.mutationFlushTimer);
    }
    this.mutationFlushTimer = null;
    this.mutationFlushTimerKind = null;
    if (!this.lifecycle.isActive()) {
      this.pendingMutations.clear();
      this.resolveMutationFlush();
      return;
    }
    if (this.pendingMutations.size <= 0) {
      this.resolveMutationFlush();
      return;
    }
    const mutations = Array.from(this.pendingMutations.values());
    this.pendingMutations.clear();
    try {
      const response = await this.postEngineEvent({
        type: "mutationBatch",
        surfaceId: this.surfaceId,
        mutations,
      });
      requireEngineResponse(response, "ack", "mutationBatch");
      this.touch(`mutationBatch:${mutations.length}`);
    } finally {
      this.resolveMutationFlush();
    }
  }

  private resolveMutationFlush(): void {
    this.mutationFlushResolve?.();
    this.mutationFlushResolve = null;
    this.mutationFlushPromise = null;
  }

  private async loadRuntimePacks(
    manifestUrl: string,
    profile: NativeRuntimePackProfile = "full",
    generation: number,
  ): Promise<void> {
    this.nativeRuntime = beginNativeRuntimeLoad(this.nativeRuntime);
    this.touch("runtimePacks:loading");
    try {
      const runtime = await loadNativeRuntimeBuffersForProfile(manifestUrl, profile);
      if (!this.lifecycle.isCurrent(generation)) return;
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
      const response = await this.postEngineEvent({
        type: "runtimePacks",
        surfaceId: this.surfaceId,
        manifestUrl: runtime.manifestUrl,
        packs,
      });
      requireEngineResponse(response, "ack", "runtimePacks");
      if (!this.lifecycle.isCurrent(generation)) return;
      this.nativeRuntime = markNativeRuntimeReady(this.nativeRuntime, true, packs.length);
      this.touch(this.nativeRuntime.ready ? "runtimePacks:ready" : "runtimePacks:error");
    } catch (error) {
      if (!this.lifecycle.isCurrent(generation)) return;
      this.nativeRuntime = markNativeRuntimeError(this.nativeRuntime, error);
      this.touch("runtimePacks:error");
      recordNativeSurfaceFault(this.surfaceId, {
        domain: "runtime",
        phase: "runtimePacks",
        error,
      });
    }
  }
}

export function createNativeSurfaceController(surfaceId: NativeSurfaceId): NativeNeiSurfaceController {
  return new NativeSurfaceController(surfaceId);
}
