import type {
  NativeHitResult,
  NativeNeiSurfaceController,
  NativeRendererBackendKind,
  NativeSurfaceCompatEntries,
  NativeSurfaceId,
  NativeSurfaceInitializeOptions,
  NativeSurfaceMetrics,
  NativeSurfacePointer,
  NativeSurfaceViewport,
} from "./contracts";
import {
  createNativeSurfaceMetrics,
  getNativeSurfaceMetrics,
  updateNativeSurfaceMetrics,
} from "./NativeSurfaceMetrics";
import { postNativeSurfaceEngineEvent } from "./NativeSurfaceEngineClient";
import type { NativeSurfaceEngineEntry } from "./NativeSurfaceEngineProtocol";
import { loadNativeRuntimeBuffers } from "./runtimeLoader";

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
  private nativeRuntimeReady = false;
  private nativeRuntimePacks = 0;
  private nativeRuntimeError: string | null = null;

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
      void this.loadRuntimePacks(options.manifestUrl);
    }
    this.touch("initialize");
  }

  destroy(): void {
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
    void postNativeSurfaceEngineEvent({
      type: "viewport",
      surfaceId: this.surfaceId,
      viewport,
    });
    this.touch("setViewport");
  }

  setPage(page: number): void {
    this.page = Math.max(1, Math.floor(Number(page) || 1));
    void postNativeSurfaceEngineEvent({
      type: "page",
      surfaceId: this.surfaceId,
      page: this.page,
    });
    this.touch("setPage");
  }

  setSearch(query: string): void {
    this.search = `${query ?? ""}`;
    void postNativeSurfaceEngineEvent({
      type: "search",
      surfaceId: this.surfaceId,
      query: this.search,
    });
    this.touch("setSearch");
  }

  setModFilter(modId: string | null): void {
    this.modFilter = modId ? `${modId}` : null;
    void postNativeSurfaceEngineEvent({
      type: "modFilter",
      surfaceId: this.surfaceId,
      modId: this.modFilter,
    });
    this.touch("setModFilter");
  }

  setExpandedGroups(groupKeys: string[]): void {
    this.expandedGroups = Array.from(new Set(groupKeys.map((key) => `${key ?? ""}`.trim()).filter(Boolean)));
    void postNativeSurfaceEngineEvent({
      type: "expandedGroups",
      surfaceId: this.surfaceId,
      groupKeys: this.expandedGroups,
    });
    this.touch("setExpandedGroups");
  }

  setItemSize(size: number): void {
    this.itemSize = Math.max(1, Math.floor(Number(size) || 1));
    void postNativeSurfaceEngineEvent({
      type: "itemSize",
      surfaceId: this.surfaceId,
      itemSize: this.itemSize,
    });
    this.touch("setItemSize");
  }

  setHover(pointer: NativeSurfacePointer | null): void {
    this.hover = pointer;
    this.touch("setHover");
  }

  setHistoryItems(itemIds: string[]): void {
    this.historyItems = Array.from(new Set(itemIds.map((itemId) => `${itemId ?? ""}`.trim()).filter(Boolean)));
    void postNativeSurfaceEngineEvent({
      type: "historyItems",
      surfaceId: this.surfaceId,
      itemIds: this.historyItems,
    });
    this.touch("setHistoryItems");
  }

  setCompatEntries(entries: NativeSurfaceCompatEntries): void {
    this.entries = {
      entries: entries.entries,
      atlas: entries.atlas ?? null,
    };
    void postNativeSurfaceEngineEvent({
      type: "compatEntries",
      surfaceId: this.surfaceId,
      entries: toEngineEntries(this.entries.entries),
    });
    this.touch("setCompatEntries");
  }

  async requestFrame(nowMs: number) {
    const response = await postNativeSurfaceEngineEvent({
      type: "frame",
      surfaceId: this.surfaceId,
      nowMs,
    });
    this.touch("requestFrame");
    if (!response || response.type !== "frame") return null;
    return {
      drawCommands: response.drawCommands,
      drawCommandBuffer: response.commandBuffer,
      drawCommandStride: response.commandStride,
      drawCommandCount: response.commandCount,
    };
  }

  async hitTest(pointer: NativeSurfacePointer): Promise<NativeHitResult | null> {
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
    if (!entry) return null;
    const item = getEntryItem(entry);
    return {
      viewport: response.hit.viewport,
      key: response.hit.key,
      kind: entry.kind,
      item,
      group: entry.kind === "item" ? undefined : entry.group,
      groupKey: response.hit.groupKey ?? null,
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


