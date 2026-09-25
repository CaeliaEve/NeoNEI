import type {
  NativeSurfaceEngineRequest,
  NativeSurfaceEngineWorkerMetrics,
} from "../native-surface/NativeSurfaceEngineProtocol";
import type { NativeSurfaceId } from "../native-surface/contracts";

export type NativeSurfaceWorkerMetricsSurface = {
  initialized: boolean;
  enableHistoryViewport: boolean;
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
  spriteCommandCount: number;
  missingSpriteCount: number;
  missingSpriteItemIds: string[];
  nextFrameDelayMs: number | null;
};

export type NativeSurfaceWorkerMetricsInput = Readonly<{
  surfaces: Iterable<NativeSurfaceWorkerMetricsSurface>;
  events: number;
  lastEvent: NativeSurfaceEngineRequest["type"] | null;
  lastSurfaceId: NativeSurfaceId | null;
  lastSurface: NativeSurfaceWorkerMetricsSurface | null;
  wasmReady: boolean;
  wasmError: string | null;
  nowMs?: number;
}>;

export type NativeSurfaceWorkerMetricKey = keyof NativeSurfaceEngineWorkerMetrics;

type NativeSurfaceWorkerMetricsContext = Readonly<{
  surfaces: readonly NativeSurfaceWorkerMetricsSurface[];
  events: number;
  lastEvent: NativeSurfaceEngineRequest["type"] | null;
  lastSurfaceId: NativeSurfaceId | null;
  lastSurface: NativeSurfaceWorkerMetricsSurface | null;
  wasmReady: boolean;
  wasmError: string | null;
  projectionSource: NativeSurfaceEngineWorkerMetrics["projectionSource"];
  updatedAt: number;
}>;

type NativeSurfaceWorkerMetricDomain =
  | "worker"
  | "layout"
  | "wasm-runtime"
  | "runtime-pack"
  | "browser-projection"
  | "pagination"
  | "sprite-timeline"
  | "clock";

export type NativeSurfaceWorkerMetricDescriptor<
  Key extends NativeSurfaceWorkerMetricKey = NativeSurfaceWorkerMetricKey,
> = Readonly<{
  key: Key;
  domain: NativeSurfaceWorkerMetricDomain;
  source: string;
  read: (context: NativeSurfaceWorkerMetricsContext) => NativeSurfaceEngineWorkerMetrics[Key];
}>;

type NativeSurfaceWorkerMetricDescriptorMap = {
  readonly [Key in NativeSurfaceWorkerMetricKey]: NativeSurfaceWorkerMetricDescriptor<Key>;
};

type NativeSurfaceWorkerProjectionSourceRule = Readonly<{
  id: NativeSurfaceEngineWorkerMetrics["projectionSource"];
  accepts: (surface: NativeSurfaceWorkerMetricsSurface | null) => boolean;
}>;

export const NATIVE_SURFACE_WORKER_PROJECTION_SOURCE_RULES: readonly NativeSurfaceWorkerProjectionSourceRule[] =
  Object.freeze([
    Object.freeze({
      id: "runtime-history-pack",
      accepts: (surface) => Boolean(surface?.browserPack && surface.enableHistoryViewport),
    }),
    Object.freeze({
      id: "runtime-browser-pack",
      accepts: (surface) => Boolean(surface?.browserPack && !surface.enableHistoryViewport),
    }),
    Object.freeze({
      id: "empty",
      accepts: () => true,
    }),
  ]);

export const NATIVE_SURFACE_WORKER_PROJECTION_SOURCE_POLICY = Object.freeze({
  id: "nativeSurface.workerMetrics.projectionSource",
  owner: "native-surface-engine-worker",
  schema: "neonei/native-surface-worker-projection-source/current",
  selectionPolicy: "first-matching-descriptor",
  terminalPolicy: "empty-descriptor-terminal",
  rules: NATIVE_SURFACE_WORKER_PROJECTION_SOURCE_RULES.map((rule) => rule.id),
} as const);

export function selectNativeSurfaceWorkerProjectionSource(
  surface: NativeSurfaceWorkerMetricsSurface | null,
): NativeSurfaceEngineWorkerMetrics["projectionSource"] {
  for (const rule of NATIVE_SURFACE_WORKER_PROJECTION_SOURCE_RULES) {
    if (rule.accepts(surface)) return rule.id;
  }
  throw new Error("Native surface worker projection source catalog has no terminal descriptor");
}

function defineNativeSurfaceWorkerMetric<Key extends NativeSurfaceWorkerMetricKey>(
  descriptor: NativeSurfaceWorkerMetricDescriptor<Key>,
): NativeSurfaceWorkerMetricDescriptor<Key> {
  return Object.freeze(descriptor);
}

function validateNativeSurfaceWorkerMetricDescriptorMap(
  descriptors: NativeSurfaceWorkerMetricDescriptorMap,
): NativeSurfaceWorkerMetricDescriptorMap {
  const seen = new Set<string>();
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (!descriptor || descriptor.key !== key) {
      throw new Error(`Native surface worker metric descriptor key mismatch: ${key}`);
    }
    if (seen.has(descriptor.key)) {
      throw new Error(`Duplicate native surface worker metric descriptor: ${descriptor.key}`);
    }
    seen.add(descriptor.key);
    if (!descriptor.domain || !descriptor.source) {
      throw new Error(`Native surface worker metric descriptor is incomplete: ${descriptor.key}`);
    }
  }
  return Object.freeze(descriptors);
}

export const NATIVE_SURFACE_WORKER_METRIC_DESCRIPTOR_MAP =
  validateNativeSurfaceWorkerMetricDescriptorMap({
    surfaceCount: defineNativeSurfaceWorkerMetric({
      key: "surfaceCount",
      domain: "worker",
      source: "surfaces.length",
      read: (context) => context.surfaces.length,
    }),
    initializedSurfaces: defineNativeSurfaceWorkerMetric({
      key: "initializedSurfaces",
      domain: "worker",
      source: "surfaces.initialized",
      read: (context) => context.surfaces.filter((surface) => surface.initialized).length,
    }),
    runtimePackBytes: defineNativeSurfaceWorkerMetric({
      key: "runtimePackBytes",
      domain: "runtime-pack",
      source: "surfaces.runtimePacks.buffer.byteLength",
      read: (context) => context.surfaces.reduce((total, surface) => {
        for (const buffer of surface.runtimePacks.values()) total += buffer.byteLength;
        return total;
      }, 0),
    }),
    events: defineNativeSurfaceWorkerMetric({
      key: "events",
      domain: "worker",
      source: "worker.eventCount",
      read: (context) => context.events,
    }),
    lastEvent: defineNativeSurfaceWorkerMetric({
      key: "lastEvent",
      domain: "worker",
      source: "worker.lastEvent",
      read: (context) => context.lastEvent,
    }),
    lastSurfaceId: defineNativeSurfaceWorkerMetric({
      key: "lastSurfaceId",
      domain: "worker",
      source: "worker.lastSurfaceId",
      read: (context) => context.lastSurfaceId,
    }),
    layoutCommands: defineNativeSurfaceWorkerMetric({
      key: "layoutCommands",
      domain: "layout",
      source: "surface.layoutCommands.length",
      read: (context) => context.lastSurface?.layoutCommands.length ?? 0,
    }),
    layoutRebuilds: defineNativeSurfaceWorkerMetric({
      key: "layoutRebuilds",
      domain: "layout",
      source: "surface.layoutRebuilds",
      read: (context) => context.lastSurface?.layoutRebuilds ?? 0,
    }),
    frameRequests: defineNativeSurfaceWorkerMetric({
      key: "frameRequests",
      domain: "layout",
      source: "surface.frameRequests",
      read: (context) => context.lastSurface?.frameRequests ?? 0,
    }),
    lastHit: defineNativeSurfaceWorkerMetric({
      key: "lastHit",
      domain: "layout",
      source: "surface.lastHit",
      read: (context) => context.lastSurface?.lastHit ?? null,
    }),
    wasmReady: defineNativeSurfaceWorkerMetric({
      key: "wasmReady",
      domain: "wasm-runtime",
      source: "wasm.engine.ready",
      read: (context) => context.wasmReady,
    }),
    wasmError: defineNativeSurfaceWorkerMetric({
      key: "wasmError",
      domain: "wasm-runtime",
      source: "wasm.engine.error",
      read: (context) => context.wasmError,
    }),
    runtimeReady: defineNativeSurfaceWorkerMetric({
      key: "runtimeReady",
      domain: "runtime-pack",
      source: "surface.runtimePacks.size",
      read: (context) => Boolean(context.lastSurface?.runtimePacks.size),
    }),
    runtimePacks: defineNativeSurfaceWorkerMetric({
      key: "runtimePacks",
      domain: "runtime-pack",
      source: "surface.runtimePacks.size",
      read: (context) => context.lastSurface?.runtimePacks.size ?? 0,
    }),
    runtimeError: defineNativeSurfaceWorkerMetric({
      key: "runtimeError",
      domain: "runtime-pack",
      source: "surface.runtimeError",
      read: (context) => context.lastSurface?.runtimeError ?? null,
    }),
    projectionSource: defineNativeSurfaceWorkerMetric({
      key: "projectionSource",
      domain: "browser-projection",
      source: "projectionSource.catalog",
      read: (context) => context.projectionSource,
    }),
    nativeBrowserEntries: defineNativeSurfaceWorkerMetric({
      key: "nativeBrowserEntries",
      domain: "browser-projection",
      source: "surface.browserPack.itemCount",
      read: (context) => context.lastSurface?.browserPack?.itemCount ?? 0,
    }),
    nativeBrowserProjectedEntries: defineNativeSurfaceWorkerMetric({
      key: "nativeBrowserProjectedEntries",
      domain: "browser-projection",
      source: "surface.runtimeVisibleEntries.length",
      read: (context) => context.lastSurface?.runtimeVisibleEntries?.length ?? 0,
    }),
    nativeBrowserWasmEntries: defineNativeSurfaceWorkerMetric({
      key: "nativeBrowserWasmEntries",
      domain: "wasm-runtime",
      source: "surface.runtimeBrowserWasmItemCount",
      read: (context) => context.lastSurface?.runtimeBrowserWasmItemCount ?? 0,
    }),
    nativeBrowserWasmProjectedEntries: defineNativeSurfaceWorkerMetric({
      key: "nativeBrowserWasmProjectedEntries",
      domain: "wasm-runtime",
      source: "surface.runtimeBrowserWasmProjectedEntries",
      read: (context) => context.lastSurface?.runtimeBrowserWasmProjectedEntries ?? 0,
    }),
    nativeGroupWasmEntries: defineNativeSurfaceWorkerMetric({
      key: "nativeGroupWasmEntries",
      domain: "wasm-runtime",
      source: "surface.runtimeGroupWasmCount",
      read: (context) => context.lastSurface?.runtimeGroupWasmCount ?? 0,
    }),
    nativeStringWasmEntries: defineNativeSurfaceWorkerMetric({
      key: "nativeStringWasmEntries",
      domain: "wasm-runtime",
      source: "surface.runtimeStringWasmItemCount",
      read: (context) => context.lastSurface?.runtimeStringWasmItemCount ?? 0,
    }),
    nativeTextureWasmEntries: defineNativeSurfaceWorkerMetric({
      key: "nativeTextureWasmEntries",
      domain: "wasm-runtime",
      source: "surface.runtimeTextureWasmItemCount",
      read: (context) => context.lastSurface?.runtimeTextureWasmItemCount ?? 0,
    }),
    nativeAnimationWasmEntries: defineNativeSurfaceWorkerMetric({
      key: "nativeAnimationWasmEntries",
      domain: "wasm-runtime",
      source: "surface.runtimeAnimationWasmItemCount",
      read: (context) => context.lastSurface?.runtimeAnimationWasmItemCount ?? 0,
    }),
    nativeBrowserStrings: defineNativeSurfaceWorkerMetric({
      key: "nativeBrowserStrings",
      domain: "browser-projection",
      source: "surface.stringByItemId.size|browserPack.stringCount",
      read: (context) => context.lastSurface?.stringByItemId.size ?? context.lastSurface?.browserPack?.stringCount ?? 0,
    }),
    currentPage: defineNativeSurfaceWorkerMetric({
      key: "currentPage",
      domain: "pagination",
      source: "surface.page",
      read: (context) => context.lastSurface?.page ?? 1,
    }),
    currentQuery: defineNativeSurfaceWorkerMetric({
      key: "currentQuery",
      domain: "pagination",
      source: "surface.query",
      read: (context) => context.lastSurface?.query ?? "",
    }),
    currentModFilter: defineNativeSurfaceWorkerMetric({
      key: "currentModFilter",
      domain: "pagination",
      source: "surface.modId",
      read: (context) => context.lastSurface?.modId ?? null,
    }),
    currentPageSize: defineNativeSurfaceWorkerMetric({
      key: "currentPageSize",
      domain: "pagination",
      source: "surface.currentPageSize",
      read: (context) => context.lastSurface?.currentPageSize ?? 0,
    }),
    currentWindowEntries: defineNativeSurfaceWorkerMetric({
      key: "currentWindowEntries",
      domain: "pagination",
      source: "surface.currentWindowEntries",
      read: (context) => context.lastSurface?.currentWindowEntries ?? 0,
    }),
    lastProjectionMs: defineNativeSurfaceWorkerMetric({
      key: "lastProjectionMs",
      domain: "browser-projection",
      source: "surface.lastProjectionMs",
      read: (context) => context.lastSurface?.lastProjectionMs ?? 0,
    }),
    lastProjectionTotalEntries: defineNativeSurfaceWorkerMetric({
      key: "lastProjectionTotalEntries",
      domain: "browser-projection",
      source: "surface.lastProjectionTotalEntries",
      read: (context) => context.lastSurface?.lastProjectionTotalEntries ?? 0,
    }),
    lastProjectionQuery: defineNativeSurfaceWorkerMetric({
      key: "lastProjectionQuery",
      domain: "browser-projection",
      source: "surface.lastProjectionQuery",
      read: (context) => context.lastSurface?.lastProjectionQuery ?? "",
    }),
    lastProjectionSource: defineNativeSurfaceWorkerMetric({
      key: "lastProjectionSource",
      domain: "browser-projection",
      source: "surface.lastProjectionSource",
      read: (context) => context.lastSurface?.lastProjectionSource ?? "empty",
    }),
    hasAnimatedSprites: defineNativeSurfaceWorkerMetric({
      key: "hasAnimatedSprites",
      domain: "sprite-timeline",
      source: "surface.hasAnimatedSprites",
      read: (context) => context.lastSurface?.hasAnimatedSprites ?? false,
    }),
    animatedSpriteCount: defineNativeSurfaceWorkerMetric({
      key: "animatedSpriteCount",
      domain: "sprite-timeline",
      source: "surface.animatedSpriteCount",
      read: (context) => context.lastSurface?.animatedSpriteCount ?? 0,
    }),
    spriteCommandCount: defineNativeSurfaceWorkerMetric({
      key: "spriteCommandCount",
      domain: "sprite-timeline",
      source: "surface.spriteCommandCount",
      read: (context) => context.lastSurface?.spriteCommandCount ?? 0,
    }),
    missingSpriteCount: defineNativeSurfaceWorkerMetric({
      key: "missingSpriteCount",
      domain: "sprite-timeline",
      source: "surface.missingSpriteCount",
      read: (context) => context.lastSurface?.missingSpriteCount ?? 0,
    }),
    missingSpriteItemIds: defineNativeSurfaceWorkerMetric({
      key: "missingSpriteItemIds",
      domain: "sprite-timeline",
      source: "surface.missingSpriteItemIds",
      read: (context) => context.lastSurface?.missingSpriteItemIds ?? [],
    }),
    nextFrameDelayMs: defineNativeSurfaceWorkerMetric({
      key: "nextFrameDelayMs",
      domain: "sprite-timeline",
      source: "surface.nextFrameDelayMs",
      read: (context) => context.lastSurface?.nextFrameDelayMs ?? null,
    }),
    updatedAt: defineNativeSurfaceWorkerMetric({
      key: "updatedAt",
      domain: "clock",
      source: "performance.now",
      read: (context) => context.updatedAt,
    }),
  });

export const NATIVE_SURFACE_WORKER_METRIC_FIELD_ORDER = Object.freeze(
  Object.keys(NATIVE_SURFACE_WORKER_METRIC_DESCRIPTOR_MAP),
) as readonly NativeSurfaceWorkerMetricKey[];

export const NATIVE_SURFACE_WORKER_METRICS_CATALOG = Object.freeze({
  id: "nativeSurface.workerMetricsCatalog",
  owner: "native-surface-engine-worker",
  schema: "neonei/native-surface-worker-metrics/current",
  descriptorCount: NATIVE_SURFACE_WORKER_METRIC_FIELD_ORDER.length,
  descriptorMap: NATIVE_SURFACE_WORKER_METRIC_DESCRIPTOR_MAP,
  projectionSourcePolicy: NATIVE_SURFACE_WORKER_PROJECTION_SOURCE_POLICY,
  buildPolicy: "descriptor-table-metrics-projection",
  failurePolicy: "fail-closed-metric-abi",
} as const);

function createNativeSurfaceWorkerMetricsContext(
  input: NativeSurfaceWorkerMetricsInput,
): NativeSurfaceWorkerMetricsContext {
  return Object.freeze({
    surfaces: Object.freeze(Array.from(input.surfaces)),
    events: input.events,
    lastEvent: input.lastEvent,
    lastSurfaceId: input.lastSurfaceId,
    lastSurface: input.lastSurface,
    wasmReady: input.wasmReady,
    wasmError: input.wasmError,
    projectionSource: selectNativeSurfaceWorkerProjectionSource(input.lastSurface),
    updatedAt: input.nowMs ?? performance.now(),
  });
}

export function buildNativeSurfaceWorkerMetrics(
  input: NativeSurfaceWorkerMetricsInput,
): NativeSurfaceEngineWorkerMetrics {
  const context = createNativeSurfaceWorkerMetricsContext(input);
  const metrics: Record<string, unknown> = {};
  for (const key of NATIVE_SURFACE_WORKER_METRIC_FIELD_ORDER) {
    metrics[key] = NATIVE_SURFACE_WORKER_METRIC_DESCRIPTOR_MAP[key].read(context);
  }
  return Object.freeze(metrics) as NativeSurfaceEngineWorkerMetrics;
}
