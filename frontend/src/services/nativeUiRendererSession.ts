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

export const NATIVE_UI_RENDERER_SESSION_POLICY = Object.freeze({
  id: "nativeUi.rendererSession",
  rendererProbePolicy: NATIVE_RENDERER_PROBE_POLICY.id,
  defaultBackend: NATIVE_RENDERER_PROBE_POLICY.defaultBrowserCanvasBackend,
  failurePolicy: "fail-closed",
} as const);

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

function defaultRendererProbe(canvas: NativeUiRendererCanvas): NativeRendererProbeResult {
  return WebGl2NativeRenderer.probe(canvas);
}

function defaultScheduler(): NativeUiAnimationScheduler {
  return {
    request(callback) {
      return requestAnimationFrame(callback);
    },
    cancel(id) {
      cancelAnimationFrame(id);
    },
  };
}

export function nativeUiRendererNowMs(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

export function normalizeNativeUiDpr(devicePixelRatio: unknown): number {
  const parsed = Number(devicePixelRatio);
  if (!Number.isFinite(parsed) || parsed <= 0) return 1;
  return Math.min(2, Math.max(1, parsed));
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

export class NativeUiRendererSession {
  private renderer: NativeRendererBackend | null = null;
  private animationFrameId: number | null = null;
  private animationScheduler: NativeUiAnimationScheduler | null = null;

  get activeRenderer(): NativeRendererBackend | null {
    return this.renderer;
  }

  ensureRenderer(
    canvas: NativeUiRendererCanvas,
    probe: NativeUiRendererProbe = defaultRendererProbe,
  ): NativeRendererBackend {
    if (!this.renderer) {
      this.renderer = assertNativeRendererProbeSupported(probe(canvas));
    }
    return this.renderer;
  }

  renderFrame(options: NativeUiRenderFrameOptions): boolean {
    const renderer = this.renderer;
    if (!renderer || !options.canvas) return false;
    const nowMs = options.nowMs ?? nativeUiRendererNowMs();
    renderer.render(options.canvas.width, options.canvas.height, [], options.spriteCommands(nowMs));
    return true;
  }

  scheduleAnimationLoop(options: NativeUiAnimationLoopOptions): void {
    this.stopAnimationLoop();
    if (!options.enabled) return;
    const scheduler = options.scheduler ?? defaultScheduler();
    this.animationScheduler = scheduler;
    const tick = (timestamp: number) => {
      options.renderAt(timestamp);
      this.animationFrameId = scheduler.request(tick);
    };
    this.animationFrameId = scheduler.request(tick);
  }

  stopAnimationLoop(): void {
    if (this.animationFrameId !== null) {
      this.animationScheduler?.cancel(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.animationScheduler = null;
  }

  dispose(): void {
    this.stopAnimationLoop();
    this.renderer?.dispose();
    this.renderer = null;
  }
}
