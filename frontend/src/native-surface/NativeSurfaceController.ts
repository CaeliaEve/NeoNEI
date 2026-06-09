import type {
  NativeHitResult,
  NativeNeiSurfaceController,
  NativeRendererBackendKind,
  NativeSurfaceCompatEntries,
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
import type { NativeSurfaceEngineEntry, NativeSurfaceEngineMutation } from "./NativeSurfaceEngineProtocol";
import { loadNativeRuntimeBuffers } from "./runtimeLoader";
import type { Item } from "../services/api";

function normalizeRenderer(renderer?: NativeRendererBackendKind): NativeRendererBackendKind {
  if (renderer === "webgpu" || renderer === "webgl2" || renderer === "auto") return renderer;
  return "compat-canvas";
}

function getEntryItem(entry: NativeSurfaceCompatEntries["entries"][number]) {
  return entry.kind === "item" ? entry.item : entry.group.representative;
}

function toEngineEntries(entries: NativeSurfaceCompatEntries["entries"]): NativeSurfaceEngineEntry[] {
  return entries.map((entry, entryIndex) => {
    const item = getEntryItem(entry);
    return {
      key: entry.key,
      kind: entry.kind,
      entryIndex,
      itemId: `${item?.itemId ?? ""}`,
      groupKey: entry.kind === "item" ? (entry.item.browserGroupKey ?? null) : entry.group.key,
    };
  });
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

export class CompatNativeSurfaceController implements NativeNeiSurfaceController {
  private readonly surfaceId: NativeSurfaceId;
  private initialized = false;
  private renderer: NativeRendererBackendKind = "compat-canvas";
  private viewport: NativeSurfaceViewport | null = null;
  private entries: NativeSurfaceCompatEntries = { entries: [], atlas: null };
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
  private nativeRuntimeReady = false;
  private nativeRuntimePacks = 0;
  private nativeRuntimeError: string | null = null;
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
      await this.loadRuntimePacks(options.manifestUrl);
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

  setCompatEntries(entries: NativeSurfaceCompatEntries): void {
    this.entries = {
      entries: entries.entries,
      atlas: entries.atlas ?? null,
    };
    if (this.shouldSendCompatEntriesToWorker()) {
      this.queueMutation({ type: "compatEntries", entries: toEngineEntries(this.entries.entries) });
      this.touch("setCompatEntries");
      return;
    }
    this.touch("setCompatEntries:native-runtime-suppressed");
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
    const entry = this.entries.entries[response.hit.entryIndex]
      ?? this.entries.entries.find((candidate) => {
        const item = getEntryItem(candidate);
        if (response.hit?.groupKey) {
          return candidate.kind !== "item" && candidate.group.key === response.hit.groupKey;
        }
        return item.itemId === response.hit?.itemId;
      });
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
    if (!entry) {
      const syntheticItem = buildSyntheticItem(response.hit.itemId, nativeTooltip);
      return {
        viewport: response.hit.viewport,
        key: response.hit.key,
        kind: "item",
        item: syntheticItem,
        groupKey: response.hit.groupKey ?? null,
        nativeTooltip,
      };
    }
    const baseItem = getEntryItem(entry);
    const item = nativeTooltip ? {
      ...baseItem,
      publicItemId: nativeTooltip.publicItemId || baseItem.publicItemId || null,
      localizedName: nativeTooltip.localizedName || nativeTooltip.title || baseItem.localizedName,
      modId: nativeTooltip.modId || baseItem.modId,
      internalName: nativeTooltip.internalName || baseItem.internalName,
      browserGroupKey: nativeTooltip.groupKey ?? baseItem.browserGroupKey ?? null,
      browserGroupLabel: nativeTooltip.groupLabel ?? baseItem.browserGroupLabel ?? null,
      browserGroupSize: nativeTooltip.groupSize ?? baseItem.browserGroupSize ?? null,
    } : baseItem;
    return {
      viewport: response.hit.viewport,
      key: response.hit.key,
      kind: entry.kind,
      item,
      group: entry.kind === "item" ? undefined : entry.group,
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
      entries: this.entries.entries.length,
      itemSize: this.itemSize,
      viewportWidth: this.viewport?.width ?? 0,
      viewportHeight: this.viewport?.height ?? 0,
      animationEnabled: this.animationEnabled,
      historyViewportEnabled: this.historyViewportEnabled,
      nativeRuntimeReady: this.nativeRuntimeReady,
      nativeRuntimePacks: this.nativeRuntimePacks,
      nativeRuntimeError: this.nativeRuntimeError,
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

  private shouldSendCompatEntriesToWorker(): boolean {
    return !this.nativeRuntimeReady || this.nativeRuntimePacks <= 0;
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

  private async loadRuntimePacks(manifestUrl: string): Promise<void> {
    this.nativeRuntimeReady = false;
    this.nativeRuntimePacks = 0;
    this.nativeRuntimeError = null;
    this.touch("runtimePacks:loading");
    try {
      const runtime = await loadNativeRuntimeBuffers(manifestUrl);
      const packs = Object.values(runtime.packs).map((pack) => ({
        name: pack.name,
        path: pack.path,
        url: pack.url,
        schema: pack.header.schema,
        byteLength: pack.header.byteLength,
        payloadLength: pack.header.payloadLength,
        payloadEncoding: pack.payloadEncoding,
        buffer: pack.payloadBuffer,
      }));
      const response = await postNativeSurfaceEngineEvent({
        type: "runtimePacks",
        surfaceId: this.surfaceId,
        manifestUrl: runtime.manifestUrl,
        packs,
      });
      this.nativeRuntimeReady = Boolean(response);
      this.nativeRuntimePacks = packs.length;
      this.nativeRuntimeError = null;
      this.touch("runtimePacks:ready");
    } catch (error) {
      this.nativeRuntimeReady = false;
      this.nativeRuntimePacks = 0;
      this.nativeRuntimeError = error instanceof Error ? error.message : String(error);
      this.touch("runtimePacks:error");
    }
  }
}

export function createNativeSurfaceController(surfaceId: NativeSurfaceId): NativeNeiSurfaceController {
  return new CompatNativeSurfaceController(surfaceId);
}


