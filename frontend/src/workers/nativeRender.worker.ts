import type {
  NativeRenderBackendKind,
  NativeRenderRequest,
  NativeRenderResponse,
  NativeRendererFrameMetrics,
  NativeRendererLimits,
} from "../native-surface/NativeSurfaceRenderProtocol";

let canvas: OffscreenCanvas | null = null;
let backend: NativeRenderBackendKind | null = null;
let animationEnabled = true;
let frames = 0;
let commandCount = 0;
let lastFrameMs = 0;
let width = 0;
let height = 0;

function buildMetrics(): NativeRendererFrameMetrics {
  return {
    backend,
    initialized: Boolean(canvas && backend),
    frames,
    commandCount,
    lastFrameMs,
    animationEnabled,
    width,
    height,
    updatedAt: performance.now(),
  };
}

function detectWebglLimits(activeCanvas: OffscreenCanvas): NativeRendererLimits {
  const gl = activeCanvas.getContext("webgl2");
  if (!gl) {
    return { maxTextureSize: 0, maxTextureUnits: 0 };
  }
  return {
    maxTextureSize: Number(gl.getParameter(gl.MAX_TEXTURE_SIZE) ?? 0),
    maxTextureUnits: Number(gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS) ?? 0),
  };
}

function chooseBackend(requested: "auto" | "webgpu" | "webgl2", activeCanvas: OffscreenCanvas): NativeRenderBackendKind {
  if (requested === "webgl2") return "webgl2";
  if (requested === "webgpu" && "gpu" in navigator) return "webgpu";
  if (requested === "auto" && "gpu" in navigator) return "webgpu";
  void activeCanvas;
  return "webgl2";
}

async function handleRequest(message: NativeRenderRequest): Promise<NativeRenderResponse> {
  switch (message.type) {
    case "initialize": {
      canvas = message.canvas;
      width = canvas.width;
      height = canvas.height;
      backend = chooseBackend(message.renderer, canvas);
      const limits = detectWebglLimits(canvas);
      return { type: "ready", id: message.id, backend, limits, metrics: buildMetrics() };
    }
    case "resize":
      width = Math.max(0, Math.floor(message.viewport.width));
      height = Math.max(0, Math.floor(message.viewport.height));
      if (canvas) {
        canvas.width = width;
        canvas.height = height;
      }
      return { type: "metrics", id: message.id, metrics: buildMetrics() };
    case "render": {
      const startedAt = performance.now();
      commandCount = Math.max(0, Math.floor(message.commandCount || 0));
      // Scaffold phase: command buffer reaches the render worker and is measured
      // here. Actual WebGL2/WebGPU draw submission is the next migration step.
      void message.commandBuffer;
      void message.commandStride;
      void message.nowMs;
      frames += 1;
      lastFrameMs = performance.now() - startedAt;
      return { type: "frame", id: message.id, metrics: buildMetrics() };
    }
    case "setAnimationEnabled":
      animationEnabled = Boolean(message.enabled);
      return { type: "metrics", id: message.id, metrics: buildMetrics() };
    case "metrics":
      return { type: "metrics", id: message.id, metrics: buildMetrics() };
    case "dispose":
      canvas = null;
      backend = null;
      commandCount = 0;
      return { type: "disposed", id: message.id, metrics: buildMetrics() };
  }
}

self.onmessage = (event: MessageEvent<NativeRenderRequest>) => {
  const message = event.data;
  if (!message?.type) return;
  void handleRequest(message)
    .then((response) => self.postMessage(response))
    .catch((error) => {
      const response: NativeRenderResponse = {
        type: "error",
        id: message.id,
        code: "NATIVE_RENDER_WORKER_ERROR",
        message: error instanceof Error ? error.message : String(error),
        metrics: buildMetrics(),
      };
      self.postMessage(response);
    });
};
