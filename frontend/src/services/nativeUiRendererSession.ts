import type { NativeRendererBackend } from "../renderers/native/NativeRendererBackend.ts";
import {
  cancelNativeUiAnimationLoop,
  configureNativeUiCanvasSize,
  createNativeUiRenderer,
  NATIVE_UI_RENDERER_SESSION_POLICY,
  normalizeNativeUiDpr,
  renderNativeUiFrame,
  startNativeUiAnimationLoop,
  type NativeUiAnimationLoopOptions,
  type NativeUiAnimationScheduler,
  type NativeUiCanvasSizingResult,
  type NativeUiRenderFrameOptions,
  type NativeUiRendererCanvas,
  type NativeUiRendererProbe,
  type NativeUiSpriteCommandFactory,
  type NativeUiAnimationFrameCallback,
} from "./nativeUiRendererSessionCatalog.ts";

export {
  configureNativeUiCanvasSize,
  NATIVE_UI_RENDERER_SESSION_POLICY,
  nativeUiRendererNowMs,
  normalizeNativeUiDpr,
  type NativeUiAnimationFrameCallback,
  type NativeUiAnimationLoopOptions,
  type NativeUiAnimationScheduler,
  type NativeUiCanvasSizingResult,
  type NativeUiRenderFrameOptions,
  type NativeUiRendererCanvas,
  type NativeUiRendererProbe,
  type NativeUiSpriteCommandFactory,
} from "./nativeUiRendererSessionCatalog.ts";

export class NativeUiRendererSession {
  private renderer: NativeRendererBackend | null = null;
  private animationLoop: ReturnType<typeof startNativeUiAnimationLoop> = null;

  get activeRenderer(): NativeRendererBackend | null {
    return this.renderer;
  }

  ensureRenderer(
    canvas: NativeUiRendererCanvas,
    probe?: NativeUiRendererProbe,
  ): NativeRendererBackend {
    if (!this.renderer) {
      this.renderer = createNativeUiRenderer(canvas, probe);
    }
    return this.renderer;
  }

  renderFrame(options: NativeUiRenderFrameOptions): boolean {
    return renderNativeUiFrame(this.renderer, options);
  }

  scheduleAnimationLoop(options: NativeUiAnimationLoopOptions): void {
    this.stopAnimationLoop();
    this.animationLoop = startNativeUiAnimationLoop(options);
  }

  stopAnimationLoop(): void {
    cancelNativeUiAnimationLoop(this.animationLoop);
    this.animationLoop = null;
  }

  dispose(): void {
    this.stopAnimationLoop();
    this.renderer?.dispose();
    this.renderer = null;
  }
}
