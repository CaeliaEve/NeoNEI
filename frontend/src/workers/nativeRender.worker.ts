import type {
  NativeRenderBackendKind,
  NativeRenderRequest,
  NativeRenderResponse,
  NativeRendererFrameMetrics,
  NativeRendererLimits,
  NativeRenderSpriteCommand,
} from "../native-surface/NativeSurfaceRenderProtocol";
import {
  parseNativeLayoutCommandBuffer,
  WebGl2NativeRenderer,
} from "../renderers/native/WebGl2NativeRenderer";
import type { NativeRendererBackend } from "../renderers/native/NativeRendererBackend";
import { WebGpuNativeRenderer } from "../renderers/native/WebGpuNativeRenderer";

let canvas: OffscreenCanvas | null = null;
let requestedBackend: "auto" | NativeRenderBackendKind | null = null;
let backend: NativeRenderBackendKind | null = null;
let backendFallbackReason: string | null = null;
let animationEnabled = true;
let frames = 0;
let commandCount = 0;
let drawCalls = 0;
let vertexCount = 0;
let textureErrors = 0;
let textureLoaded = 0;
let lastFrameMs = 0;
let lastParseMs = 0;
let lastSpriteNormalizeMs = 0;
let lastDrawMs = 0;
const FRAME_SAMPLE_LIMIT = 120;
const frameSamples: number[] = [];
let width = 0;
let height = 0;
let nativeRenderer: NativeRendererBackend | null = null;
const uploadedTextureKeys = new Set<string>();

function percentile(values: number[], p: number): number {
  if (values.length <= 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index] ?? 0;
}

function rememberFrameSample(value: number): void {
  if (!Number.isFinite(value) || value < 0) return;
  frameSamples.push(value);
  if (frameSamples.length > FRAME_SAMPLE_LIMIT) {
    frameSamples.splice(0, frameSamples.length - FRAME_SAMPLE_LIMIT);
  }
}

function buildMetrics(): NativeRendererFrameMetrics {
  const webgpuAvailable = Boolean((navigator as Navigator & { gpu?: unknown }).gpu);
  const adapterUnavailable = Boolean(backendFallbackReason?.includes("adapter/device/context unavailable"));
  const frameAvgMs = frameSamples.length > 0
    ? frameSamples.reduce((sum, value) => sum + value, 0) / frameSamples.length
    : 0;
  return {
    requestedBackend,
    backend,
    webgpuAvailable,
    webgpuUsable: backend === "webgpu" || (webgpuAvailable && !adapterUnavailable),
    backendFallbackReason,
    initialized: Boolean(canvas && backend),
    frames,
    commandCount,
    drawCalls,
    vertexCount,
    textureCount: nativeRenderer?.textureCount() ?? textureLoaded,
    textureLoaded,
    textureErrors,
    lastFrameMs,
    lastParseMs,
    lastSpriteNormalizeMs,
    lastDrawMs,
    frameAvgMs,
    frameP95Ms: percentile(frameSamples, 95),
    frameMaxMs: frameSamples.length > 0 ? Math.max(...frameSamples) : 0,
    animationEnabled,
    width,
    height,
    updatedAt: performance.now(),
  };
}

async function loadTextureBitmap(url: string): Promise<ImageBitmap> {
  const response = await fetch(url, { cache: "force-cache" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const blob = await response.blob();
  return await createImageBitmap(blob, { premultiplyAlpha: "premultiply" });
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
  void activeCanvas;
  return "gpu" in navigator ? "webgpu" : "webgl2";
}

function normalizeSpriteCommands(commands: NativeRenderSpriteCommand[]) {
  return commands
    .map((command) => ({
      textureKey: `${command.textureKey ?? ""}`,
      sourceX: Math.max(0, Math.floor(Number(command.sourceX) || 0)),
      sourceY: Math.max(0, Math.floor(Number(command.sourceY) || 0)),
      sourceWidth: Math.max(0, Math.floor(Number(command.sourceWidth) || 0)),
      sourceHeight: Math.max(0, Math.floor(Number(command.sourceHeight) || 0)),
      destX: Math.floor(Number(command.destX) || 0),
      destY: Math.floor(Number(command.destY) || 0),
      destWidth: Math.max(0, Math.floor(Number(command.destWidth) || 0)),
      destHeight: Math.max(0, Math.floor(Number(command.destHeight) || 0)),
    }))
    .filter((command) =>
      command.textureKey
      && command.sourceWidth > 0
      && command.sourceHeight > 0
      && command.destWidth > 0
      && command.destHeight > 0
    );
}

async function uploadTexture(key: string, url: string): Promise<void> {
  if (!nativeRenderer || uploadedTextureKeys.has(key)) return;
  const bitmap = await loadTextureBitmap(url);
  try {
    if (nativeRenderer.registerTexture(key, bitmap)) {
      uploadedTextureKeys.add(key);
      textureLoaded = nativeRenderer.textureCount();
    } else {
      textureErrors += 1;
    }
  } finally {
    bitmap.close();
  }
}

async function handleRequest(message: NativeRenderRequest): Promise<NativeRenderResponse> {
  switch (message.type) {
    case "initialize": {
      canvas = message.canvas;
      requestedBackend = message.renderer;
      backendFallbackReason = null;
      width = canvas.width;
      height = canvas.height;
      backend = chooseBackend(message.renderer, canvas);
      nativeRenderer?.dispose();
      uploadedTextureKeys.clear();
      textureLoaded = 0;
      nativeRenderer = backend === "webgpu"
        ? await WebGpuNativeRenderer.create(canvas)
        : WebGl2NativeRenderer.create(canvas);
      if (!nativeRenderer && backend === "webgpu") {
        backendFallbackReason = WebGpuNativeRenderer.lastInitializationError
          ? `webgpu renderer initialization failed: ${WebGpuNativeRenderer.lastInitializationError}`
          : "webgpu renderer initialization failed";
        backend = "webgl2";
        nativeRenderer = WebGl2NativeRenderer.create(canvas);
      } else if (message.renderer === "webgpu" && backend !== "webgpu") {
        backendFallbackReason = "webgpu unavailable in render worker";
      }
      const limits = backend === "webgpu" ? { maxTextureSize: 0, maxTextureUnits: 0 } : detectWebglLimits(canvas);
      return { type: "ready", id: message.id, backend, limits, metrics: buildMetrics() };
    }
    case "loadTextures": {
      const uniqueTextures = Array.from(new Map(message.textures.map((texture) => [texture.key, texture])).values());
      await Promise.all(uniqueTextures.map(async (texture) => {
        try {
          await uploadTexture(texture.key, texture.url);
        } catch {
          textureErrors += 1;
        }
      }));
      return {
        type: "textureLoaded",
        id: message.id,
        loaded: textureLoaded,
        total: uniqueTextures.length,
        metrics: buildMetrics(),
      };
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
      const parseStartedAt = performance.now();
      const parsedCommands = parseNativeLayoutCommandBuffer(message.commandBuffer, message.commandStride, commandCount);
      lastParseMs = performance.now() - parseStartedAt;
      const normalizeStartedAt = performance.now();
      const normalizedSpriteCommands = normalizeSpriteCommands(message.spriteCommands ?? []);
      lastSpriteNormalizeMs = performance.now() - normalizeStartedAt;
      const drawStartedAt = performance.now();
      const renderStats = nativeRenderer?.render(
        width,
        height,
        parsedCommands,
        normalizedSpriteCommands,
      ) ?? { drawCalls: 0, vertexCount: 0, spriteDrawCalls: 0, spriteVertexCount: 0 };
      lastDrawMs = performance.now() - drawStartedAt;
      drawCalls = renderStats.drawCalls;
      vertexCount = renderStats.vertexCount;
      void message.nowMs;
      frames += 1;
      lastFrameMs = performance.now() - startedAt;
      rememberFrameSample(lastFrameMs);
      return { type: "frame", id: message.id, metrics: buildMetrics() };
    }
    case "setAnimationEnabled":
      animationEnabled = Boolean(message.enabled);
      return { type: "metrics", id: message.id, metrics: buildMetrics() };
    case "metrics":
      return { type: "metrics", id: message.id, metrics: buildMetrics() };
    case "dispose":
      nativeRenderer?.dispose();
      nativeRenderer = null;
      uploadedTextureKeys.clear();
      canvas = null;
      requestedBackend = null;
      backend = null;
      backendFallbackReason = null;
      commandCount = 0;
      drawCalls = 0;
      vertexCount = 0;
      textureErrors = 0;
      textureLoaded = 0;
      lastFrameMs = 0;
      lastParseMs = 0;
      lastSpriteNormalizeMs = 0;
      lastDrawMs = 0;
      frameSamples.length = 0;
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
