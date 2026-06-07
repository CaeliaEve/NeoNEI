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
let backend: NativeRenderBackendKind | null = null;
let animationEnabled = true;
let frames = 0;
let commandCount = 0;
let drawCalls = 0;
let vertexCount = 0;
let textureErrors = 0;
let textureLoaded = 0;
let lastFrameMs = 0;
let width = 0;
let height = 0;
let nativeRenderer: NativeRendererBackend | null = null;
const uploadedTextureKeys = new Set<string>();

function buildMetrics(): NativeRendererFrameMetrics {
  return {
    backend,
    initialized: Boolean(canvas && backend),
    frames,
    commandCount,
    drawCalls,
    vertexCount,
    textureCount: nativeRenderer?.textureCount() ?? textureLoaded,
    textureLoaded,
    textureErrors,
    lastFrameMs,
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
  if (requested === "webgpu" && "gpu" in navigator) return "webgpu";
  // Keep auto on the completed compatible pipeline until WebGPU sprite
  // rendering is feature-complete. Explicit webgpu remains available for the
  // staged backend handshake.
  void activeCanvas;
  return "webgl2";
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
        backend = "webgl2";
        nativeRenderer = WebGl2NativeRenderer.create(canvas);
      }
      const limits = detectWebglLimits(canvas);
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
      const parsedCommands = parseNativeLayoutCommandBuffer(message.commandBuffer, message.commandStride, commandCount);
      const renderStats = nativeRenderer?.render(
        width,
        height,
        parsedCommands,
        normalizeSpriteCommands(message.spriteCommands ?? []),
      ) ?? { drawCalls: 0, vertexCount: 0, spriteDrawCalls: 0, spriteVertexCount: 0 };
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
      nativeRenderer?.dispose();
      nativeRenderer = null;
      uploadedTextureKeys.clear();
      canvas = null;
      backend = null;
      commandCount = 0;
      drawCalls = 0;
      vertexCount = 0;
      textureErrors = 0;
      textureLoaded = 0;
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
