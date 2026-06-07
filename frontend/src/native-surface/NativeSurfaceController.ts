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

function normalizeRenderer(renderer?: NativeRendererBackendKind): NativeRendererBackendKind {
  if (renderer === "webgpu" || renderer === "webgl2" || renderer === "auto") return renderer;
  return "compat-canvas";
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

  constructor(surfaceId: NativeSurfaceId) {
    this.surfaceId = surfaceId;
    updateNativeSurfaceMetrics(surfaceId, createNativeSurfaceMetrics(surfaceId), "construct");
  }

  async initialize(options: NativeSurfaceInitializeOptions): Promise<void> {
    this.initialized = true;
    this.renderer = normalizeRenderer(options.preferredRenderer);
    this.animationEnabled = Boolean(options.enableAnimations);
    this.historyViewportEnabled = Boolean(options.enableHistoryViewport);
    this.touch("initialize");
  }

  destroy(): void {
    this.initialized = false;
    this.hover = null;
    this.touch("destroy");
  }

  setViewport(viewport: NativeSurfaceViewport): void {
    this.viewport = viewport;
    this.touch("setViewport");
  }

  setPage(page: number): void {
    this.page = Math.max(1, Math.floor(Number(page) || 1));
    this.touch("setPage");
  }

  setSearch(query: string): void {
    this.search = `${query ?? ""}`;
    this.touch("setSearch");
  }

  setModFilter(modId: string | null): void {
    this.modFilter = modId ? `${modId}` : null;
    this.touch("setModFilter");
  }

  setExpandedGroups(groupKeys: string[]): void {
    this.expandedGroups = Array.from(new Set(groupKeys.map((key) => `${key ?? ""}`.trim()).filter(Boolean)));
    this.touch("setExpandedGroups");
  }

  setItemSize(size: number): void {
    this.itemSize = Math.max(1, Math.floor(Number(size) || 1));
    this.touch("setItemSize");
  }

  setHover(pointer: NativeSurfacePointer | null): void {
    this.hover = pointer;
    this.touch("setHover");
  }

  setHistoryItems(itemIds: string[]): void {
    this.historyItems = Array.from(new Set(itemIds.map((itemId) => `${itemId ?? ""}`.trim()).filter(Boolean)));
    this.touch("setHistoryItems");
  }

  setCompatEntries(entries: NativeSurfaceCompatEntries): void {
    this.entries = {
      entries: entries.entries,
      atlas: entries.atlas ?? null,
    };
    this.touch("setCompatEntries");
  }

  requestFrame(_nowMs: number): void {
    this.touch("requestFrame");
  }

  async hitTest(_pointer: NativeSurfacePointer): Promise<NativeHitResult | null> {
    // Phase 1 leaves hit testing inside HomeCanvasGrid. The controller exposes
    // the stable async API so the future WASM engine can take over without
    // changing Vue call sites.
    return null;
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
    }, eventName);
  }
}

export function createNativeSurfaceController(surfaceId: NativeSurfaceId): NativeNeiSurfaceController {
  return new CompatNativeSurfaceController(surfaceId);
}
