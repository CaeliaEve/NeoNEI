import type { BrowserGridEntry, BrowserVariantGroup, Item } from "../services/api";
import type { PageAtlasResult } from "../services/pageAtlas";

export type NativeRendererBackendKind = "auto" | "webgpu" | "webgl2" | "compat-canvas";

export type NativeSurfaceId = "browser" | "history" | (string & {});

export type NativeSurfaceViewportRole = "browser" | "history";

export interface NativeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface NativeSurfaceViewport {
  width: number;
  height: number;
  devicePixelRatio: number;
  browserRect: NativeRect;
  historyRect?: NativeRect;
}

export interface NativeSurfacePointer {
  x: number;
  y: number;
  clientX: number;
  clientY: number;
  viewport: NativeSurfaceViewportRole;
}

export interface NativeSurfaceInitializeOptions {
  surfaceId: NativeSurfaceId;
  canvas?: HTMLCanvasElement | null;
  manifestUrl?: string;
  locale?: string;
  preferredRenderer?: NativeRendererBackendKind;
  enableAnimations?: boolean;
  enableHistoryViewport?: boolean;
}

export interface NativeSurfaceCompatEntries {
  entries: BrowserGridEntry[];
  atlas?: PageAtlasResult | null;
}

export interface NativeHitResult {
  viewport: NativeSurfaceViewportRole;
  key: string;
  kind: BrowserGridEntry["kind"];
  item: Item;
  group?: BrowserVariantGroup;
}

export interface NativeTooltipPayload {
  title: string;
  subtitle?: string;
  itemId?: string;
  groupKey?: string;
}

export interface NativeDrawCommand {
  viewportId: number;
  textureId: number;
  sourceX: number;
  sourceY: number;
  sourceW: number;
  sourceH: number;
  destX: number;
  destY: number;
  destW: number;
  destH: number;
  colorR: number;
  colorG: number;
  colorB: number;
  colorA: number;
  flags: number;
}

export interface NativeSurfaceLayoutCommand {
  key: string;
  kind: BrowserGridEntry["kind"];
  entryIndex: number;
  itemId: string;
  groupKey?: string | null;
  x: number;
  y: number;
  size: number;
  iconX: number;
  iconY: number;
  iconSize: number;
}

export interface NativeSurfaceFrameResult {
  drawCommands: NativeSurfaceLayoutCommand[];
}

export interface NativeSurfaceMetrics {
  surfaceId: NativeSurfaceId;
  initialized: boolean;
  renderer: NativeRendererBackendKind;
  entries: number;
  itemSize: number;
  viewportWidth: number;
  viewportHeight: number;
  animationEnabled: boolean;
  historyViewportEnabled: boolean;
  lastEvent: string | null;
  eventCount: number;
  updatedAt: number;
}

export interface NativeNeiSurfaceController {
  initialize(options: NativeSurfaceInitializeOptions): Promise<void>;
  destroy(): void;

  setViewport(viewport: NativeSurfaceViewport): void;
  setPage(page: number): void;
  setSearch(query: string): void;
  setModFilter(modId: string | null): void;
  setExpandedGroups(groupKeys: string[]): void;
  setItemSize(size: number): void;
  setHover(pointer: NativeSurfacePointer | null): void;
  setHistoryItems(itemIds: string[]): void;

  /**
   * Phase-1 compatibility input. The final WASM engine should derive visible
   * entries from binary browser/group/search packs instead of accepting Vue
   * entry arrays directly.
   */
  setCompatEntries(entries: NativeSurfaceCompatEntries): void;

  requestFrame(nowMs: number): Promise<NativeSurfaceFrameResult | null>;
  hitTest(pointer: NativeSurfacePointer): Promise<NativeHitResult | null>;
  getMetrics(): Promise<NativeSurfaceMetrics>;
}

export interface NativeRuntimeManifest {
  schemaVersion: "neonei/native-runtime/current";
  runtimeVersion: string;
  generatedAt: string;
  sourceSignature: string;
  locale: string;
  files: {
    browserPack: string;
    searchPack: string;
    recipePack: string;
    texturePack: string;
    animationPack: string;
    groupPack: string;
    stringPack: string;
    integrity: string;
    sizeReport: string;
    missingDataReport: string;
  };
  counts: {
    items: number;
    visibleBrowserEntries: number;
    groups: number;
    recipes: number;
    staticAtlasItems: number;
    animatedAtlasItems: number;
    atlasFiles: number;
  };
  capabilities: {
    binaryPacks: boolean;
    wasmSurface: boolean;
    gpuSurface: boolean;
    webgpuPreferred: boolean;
    webgl2Compatible: boolean;
    perItemImageFallback: false;
  };
}


