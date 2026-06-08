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
let textureUploadBatches = 0;
let latestTextureUploadToken = 0;
let cancelledTextureUploads = 0;
let lastTextureUploadMs = 0;
let lastTextureReadyDelayMs = 0;
let textureUploadRequestedAt = 0;
let latestFrameToken = 0;
let droppedStaleFrames = 0;
let lastFrameMs = 0;
let lastParseMs = 0;
let lastSpriteNormalizeMs = 0;
let lastDrawMs = 0;
const FRAME_SAMPLE_LIMIT = 120;
const TEXTURE_UPLOAD_CONCURRENCY = 4;
const frameSamples: number[] = [];
let width = 0;
let height = 0;
let nativeRenderer: NativeRendererBackend | null = null;
const uploadedTextureKeys = new Set<string>();
let rendererMaxTextureSize = 0;

type TextureTile = {
  key: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

const virtualTextureTiles = new Map<string, TextureTile[]>();

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
  const rendererDiagnostics = nativeRenderer?.diagnostics?.() ?? { contextLost: false, contextLostReason: null };
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
    textureUploadConcurrency: TEXTURE_UPLOAD_CONCURRENCY,
    textureUploadBatches,
    latestTextureUploadToken,
    cancelledTextureUploads,
    lastTextureUploadMs,
    lastTextureReadyDelayMs,
    lastFrameMs,
    lastParseMs,
    lastSpriteNormalizeMs,
    lastDrawMs,
    frameAvgMs,
    frameP95Ms: percentile(frameSamples, 95),
    frameMaxMs: frameSamples.length > 0 ? Math.max(...frameSamples) : 0,
    latestFrameToken,
    droppedStaleFrames,
    contextLost: rendererDiagnostics.contextLost,
    contextLostReason: rendererDiagnostics.contextLostReason,
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
  const normalized = commands
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
  return splitSpriteCommandsForVirtualTiles(normalized);
}

function splitSpriteCommandsForVirtualTiles(commands: NativeRenderSpriteCommand[]): NativeRenderSpriteCommand[] {
  const result: NativeRenderSpriteCommand[] = [];
  for (const command of commands) {
    const tiles = virtualTextureTiles.get(command.textureKey);
    if (!tiles?.length) {
      result.push(command);
      continue;
    }
    const sourceTop = command.sourceY;
    const sourceBottom = command.sourceY + command.sourceHeight;
    for (const tile of tiles) {
      const overlapTop = Math.max(sourceTop, tile.y);
      const overlapBottom = Math.min(sourceBottom, tile.y + tile.height);
      if (overlapBottom <= overlapTop) continue;
      const sourceSliceHeight = overlapBottom - overlapTop;
      const destOffsetRatio = (overlapTop - sourceTop) / command.sourceHeight;
      const destHeightRatio = sourceSliceHeight / command.sourceHeight;
      result.push({
        ...command,
        textureKey: tile.key,
        sourceY: overlapTop - tile.y,
        sourceHeight: sourceSliceHeight,
        destY: command.destY + command.destHeight * destOffsetRatio,
        destHeight: command.destHeight * destHeightRatio,
      });
    }
  }
  return result;
}

function canUploadWholeBitmap(bitmap: ImageBitmap): boolean {
  if (rendererMaxTextureSize <= 0) return true;
  return bitmap.width <= rendererMaxTextureSize && bitmap.height <= rendererMaxTextureSize;
}

async function uploadVirtualTextureTiles(key: string, bitmap: ImageBitmap): Promise<boolean> {
  if (!nativeRenderer || rendererMaxTextureSize <= 0 || bitmap.width > rendererMaxTextureSize) return false;
  const tiles: TextureTile[] = [];
  for (let y = 0, tileIndex = 0; y < bitmap.height; y += rendererMaxTextureSize, tileIndex += 1) {
    const tileHeight = Math.min(rendererMaxTextureSize, bitmap.height - y);
    const tileKey = `${key}::tile:${tileIndex}`;
    const tileBitmap = await createImageBitmap(bitmap, 0, y, bitmap.width, tileHeight);
    try {
      if (!nativeRenderer.registerTexture(tileKey, tileBitmap)) return false;
      tiles.push({
        key: tileKey,
        x: 0,
        y,
        width: bitmap.width,
        height: tileHeight,
      });
    } finally {
      tileBitmap.close();
    }
  }
  if (tiles.length <= 0) return false;
  virtualTextureTiles.set(key, tiles);
  uploadedTextureKeys.add(key);
  textureLoaded = nativeRenderer.textureCount();
  return true;
}

async function uploadTexture(key: string, url: string): Promise<void> {
  if (!nativeRenderer || uploadedTextureKeys.has(key)) return;
  const bitmap = await loadTextureBitmap(url);
  try {
    if (canUploadWholeBitmap(bitmap) && nativeRenderer.registerTexture(key, bitmap)) {
      virtualTextureTiles.delete(key);
      uploadedTextureKeys.add(key);
      textureLoaded = nativeRenderer.textureCount();
    } else if (await uploadVirtualTextureTiles(key, bitmap)) {
      textureLoaded = nativeRenderer.textureCount();
    } else {
      textureErrors += 1;
    }
  } finally {
    bitmap.close();
  }
}

async function uploadTexturesInBatches(textures: Array<{ key: string; url: string }>, uploadToken: number): Promise<void> {
  const startedAt = performance.now();
  textureUploadBatches = 0;
  const pending = textures.filter((texture) => texture.key && !uploadedTextureKeys.has(texture.key));
  for (let offset = 0; offset < pending.length; offset += TEXTURE_UPLOAD_CONCURRENCY) {
    if (uploadToken !== latestTextureUploadToken) {
      cancelledTextureUploads += 1;
      break;
    }
    const batch = pending.slice(offset, offset + TEXTURE_UPLOAD_CONCURRENCY);
    textureUploadBatches += 1;
    await Promise.all(batch.map(async (texture) => {
      try {
        if (uploadToken !== latestTextureUploadToken) return;
        await uploadTexture(texture.key, texture.url);
      } catch {
        textureErrors += 1;
      }
    }));
  }
  lastTextureUploadMs = performance.now() - startedAt;
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
      virtualTextureTiles.clear();
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
      rendererMaxTextureSize = limits.maxTextureSize;
      return { type: "ready", id: message.id, backend, limits, metrics: buildMetrics() };
    }
    case "loadTextures": {
      const uploadToken = latestTextureUploadToken + 1;
      latestTextureUploadToken = uploadToken;
      textureUploadRequestedAt = performance.now();
      const uniqueTextures = Array.from(new Map(message.textures.map((texture) => [texture.key, texture])).values());
      await uploadTexturesInBatches(uniqueTextures, uploadToken);
      if (uploadToken === latestTextureUploadToken) {
        lastTextureReadyDelayMs = performance.now() - textureUploadRequestedAt;
      }
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
      const frameToken = Math.max(0, Math.floor(Number(message.frameToken) || 0));
      if (frameToken < latestFrameToken) {
        droppedStaleFrames += 1;
        return { type: "frame", id: message.id, metrics: buildMetrics() };
      }
      latestFrameToken = frameToken;
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
      virtualTextureTiles.clear();
      canvas = null;
      requestedBackend = null;
      backend = null;
      backendFallbackReason = null;
      commandCount = 0;
      drawCalls = 0;
      vertexCount = 0;
      textureErrors = 0;
      textureLoaded = 0;
      rendererMaxTextureSize = 0;
      textureUploadBatches = 0;
      latestTextureUploadToken = 0;
      cancelledTextureUploads = 0;
      lastTextureUploadMs = 0;
      lastTextureReadyDelayMs = 0;
      textureUploadRequestedAt = 0;
      latestFrameToken = 0;
      droppedStaleFrames = 0;
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
