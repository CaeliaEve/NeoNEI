import type {
  NativeRenderBackendKind,
  NativeRenderRequest,
  NativeRenderResponse,
  NativeRendererFrameMetrics,
  NativeRendererLimits,
  NativeRenderSpriteCommand,
} from "../native-surface/NativeSurfaceRenderProtocol";
import { parseNativeLayoutCommandBuffer } from "../renderers/native/NativeRendererCommandProtocol.ts";
import type { NativeRendererBackend } from "../renderers/native/NativeRendererBackend.ts";
import { commitNativeRenderFrame } from "./nativeRenderFrameCommit.ts";
import {
  assertNativeRendererProbeSupported,
} from "../renderers/native/NativeRendererProbe.ts";
import { buildNativeRenderFrameMetrics } from "./nativeRenderFrameMetricsCatalog";
import {
  nativeRenderWorkerResourceFailed,
  probeRequestedNativeRenderWorker,
  requireNativeRenderWorkerResource,
  type NativeRenderWorkerResourceOperation,
} from "./nativeRenderWorkerPolicyCatalog";
import {
  getNativeRenderPipelineTransferables,
  isNativeRenderPipelineMessage,
  type NativeRenderPipelineFrameRequest,
  type NativeRenderPipelineMessage,
} from "../native-surface/NativeRenderPipelineProtocol";

let canvas: OffscreenCanvas | null = null;
let requestedBackend: "auto" | NativeRenderBackendKind | null = null;
let backend: NativeRenderBackendKind | null = null;
let backendSelectionFailureReason: string | null = null;
let animationEnabled = true;
let frames = 0;
let commandCount = 0;
let drawCalls = 0;
let vertexCount = 0;
let spriteDrawCalls = 0;
let spriteVertexCount = 0;
let normalizedSpriteCommands = 0;
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
let enginePort: MessagePort | null = null;
let engineSessionId: string | null = null;
let directFrameQueue: Promise<void> = Promise.resolve();

type TextureTile = {
  key: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

const virtualTextureTiles = new Map<string, TextureTile[]>();


function requireNativeRenderer(operation: NativeRenderWorkerResourceOperation): NativeRendererBackend {
  return requireNativeRenderWorkerResource(operation, {
    nativeRenderer,
    requestedBackend,
    backend,
  });
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
  const rendererDiagnostics = nativeRenderer?.diagnostics?.() ?? { contextLost: false, contextLostReason: null };
  return buildNativeRenderFrameMetrics({
    requestedBackend,
    backend,
    webgpuAvailable,
    backendSelectionFailureReason,
    hasCanvas: Boolean(canvas),
    frames,
    commandCount,
    drawCalls,
    vertexCount,
    spriteDrawCalls,
    spriteVertexCount,
    normalizedSpriteCommands,
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
    frameSamples,
    latestFrameToken,
    droppedStaleFrames,
    contextLost: rendererDiagnostics.contextLost,
    contextLostReason: rendererDiagnostics.contextLostReason,
    animationEnabled,
    width,
    height,
  });
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
  return normalized;
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

function postPipelineMessage(message: NativeRenderPipelineMessage): void {
  if (!enginePort || !engineSessionId || message.sessionId !== engineSessionId) {
    throw new Error("Native render engine port is not connected");
  }
  enginePort.postMessage(message, getNativeRenderPipelineTransferables(message));
}

function closeEnginePort(): void {
  enginePort?.close();
  enginePort = null;
  engineSessionId = null;
  directFrameQueue = Promise.resolve();
}

type NativeRenderPipelineFrameResult = Readonly<{
  response: NativeRenderResponse;
  status: "rendered" | "deferred";
  missingTextureKeys: string[];
}>;

async function renderPipelineFrame(
  message: NativeRenderPipelineFrameRequest,
): Promise<NativeRenderPipelineFrameResult> {
  const frameToken = Math.max(0, Math.floor(Number(message.frameToken) || 0));
  if (frameToken < latestFrameToken) {
    droppedStaleFrames += 1;
    return {
      response: { type: "frame", id: -frameToken, metrics: buildMetrics() },
      status: "deferred" as const,
      missingTextureKeys: [],
    };
  }
  latestFrameToken = frameToken;
  const startedAt = performance.now();
  commandCount = Math.max(0, Math.floor(message.commandCount || 0));
  const parseStartedAt = performance.now();
  const parsedCommands = parseNativeLayoutCommandBuffer(message.commandBuffer, message.commandStride, commandCount);
  lastParseMs = performance.now() - parseStartedAt;
  const normalizeStartedAt = performance.now();
  const normalizedCommands = normalizeSpriteCommands(message.spriteCommands ?? []);
  normalizedSpriteCommands = normalizedCommands.length;
  lastSpriteNormalizeMs = performance.now() - normalizeStartedAt;
  const renderer = requireNativeRenderer("render");
  const drawStartedAt = performance.now();
  const commit = commitNativeRenderFrame(
    renderer,
    width,
    height,
    parsedCommands,
    normalizedCommands,
    uploadedTextureKeys,
    splitSpriteCommandsForVirtualTiles,
  );
  if (commit.status === "deferred") {
    return {
      response: { type: "frame", id: -frameToken, metrics: buildMetrics() },
      status: commit.status,
      missingTextureKeys: commit.missingTextureKeys,
    };
  }
  const renderStats = commit.stats;
  lastDrawMs = performance.now() - drawStartedAt;
  drawCalls = renderStats.drawCalls;
  vertexCount = renderStats.vertexCount;
  spriteDrawCalls = renderStats.spriteDrawCalls;
  spriteVertexCount = renderStats.spriteVertexCount;
  void message.nowMs;
  frames += 1;
  lastFrameMs = performance.now() - startedAt;
  rememberFrameSample(lastFrameMs);
  return {
    response: { type: "frame", id: -frameToken, metrics: buildMetrics() },
    status: commit.status,
    missingTextureKeys: commit.missingTextureKeys,
  };
}

function installEnginePort(sessionId: string, port: MessagePort): void {
  closeEnginePort();
  enginePort = port;
  engineSessionId = sessionId;
  enginePort.onmessage = (event: MessageEvent<unknown>) => {
    if (!isNativeRenderPipelineMessage(event.data) || event.data.sessionId !== engineSessionId) {
      closeEnginePort();
      return;
    }
    const message = event.data;
    if (message.type === "pipelineHandshake") {
      postPipelineMessage({ type: "pipelineReady", sessionId });
      return;
    }
    if (message.type !== "renderFrame") return;
    directFrameQueue = directFrameQueue.then(async () => {
      try {
        const result = await renderPipelineFrame(message);
        self.postMessage(result.response);
        postPipelineMessage({
          type: "frameRendered",
          sessionId,
          frameToken: message.frameToken,
          status: result.status,
          missingTextureKeys: result.missingTextureKeys,
        });
      } catch (error) {
        const response: NativeRenderResponse = {
          type: "error",
          id: -message.frameToken,
          code: "NATIVE_RENDER_PIPELINE_FRAME_ERROR",
          message: error instanceof Error ? error.message : String(error),
          metrics: buildMetrics(),
        };
        self.postMessage(response);
        try {
          postPipelineMessage({
            type: "pipelineError",
            sessionId,
            frameToken: message.frameToken,
            code: response.code,
            message: response.message,
          });
        } finally {
          closeEnginePort();
        }
      }
    });
  };
  enginePort.onmessageerror = () => closeEnginePort();
  enginePort.start();
}

function canUploadWholeBitmap(bitmap: ImageBitmap): boolean {
  if (rendererMaxTextureSize <= 0) return true;
  return bitmap.width <= rendererMaxTextureSize && bitmap.height <= rendererMaxTextureSize;
}

function shouldTileBitmap(bitmap: ImageBitmap): boolean {
  return rendererMaxTextureSize > 0
    && bitmap.width <= rendererMaxTextureSize
    && bitmap.height > rendererMaxTextureSize;
}

async function uploadVirtualTextureTiles(
  renderer: NativeRendererBackend,
  key: string,
  bitmap: ImageBitmap,
): Promise<void> {
  if (rendererMaxTextureSize <= 0) {
    throw nativeRenderWorkerResourceFailed("loadTextures", "renderer max texture size is unavailable", { key });
  }
  if (bitmap.width > rendererMaxTextureSize) {
    throw nativeRenderWorkerResourceFailed("loadTextures", "texture width exceeds renderer max texture size", {
      key,
      width: bitmap.width,
      rendererMaxTextureSize,
    });
  }
  const tiles: TextureTile[] = [];
  for (let y = 0, tileIndex = 0; y < bitmap.height; y += rendererMaxTextureSize, tileIndex += 1) {
    const tileHeight = Math.min(rendererMaxTextureSize, bitmap.height - y);
    const tileKey = `${key}::tile:${tileIndex}`;
    const tileBitmap = await createImageBitmap(bitmap, 0, y, bitmap.width, tileHeight);
    try {
      if (!renderer.registerTexture(tileKey, tileBitmap)) {
        throw nativeRenderWorkerResourceFailed("loadTextures", "renderer rejected virtual texture tile", {
          key,
          tileKey,
          tileHeight,
        });
      }
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
  if (tiles.length <= 0) {
    throw nativeRenderWorkerResourceFailed("loadTextures", "virtual texture produced no tiles", { key });
  }
  virtualTextureTiles.set(key, tiles);
  uploadedTextureKeys.add(key);
  textureLoaded = renderer.textureCount();
}

async function uploadTexture(key: string, url: string): Promise<void> {
  const renderer = requireNativeRenderer("loadTextures");
  if (uploadedTextureKeys.has(key)) return;
  const bitmap = await loadTextureBitmap(url);
  try {
    if (canUploadWholeBitmap(bitmap)) {
      if (!renderer.registerTexture(key, bitmap)) {
        if (shouldTileBitmap(bitmap)) {
          await uploadVirtualTextureTiles(renderer, key, bitmap);
          return;
        }
        throw nativeRenderWorkerResourceFailed("loadTextures", "renderer rejected texture registration", {
          key,
          width: bitmap.width,
          height: bitmap.height,
        });
      }
      virtualTextureTiles.delete(key);
      uploadedTextureKeys.add(key);
      textureLoaded = renderer.textureCount();
    } else {
      await uploadVirtualTextureTiles(renderer, key, bitmap);
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
      if (uploadToken !== latestTextureUploadToken) return;
      try {
        await uploadTexture(texture.key, texture.url);
      } catch (error) {
        textureErrors += 1;
        throw error;
      }
    }));
  }
  lastTextureUploadMs = performance.now() - startedAt;
}

async function handleRequest(message: NativeRenderRequest): Promise<NativeRenderResponse> {
  switch (message.type) {
    case "connectEnginePort":
      installEnginePort(message.sessionId, message.port);
      return {
        type: "pipelineConnected",
        id: message.id,
        sessionId: message.sessionId,
        metrics: buildMetrics(),
      };
    case "disconnectEnginePort":
      if (!engineSessionId || engineSessionId !== message.sessionId) {
        throw new Error("Native render pipeline disconnect session mismatch");
      }
      closeEnginePort();
      return {
        type: "pipelineDisconnected",
        id: message.id,
        sessionId: message.sessionId,
        metrics: buildMetrics(),
      };
    case "initialize": {
      canvas = message.canvas;
      requestedBackend = message.renderer;
      backendSelectionFailureReason = null;
      width = canvas.width;
      height = canvas.height;
      nativeRenderer?.dispose();
      nativeRenderer = null;
      uploadedTextureKeys.clear();
      virtualTextureTiles.clear();
      textureLoaded = 0;
      try {
        const rendererProbe = await probeRequestedNativeRenderWorker(
          message.renderer,
          canvas,
        );
        nativeRenderer = assertNativeRendererProbeSupported(rendererProbe);
        backend = nativeRenderer.backend;
      } catch (error) {
        backend = null;
        backendSelectionFailureReason = error instanceof Error ? error.message : String(error);
        throw error;
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
    case "setAnimationEnabled":
      animationEnabled = Boolean(message.enabled);
      return { type: "metrics", id: message.id, metrics: buildMetrics() };
    case "metrics":
      return { type: "metrics", id: message.id, metrics: buildMetrics() };
    case "dispose":
      closeEnginePort();
      nativeRenderer?.dispose();
      nativeRenderer = null;
      uploadedTextureKeys.clear();
      virtualTextureTiles.clear();
      canvas = null;
      requestedBackend = null;
      backend = null;
      backendSelectionFailureReason = null;
      commandCount = 0;
      drawCalls = 0;
      vertexCount = 0;
      spriteDrawCalls = 0;
      spriteVertexCount = 0;
      normalizedSpriteCommands = 0;
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
