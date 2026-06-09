import type {
  NativeSurfaceEngineRequest,
  NativeSurfaceEngineWorkerMetrics,
} from "../native-surface/NativeSurfaceEngineProtocol";
import type { NativeSurfaceId } from "../native-surface/contracts";

export type NativeSurfaceMetricsSurface = {
  initialized: boolean;
  enableHistoryViewport: boolean;
  entries: unknown[];
  layoutCommands: unknown[];
  layoutRebuilds: number;
  frameRequests: number;
  lastHit: NativeSurfaceEngineWorkerMetrics["lastHit"];
  runtimePacks: Map<string, ArrayBuffer>;
  runtimeError: string | null;
  browserPack: { itemCount: number; stringCount: number } | null;
  runtimeVisibleEntries: Uint32Array | null;
  runtimeBrowserWasmItemCount: number;
  runtimeBrowserWasmProjectedEntries: number;
  runtimeGroupWasmCount: number;
  runtimeStringWasmItemCount: number;
  runtimeTextureWasmItemCount: number;
  runtimeAnimationWasmItemCount: number;
  stringByItemId: Map<string, unknown>;
  page: number;
  query: string;
  modId: string | null;
  currentPageSize: number;
  currentWindowEntries: number;
  lastProjectionMs: number;
  lastProjectionTotalEntries: number;
  lastProjectionQuery: string;
  lastProjectionSource: NativeSurfaceEngineWorkerMetrics["lastProjectionSource"];
  hasAnimatedSprites: boolean;
  animatedSpriteCount: number;
  nextFrameDelayMs: number | null;
};

export function getProjectionSourceForMetrics(
  surface: NativeSurfaceMetricsSurface | null,
): NativeSurfaceEngineWorkerMetrics["projectionSource"] {
  if (!surface) return "empty";
  if (surface.browserPack) return surface.enableHistoryViewport ? "runtime-history-pack" : "runtime-browser-pack";
  if (surface.entries.length > 0) return "compat-entries";
  return "empty";
}

export function buildNativeSurfaceMetrics(params: {
  surfaces: Iterable<NativeSurfaceMetricsSurface>;
  events: number;
  lastEvent: NativeSurfaceEngineRequest["type"] | null;
  lastSurfaceId: NativeSurfaceId | null;
  lastSurface: NativeSurfaceMetricsSurface | null;
  wasmReady: boolean;
  wasmError: string | null;
}): NativeSurfaceEngineWorkerMetrics {
  const projectionSource = getProjectionSourceForMetrics(params.lastSurface);
  return {
    initializedSurfaces: Array.from(params.surfaces).filter((surface) => surface.initialized).length,
    events: params.events,
    lastEvent: params.lastEvent,
    lastSurfaceId: params.lastSurfaceId,
    layoutCommands: params.lastSurface?.layoutCommands.length ?? 0,
    layoutRebuilds: params.lastSurface?.layoutRebuilds ?? 0,
    frameRequests: params.lastSurface?.frameRequests ?? 0,
    lastHit: params.lastSurface?.lastHit ?? null,
    wasmReady: params.wasmReady,
    wasmError: params.wasmError,
    runtimeReady: Boolean(params.lastSurface?.runtimePacks.size),
    runtimePacks: params.lastSurface?.runtimePacks.size ?? 0,
    runtimeError: params.lastSurface?.runtimeError ?? null,
    projectionSource,
    nativeBrowserEntries: params.lastSurface?.browserPack?.itemCount ?? 0,
    nativeBrowserProjectedEntries: params.lastSurface?.runtimeVisibleEntries?.length ?? 0,
    nativeBrowserWasmEntries: params.lastSurface?.runtimeBrowserWasmItemCount ?? 0,
    nativeBrowserWasmProjectedEntries: params.lastSurface?.runtimeBrowserWasmProjectedEntries ?? 0,
    nativeGroupWasmEntries: params.lastSurface?.runtimeGroupWasmCount ?? 0,
    nativeStringWasmEntries: params.lastSurface?.runtimeStringWasmItemCount ?? 0,
    nativeTextureWasmEntries: params.lastSurface?.runtimeTextureWasmItemCount ?? 0,
    nativeAnimationWasmEntries: params.lastSurface?.runtimeAnimationWasmItemCount ?? 0,
    nativeBrowserStrings: params.lastSurface?.stringByItemId.size ?? params.lastSurface?.browserPack?.stringCount ?? 0,
    currentPage: params.lastSurface?.page ?? 1,
    currentQuery: params.lastSurface?.query ?? "",
    currentModFilter: params.lastSurface?.modId ?? null,
    currentPageSize: params.lastSurface?.currentPageSize ?? 0,
    currentWindowEntries: params.lastSurface?.currentWindowEntries ?? 0,
    lastProjectionMs: params.lastSurface?.lastProjectionMs ?? 0,
    lastProjectionTotalEntries: params.lastSurface?.lastProjectionTotalEntries ?? 0,
    lastProjectionQuery: params.lastSurface?.lastProjectionQuery ?? "",
    lastProjectionSource: params.lastSurface?.lastProjectionSource ?? "empty",
    hasAnimatedSprites: params.lastSurface?.hasAnimatedSprites ?? false,
    animatedSpriteCount: params.lastSurface?.animatedSpriteCount ?? 0,
    nextFrameDelayMs: params.lastSurface?.nextFrameDelayMs ?? null,
    updatedAt: performance.now(),
  };
}
