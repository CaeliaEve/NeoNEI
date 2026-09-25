import type { BrowserVariantGroup, Item } from "../services/api";
import type { NativeRuntimePackProfile } from "./NativeRuntimeProfilePolicy";

export type NativeRendererBackendKind = "auto" | "webgpu" | "webgl2";

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
  runtimePackProfile?: NativeRuntimePackProfile;
}

export type NativeSurfaceEntryKind = "item" | "group-collapsed" | "group-header";

export interface NativeHitResult {
  viewport: NativeSurfaceViewportRole;
  key: string;
  kind: NativeSurfaceEntryKind;
  item: Item;
  group?: BrowserVariantGroup;
  groupKey?: string | null;
  nativeTooltip?: NativeTooltipPayload | null;
}

export interface NativeTooltipPayload {
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
  kind: NativeSurfaceEntryKind;
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
  rendered?: boolean;
  missingTextureKeys?: string[];
  hasAnimatedSprites?: boolean;
  animatedSpriteCount?: number;
  nextFrameDelayMs?: number | null;
  runtimeProjection?: NativeSurfaceFrameProjectionMetrics | null;
}

export interface NativeSurfaceFrameProjectionMetrics {
  source: "runtime-browser-pack" | "runtime-history-pack" | "empty";
  projectionSource: "browser" | "search" | "empty";
  totalEntries: number;
  pageSize: number;
  currentPage: number;
  windowEntries: number;
  query: string;
  modId: string | null;
  runtimeReady: boolean;
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
  nativeRuntimeStatus: "idle" | "loading" | "ready" | "error";
  nativeRuntimeRevision: number;
  nativeRuntimeReady: boolean;
  nativeRuntimePacks: number;
  nativeRuntimeError: string | null;
  nativeSurfaceFaulted: boolean;
  nativeSurfaceFaultDomain: "render" | "engine" | "runtime" | "protocol" | null;
  nativeSurfaceFaultPhase: string | null;
  nativeSurfaceFaultMessage: string | null;
  nativeSurfaceFaultCount: number;
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
  setSelectedItemId(itemId: string | null): void;
  setHover(pointer: NativeSurfacePointer | null): void;
  setHistoryItems(itemIds: string[]): void;

  requestFrame(nowMs: number): Promise<NativeSurfaceFrameResult | null>;
  hitTest(pointer: NativeSurfacePointer): Promise<NativeHitResult | null>;
  getMetrics(): Promise<NativeSurfaceMetrics>;
}
