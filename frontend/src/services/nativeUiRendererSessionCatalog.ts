import type { NativeRendererBackend } from "../renderers/native/NativeRendererBackend.ts";
import {
  assertNativeRendererProbeSupported,
  NATIVE_RENDERER_PROBE_POLICY,
  type NativeRendererProbeResult,
} from "../renderers/native/NativeRendererProbe.ts";
import {
  WebGl2NativeRenderer,
  type NativeTextureSpriteCommand,
} from "../renderers/native/WebGl2NativeRenderer.ts";

export type NativeUiRendererCanvas = HTMLCanvasElement | OffscreenCanvas;
export type NativeUiRendererProbe = (canvas: NativeUiRendererCanvas) => NativeRendererProbeResult;
export type NativeUiSpriteCommandFactory = (nowMs: number) => NativeTextureSpriteCommand[];
export type NativeUiAnimationFrameCallback = (timestamp: number) => void;

export interface NativeUiAnimationScheduler {
  request(callback: NativeUiAnimationFrameCallback): number;
  cancel(id: number): void;
}

export interface NativeUiCanvasSizingResult {
  dpr: number;
  width: number;
  height: number;
}

export interface NativeUiAnimationLoopOptions {
  enabled: boolean;
  renderAt: NativeUiAnimationFrameCallback;
  scheduler?: NativeUiAnimationScheduler;
}

export interface NativeUiRenderFrameOptions {
  canvas: NativeUiRendererCanvas | null;
  spriteCommands: NativeUiSpriteCommandFactory;
  nowMs?: number;
}

type NativeUiRendererBackendDescriptor = Readonly<{
  backend: NativeRendererBackend["backend"];
  defaultForBrowserCanvas: boolean;
  probe: NativeUiRendererProbe;
}>;

type NativeUiCanvasDprPolicy = Readonly<{
  min: number;
  max: number;
  fallback: number;
}>;

type NativeUiAnimationLoopHandle = Readonly<{
  scheduler: NativeUiAnimationScheduler;
  frameId: number | null;
}>;

export const NATIVE_UI_RENDERER_SESSION_CATALOG_ABI = Object.freeze({
  schema: "neonei/native-ui-renderer-session-catalog/current",
  buildPolicy: "descriptor-table-renderer-session-projection",
  failurePolicy: "fail-closed-native-ui-renderer-session",
  snapshotPolicy: "rcu-immutable-renderer-session-snapshot",
} as const);

export const NATIVE_UI_RENDERER_SESSION_POLICY = Object.freeze({
  id: "nativeUi.rendererSession",
  rendererProbePolicy: NATIVE_RENDERER_PROBE_POLICY.id,
  defaultBackend: NATIVE_RENDERER_PROBE_POLICY.defaultBrowserCanvasBackend,
  failurePolicy: "fail-closed",
} as const);

export const NATIVE_UI_CANVAS_DPR_POLICY: NativeUiCanvasDprPolicy = Object.freeze({
  min: 1,
  max: 2,
  fallback: 1,
} as const);

function defineNativeUiRendererBackend<const Descriptor extends NativeUiRendererBackendDescriptor>(
  descriptor: Descriptor,
): Descriptor {
  return Object.freeze({ ...descriptor }) as Descriptor;
}

function validateRendererBackendDescriptors<const Descriptors extends readonly NativeUiRendererBackendDescriptor[]>(
  descriptors: Descriptors,
): Descriptors {
  if (descriptors.length === 0) {
    throw new Error("native UI renderer backend catalog must not be empty");
  }
  const backends = new Set<string>();
  let defaults = 0;
  for (const descriptor of descriptors) {
    if (!descriptor.backend) {
      throw new Error("native UI renderer backend descriptor must declare backend");
    }
    if (backends.has(descriptor.backend)) {
      throw new Error(`duplicate native UI renderer backend: ${descriptor.backend}`);
    }
    backends.add(descriptor.backend);
    if (descriptor.defaultForBrowserCanvas) defaults += 1;
  }
  if (defaults !== 1) {
    throw new Error("native UI renderer backend catalog must declare exactly one browser-canvas default");
  }
  return Object.freeze([...descriptors]) as unknown as Descriptors;
}

export const NATIVE_UI_RENDERER_BACKEND_DESCRIPTOR_LIST = validateRendererBackendDescriptors([
  defineNativeUiRendererBackend({
    backend: "webgl2",
    defaultForBrowserCanvas: true,
    probe: (canvas) => WebGl2NativeRenderer.probe(canvas),
  }),
] as const);

export function defaultNativeUiRendererProbe(canvas: NativeUiRendererCanvas): NativeRendererProbeResult {
  const descriptor = NATIVE_UI_RENDERER_BACKEND_DESCRIPTOR_LIST.find((entry) => entry.defaultForBrowserCanvas);
  if (!descriptor) {
    throw new Error("native UI renderer backend catalog default descriptor is missing");
  }
  return descriptor.probe(canvas);
}

export function createNativeUiRenderer(
  canvas: NativeUiRendererCanvas,
  probe: NativeUiRendererProbe = defaultNativeUiRendererProbe,
): NativeRendererBackend {
  return assertNativeRendererProbeSupported(probe(canvas));
}

export function createNativeUiAnimationScheduler(): NativeUiAnimationScheduler {
  return {
    request(callback) {
      return requestAnimationFrame(callback);
    },
    cancel(id) {
      cancelAnimationFrame(id);
    },
  };
}

export function startNativeUiAnimationLoop(
  options: NativeUiAnimationLoopOptions,
): NativeUiAnimationLoopHandle | null {
  if (!options.enabled) return null;
  const scheduler = options.scheduler ?? createNativeUiAnimationScheduler();
  const tick = (timestamp: number) => {
    options.renderAt(timestamp);
    frameId = scheduler.request(tick);
  };
  let frameId = scheduler.request(tick);
  return Object.freeze({
    scheduler,
    get frameId() {
      return frameId;
    },
  }) as NativeUiAnimationLoopHandle;
}

export function cancelNativeUiAnimationLoop(handle: NativeUiAnimationLoopHandle | null): void {
  if (handle?.frameId !== null && handle?.frameId !== undefined) {
    handle.scheduler.cancel(handle.frameId);
  }
}

export function nativeUiRendererNowMs(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

export function normalizeNativeUiDpr(devicePixelRatio: unknown): number {
  const parsed = Number(devicePixelRatio);
  if (!Number.isFinite(parsed) || parsed <= 0) return NATIVE_UI_CANVAS_DPR_POLICY.fallback;
  return Math.min(NATIVE_UI_CANVAS_DPR_POLICY.max, Math.max(NATIVE_UI_CANVAS_DPR_POLICY.min, parsed));
}

export function configureNativeUiCanvasSize(
  canvas: NativeUiRendererCanvas,
  logicalWidth: number,
  logicalHeight: number,
  devicePixelRatio: unknown,
): NativeUiCanvasSizingResult {
  const dpr = normalizeNativeUiDpr(devicePixelRatio);
  const width = Math.max(1, Math.round(Math.max(1, logicalWidth) * dpr));
  const height = Math.max(1, Math.round(Math.max(1, logicalHeight) * dpr));
  canvas.width = width;
  canvas.height = height;
  return { dpr, width, height };
}

export function renderNativeUiFrame(
  renderer: NativeRendererBackend | null,
  options: NativeUiRenderFrameOptions,
): boolean {
  if (!renderer || !options.canvas) return false;
  const nowMs = options.nowMs ?? nativeUiRendererNowMs();
  renderer.render(options.canvas.width, options.canvas.height, [], options.spriteCommands(nowMs));
  return true;
}
