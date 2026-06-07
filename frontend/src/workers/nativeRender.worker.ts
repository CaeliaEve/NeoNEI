import type {
  NativeRenderBackendKind,
  NativeRenderRequest,
  NativeRenderResponse,
  NativeRendererFrameMetrics,
  NativeRendererLimits,
} from "../native-surface/NativeSurfaceRenderProtocol";
import {
  parseNativeLayoutCommandBuffer,
  WebGl2NativeRenderer,
} from "../renderers/native/WebGl2NativeRenderer";

let canvas: OffscreenCanvas | null = null;
let backend: NativeRenderBackendKind | null = null;
let animationEnabled = true;
let frames = 0;
let commandCount = 0;
let drawCalls = 0;
let vertexCount = 0;
let lastFrameMs = 0;
let width = 0;
let height = 0;
let webglRenderer: WebGl2NativeRenderer | null = null;

function buildMetrics(): NativeRendererFrameMetrics {
  return {
    backend,
    initialized: Boolean(canvas && backend),
    frames,
    commandCount,
    drawCalls,
    vertexCount,
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
      webglRenderer?.dispose();
      webglRenderer = backend === "webgl2" ? WebGl2NativeRenderer.create(canvas) : null;
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
      const parsedCommands = parseNativeLayoutCommandBuffer(message.commandBuffer, message.commandStride, commandCount);
      const renderStats = webglRenderer?.render(width, height, parsedCommands) ?? { drawCalls: 0, vertexCount: 0 };
      drawCalls = renderStats.drawCalls;
      vertexCount = renderStats.vertexCount;
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
      webglRenderer?.dispose();
      webglRenderer = null;
      canvas = null;
      backend = null;
      commandCount = 0;
      drawCalls = 0;
      vertexCount = 0;
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
