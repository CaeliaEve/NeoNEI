import type { NativeRendererFrameMetrics } from "../native-surface/NativeSurfaceRenderProtocol";

export type NativeRenderFrameMetricsInput = Readonly<{
  requestedBackend: NativeRendererFrameMetrics["requestedBackend"];
  backend: NativeRendererFrameMetrics["backend"];
  webgpuAvailable: boolean;
  backendSelectionFailureReason: string | null;
  hasCanvas: boolean;
  frames: number;
  commandCount: number;
  drawCalls: number;
  vertexCount: number;
  spriteDrawCalls: number;
  spriteVertexCount: number;
  normalizedSpriteCommands: number;
  textureCount: number;
  textureLoaded: number;
  textureErrors: number;
  textureUploadConcurrency: number;
  textureUploadBatches: number;
  latestTextureUploadToken: number;
  cancelledTextureUploads: number;
  lastTextureUploadMs: number;
  lastTextureReadyDelayMs: number;
  lastFrameMs: number;
  lastParseMs: number;
  lastSpriteNormalizeMs: number;
  lastDrawMs: number;
  frameSamples: readonly number[];
  latestFrameToken: number;
  droppedStaleFrames: number;
  contextLost: boolean;
  contextLostReason: string | null;
  animationEnabled: boolean;
  width: number;
  height: number;
  nowMs?: number;
}>;

export type NativeRenderFrameMetricKey = keyof NativeRendererFrameMetrics;

type NativeRenderFrameMetricsContext = NativeRenderFrameMetricsInput & Readonly<{
  adapterUnavailable: boolean;
  frameAvgMs: number;
  frameP95Ms: number;
  frameMaxMs: number;
  updatedAt: number;
}>;

type NativeRenderFrameMetricDomain =
  | "backend"
  | "lifecycle"
  | "layout"
  | "sprites"
  | "textures"
  | "frame-timing"
  | "gpu-diagnostics"
  | "viewport"
  | "clock";

export type NativeRenderFrameMetricDescriptor<
  Key extends NativeRenderFrameMetricKey = NativeRenderFrameMetricKey,
> = Readonly<{
  key: Key;
  domain: NativeRenderFrameMetricDomain;
  source: string;
  read: (context: NativeRenderFrameMetricsContext) => NativeRendererFrameMetrics[Key];
}>;

type NativeRenderFrameMetricDescriptorMap = {
  readonly [Key in NativeRenderFrameMetricKey]: NativeRenderFrameMetricDescriptor<Key>;
};

function percentile(values: readonly number[], p: number): number {
  if (values.length <= 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index] ?? 0;
}

function frameAverage(values: readonly number[]): number {
  return values.length > 0
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
}

function frameMaximum(values: readonly number[]): number {
  return values.length > 0 ? Math.max(...values) : 0;
}

function defineNativeRenderFrameMetric<Key extends NativeRenderFrameMetricKey>(
  descriptor: NativeRenderFrameMetricDescriptor<Key>,
): NativeRenderFrameMetricDescriptor<Key> {
  return Object.freeze(descriptor);
}

function validateNativeRenderFrameMetricDescriptorMap(
  descriptors: NativeRenderFrameMetricDescriptorMap,
): NativeRenderFrameMetricDescriptorMap {
  const seen = new Set<string>();
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (!descriptor || descriptor.key !== key) {
      throw new Error(`Native render frame metric descriptor key mismatch: ${key}`);
    }
    if (seen.has(descriptor.key)) {
      throw new Error(`Duplicate native render frame metric descriptor: ${descriptor.key}`);
    }
    seen.add(descriptor.key);
    if (!descriptor.domain || !descriptor.source) {
      throw new Error(`Native render frame metric descriptor is incomplete: ${descriptor.key}`);
    }
  }
  return Object.freeze(descriptors);
}

export const NATIVE_RENDER_FRAME_METRIC_DESCRIPTOR_MAP =
  validateNativeRenderFrameMetricDescriptorMap({
    requestedBackend: defineNativeRenderFrameMetric({
      key: "requestedBackend",
      domain: "backend",
      source: "worker.requestedBackend",
      read: (context) => context.requestedBackend,
    }),
    backend: defineNativeRenderFrameMetric({
      key: "backend",
      domain: "backend",
      source: "worker.backend",
      read: (context) => context.backend,
    }),
    webgpuAvailable: defineNativeRenderFrameMetric({
      key: "webgpuAvailable",
      domain: "backend",
      source: "navigator.gpu",
      read: (context) => context.webgpuAvailable,
    }),
    webgpuUsable: defineNativeRenderFrameMetric({
      key: "webgpuUsable",
      domain: "backend",
      source: "backend|navigator.gpu|backendSelectionFailureReason",
      read: (context) => context.backend === "webgpu" || (context.webgpuAvailable && !context.adapterUnavailable),
    }),
    backendSelectionFailureReason: defineNativeRenderFrameMetric({
      key: "backendSelectionFailureReason",
      domain: "backend",
      source: "worker.backendSelectionFailureReason",
      read: (context) => context.backendSelectionFailureReason,
    }),
    initialized: defineNativeRenderFrameMetric({
      key: "initialized",
      domain: "lifecycle",
      source: "worker.canvas|backend",
      read: (context) => Boolean(context.hasCanvas && context.backend),
    }),
    frames: defineNativeRenderFrameMetric({
      key: "frames",
      domain: "lifecycle",
      source: "worker.frames",
      read: (context) => context.frames,
    }),
    commandCount: defineNativeRenderFrameMetric({
      key: "commandCount",
      domain: "layout",
      source: "worker.commandCount",
      read: (context) => context.commandCount,
    }),
    drawCalls: defineNativeRenderFrameMetric({
      key: "drawCalls",
      domain: "layout",
      source: "rendererStats.drawCalls",
      read: (context) => context.drawCalls,
    }),
    vertexCount: defineNativeRenderFrameMetric({
      key: "vertexCount",
      domain: "layout",
      source: "rendererStats.vertexCount",
      read: (context) => context.vertexCount,
    }),
    spriteDrawCalls: defineNativeRenderFrameMetric({
      key: "spriteDrawCalls",
      domain: "sprites",
      source: "rendererStats.spriteDrawCalls",
      read: (context) => context.spriteDrawCalls,
    }),
    spriteVertexCount: defineNativeRenderFrameMetric({
      key: "spriteVertexCount",
      domain: "sprites",
      source: "rendererStats.spriteVertexCount",
      read: (context) => context.spriteVertexCount,
    }),
    normalizedSpriteCommands: defineNativeRenderFrameMetric({
      key: "normalizedSpriteCommands",
      domain: "sprites",
      source: "worker.normalizedSpriteCommands",
      read: (context) => context.normalizedSpriteCommands,
    }),
    textureCount: defineNativeRenderFrameMetric({
      key: "textureCount",
      domain: "textures",
      source: "renderer.textureCount|worker.textureLoaded",
      read: (context) => context.textureCount,
    }),
    textureLoaded: defineNativeRenderFrameMetric({
      key: "textureLoaded",
      domain: "textures",
      source: "worker.textureLoaded",
      read: (context) => context.textureLoaded,
    }),
    textureErrors: defineNativeRenderFrameMetric({
      key: "textureErrors",
      domain: "textures",
      source: "worker.textureErrors",
      read: (context) => context.textureErrors,
    }),
    textureUploadConcurrency: defineNativeRenderFrameMetric({
      key: "textureUploadConcurrency",
      domain: "textures",
      source: "worker.TEXTURE_UPLOAD_CONCURRENCY",
      read: (context) => context.textureUploadConcurrency,
    }),
    textureUploadBatches: defineNativeRenderFrameMetric({
      key: "textureUploadBatches",
      domain: "textures",
      source: "worker.textureUploadBatches",
      read: (context) => context.textureUploadBatches,
    }),
    latestTextureUploadToken: defineNativeRenderFrameMetric({
      key: "latestTextureUploadToken",
      domain: "textures",
      source: "worker.latestTextureUploadToken",
      read: (context) => context.latestTextureUploadToken,
    }),
    cancelledTextureUploads: defineNativeRenderFrameMetric({
      key: "cancelledTextureUploads",
      domain: "textures",
      source: "worker.cancelledTextureUploads",
      read: (context) => context.cancelledTextureUploads,
    }),
    lastTextureUploadMs: defineNativeRenderFrameMetric({
      key: "lastTextureUploadMs",
      domain: "textures",
      source: "worker.lastTextureUploadMs",
      read: (context) => context.lastTextureUploadMs,
    }),
    lastTextureReadyDelayMs: defineNativeRenderFrameMetric({
      key: "lastTextureReadyDelayMs",
      domain: "textures",
      source: "worker.lastTextureReadyDelayMs",
      read: (context) => context.lastTextureReadyDelayMs,
    }),
    lastFrameMs: defineNativeRenderFrameMetric({
      key: "lastFrameMs",
      domain: "frame-timing",
      source: "worker.lastFrameMs",
      read: (context) => context.lastFrameMs,
    }),
    lastParseMs: defineNativeRenderFrameMetric({
      key: "lastParseMs",
      domain: "frame-timing",
      source: "worker.lastParseMs",
      read: (context) => context.lastParseMs,
    }),
    lastSpriteNormalizeMs: defineNativeRenderFrameMetric({
      key: "lastSpriteNormalizeMs",
      domain: "frame-timing",
      source: "worker.lastSpriteNormalizeMs",
      read: (context) => context.lastSpriteNormalizeMs,
    }),
    lastDrawMs: defineNativeRenderFrameMetric({
      key: "lastDrawMs",
      domain: "frame-timing",
      source: "worker.lastDrawMs",
      read: (context) => context.lastDrawMs,
    }),
    frameAvgMs: defineNativeRenderFrameMetric({
      key: "frameAvgMs",
      domain: "frame-timing",
      source: "worker.frameSamples.avg",
      read: (context) => context.frameAvgMs,
    }),
    frameP95Ms: defineNativeRenderFrameMetric({
      key: "frameP95Ms",
      domain: "frame-timing",
      source: "worker.frameSamples.p95",
      read: (context) => context.frameP95Ms,
    }),
    frameMaxMs: defineNativeRenderFrameMetric({
      key: "frameMaxMs",
      domain: "frame-timing",
      source: "worker.frameSamples.max",
      read: (context) => context.frameMaxMs,
    }),
    latestFrameToken: defineNativeRenderFrameMetric({
      key: "latestFrameToken",
      domain: "frame-timing",
      source: "worker.latestFrameToken",
      read: (context) => context.latestFrameToken,
    }),
    droppedStaleFrames: defineNativeRenderFrameMetric({
      key: "droppedStaleFrames",
      domain: "frame-timing",
      source: "worker.droppedStaleFrames",
      read: (context) => context.droppedStaleFrames,
    }),
    contextLost: defineNativeRenderFrameMetric({
      key: "contextLost",
      domain: "gpu-diagnostics",
      source: "renderer.diagnostics.contextLost",
      read: (context) => context.contextLost,
    }),
    contextLostReason: defineNativeRenderFrameMetric({
      key: "contextLostReason",
      domain: "gpu-diagnostics",
      source: "renderer.diagnostics.contextLostReason",
      read: (context) => context.contextLostReason,
    }),
    animationEnabled: defineNativeRenderFrameMetric({
      key: "animationEnabled",
      domain: "lifecycle",
      source: "worker.animationEnabled",
      read: (context) => context.animationEnabled,
    }),
    width: defineNativeRenderFrameMetric({
      key: "width",
      domain: "viewport",
      source: "worker.width",
      read: (context) => context.width,
    }),
    height: defineNativeRenderFrameMetric({
      key: "height",
      domain: "viewport",
      source: "worker.height",
      read: (context) => context.height,
    }),
    updatedAt: defineNativeRenderFrameMetric({
      key: "updatedAt",
      domain: "clock",
      source: "performance.now",
      read: (context) => context.updatedAt,
    }),
  });

export const NATIVE_RENDER_FRAME_METRIC_FIELD_ORDER = Object.freeze(
  Object.keys(NATIVE_RENDER_FRAME_METRIC_DESCRIPTOR_MAP),
) as readonly NativeRenderFrameMetricKey[];

export const NATIVE_RENDER_FRAME_METRICS_CATALOG = Object.freeze({
  id: "nativeRender.frameMetricsCatalog",
  owner: "native-render-worker",
  schema: "neonei/native-render-frame-metrics/current",
  descriptorCount: NATIVE_RENDER_FRAME_METRIC_FIELD_ORDER.length,
  descriptorMap: NATIVE_RENDER_FRAME_METRIC_DESCRIPTOR_MAP,
  buildPolicy: "descriptor-table-frame-metrics-projection",
  failurePolicy: "fail-closed-render-metric-abi",
} as const);

function createNativeRenderFrameMetricsContext(
  input: NativeRenderFrameMetricsInput,
): NativeRenderFrameMetricsContext {
  const frameSamples = Object.freeze(Array.from(input.frameSamples));
  return Object.freeze({
    ...input,
    frameSamples,
    adapterUnavailable: Boolean(input.backendSelectionFailureReason?.includes("adapter/device/context unavailable")),
    frameAvgMs: frameAverage(frameSamples),
    frameP95Ms: percentile(frameSamples, 95),
    frameMaxMs: frameMaximum(frameSamples),
    updatedAt: input.nowMs ?? performance.now(),
  });
}

export function buildNativeRenderFrameMetrics(
  input: NativeRenderFrameMetricsInput,
): NativeRendererFrameMetrics {
  const context = createNativeRenderFrameMetricsContext(input);
  const metrics: Record<string, unknown> = {};
  for (const key of NATIVE_RENDER_FRAME_METRIC_FIELD_ORDER) {
    metrics[key] = NATIVE_RENDER_FRAME_METRIC_DESCRIPTOR_MAP[key].read(context);
  }
  return Object.freeze(metrics) as NativeRendererFrameMetrics;
}
