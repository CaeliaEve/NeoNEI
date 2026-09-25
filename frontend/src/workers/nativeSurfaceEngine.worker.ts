import type {
  NativeSurfaceEngineRequest,
  NativeSurfaceEngineResponse,
  NativeSurfaceEngineEntry,
  NativeSurfaceEngineWorkerMetrics,
} from "../native-surface/NativeSurfaceEngineProtocol";
import {
  NATIVE_SURFACE_LAYOUT_COMMAND_U32_STRIDE,
  validateNativeSurfaceEngineRequestEnvelope,
} from "../native-surface/NativeSurfaceEngineProtocol";
import { createSurfaceState, type SurfaceState } from "./nativeSurfaceWorkerState";
import { applyNativeSurfaceMutation } from "./nativeSurfaceWorkerMutations";
import { hitTestNativeSurface } from "./nativeSurfaceWorkerHitTest";
import type { NativeSurfaceId } from "../native-surface/contracts";
import {
  getNativeCompactBrowserRow,
  parseNativeCompactBrowserPack,
  type NativeCompactBrowserPack,
} from "../native-surface/NativeRuntimeBrowserPack";
import {
  buildSpriteFrame,
} from "./nativeSurfaceSpriteTimeline";
import {
  parseNativeAnimationPack,
  parseNativeGroupPack,
  parseNativeSearchPack,
  parseNativeStringPack,
  parseNativeTexturePack,
} from "./nativeSurfaceRuntimeParsers";
import {
  buildLayoutCommandBuffer,
  buildNativeSurfaceLayoutCommands,
  computeNativeSurfaceColumns,
  computeWasmLayoutCommands,
} from "./nativeSurfaceLayout";
import { buildNativeSurfaceWorkerMetrics } from "./nativeSurfaceWorkerMetricsCatalog";
import {
  buildRuntimeBrowserIndexByItemId,
  buildRuntimeHistoryEntries as buildRuntimeHistoryEntriesFromProjection,
} from "./nativeSurfaceProjection";
import {
  type NativeRenderPipelineFrameRequest,
} from "../native-surface/NativeRenderPipelineProtocol";
import { NativeSurfaceRenderConnection } from "./nativeSurfaceRenderConnection.ts";
import {
  admitNativeSurfaceRequest,
  completeNativeSurfaceInitialize,
  destroyNativeSurface,
} from "./nativeSurfaceWorkerLifecycle";
import {
  computeWasmRuntimeVisibleEntries,
  disposeWasmPayloads,
  ensureWasmEngine,
  getWasmEngine,
  getWasmError,
  installWasmAnimationPayload,
  installWasmBrowserPayload,
  installWasmGroupPayload,
  installWasmSearchPayload,
  installWasmStringPayload,
  installWasmTexturePayload,
} from "./nativeSurfaceWasmRuntime";

const surfaces = new Map<NativeSurfaceId, SurfaceState>();
let events = 0;
let lastEvent: NativeSurfaceEngineRequest["type"] | null = null;
let lastSurfaceId: NativeSurfaceId | null = null;
const renderConnections = new Map<NativeSurfaceId, NativeSurfaceRenderConnection>();
const destroyedSurfaceIds = new Set<NativeSurfaceId>();

function closeRenderConnection(surfaceId: NativeSurfaceId, reason: string): void {
  const connection = renderConnections.get(surfaceId);
  if (!connection) return;
  connection.close(reason);
  renderConnections.delete(surfaceId);
}

async function connectRenderPort(surfaceId: NativeSurfaceId, sessionId: string, port: MessagePort): Promise<void> {
  closeRenderConnection(surfaceId, "Native render pipeline replaced");
  const connection = new NativeSurfaceRenderConnection(surfaceId, sessionId, port);
  renderConnections.set(surfaceId, connection);
  try {
    await connection.connect();
  } catch (error) {
    connection.close(error instanceof Error ? error.message : String(error));
    renderConnections.delete(surfaceId);
    throw error;
  }
}

async function renderFrameDirectly(
  surfaceId: NativeSurfaceId,
  request: NativeRenderPipelineFrameRequest,
): Promise<Awaited<ReturnType<NativeSurfaceRenderConnection["render"]>>> {
  const connection = renderConnections.get(surfaceId);
  if (!connection || !connection.isReady() || connection.sessionId !== request.sessionId) {
    throw new Error("Native render pipeline is not connected");
  }
  try {
    return await connection.render(request);
  } catch (error) {
    renderConnections.delete(surfaceId);
    throw error;
  }
}

function getRuntimeVisibleEntries(surface: SurfaceState, browserPack: NativeCompactBrowserPack): Uint32Array {
  const cacheKey = [
    browserPack.itemCount,
    `${surface.query ?? ""}`.trim().toLowerCase().replace(/\s+/g, ""),
    `${surface.modId ?? ""}`.trim().toLowerCase(),
    surface.expandedGroups.join("\u001f"),
    "wasm-visible-v2-no-ts-fallback",
  ].join("|");
  if (surface.runtimeVisibleCacheKey === cacheKey && surface.runtimeVisibleEntries) return surface.runtimeVisibleEntries;
  const projectionStartedAt = performance.now();
  const visibleEntries = computeWasmRuntimeVisibleEntries(surface, browserPack.itemCount);
  if (!visibleEntries) {
    const wasmError = getWasmError();
    surface.runtimeError = wasmError
      ? `WASM/browser visible projection unavailable: ${wasmError}`
      : "WASM/browser visible projection unavailable";
    surface.runtimeVisibleCacheKey = cacheKey;
    surface.runtimeVisibleEntries = new Uint32Array();
    surface.runtimeBrowserWasmProjectedEntries = 0;
    surface.lastProjectionMs = performance.now() - projectionStartedAt;
    surface.lastProjectionTotalEntries = 0;
    surface.lastProjectionQuery = `${surface.query ?? ""}`;
    surface.lastProjectionSource = "empty";
    return surface.runtimeVisibleEntries;
  }
  surface.runtimeVisibleCacheKey = cacheKey;
  surface.runtimeVisibleEntries = visibleEntries;
  surface.lastProjectionMs = performance.now() - projectionStartedAt;
  surface.lastProjectionTotalEntries = visibleEntries.length;
  surface.lastProjectionQuery = `${surface.query ?? ""}`;
  surface.lastProjectionSource = surface.lastProjectionQuery.trim().length > 0 ? "search" : "browser";
  surface.runtimeError = null;
  return visibleEntries;
}

function buildRuntimeEntries(surface: SurfaceState): NativeSurfaceEngineEntry[] {
  const browserPack = surface.browserPack;
  if (!browserPack) return [];
  const projectionIndices = getRuntimeVisibleEntries(surface, browserPack);
  const page = Math.max(1, surface.page);
  const viewportWidth = Math.max(1, Math.floor(surface.viewport?.width ?? 1));
  const cardSize = Math.max(1, Math.floor(surface.itemSize || 44));
  const gap = 4;
  const columns = computeNativeSurfaceColumns(getWasmEngine(), viewportWidth, cardSize, gap);
  const rows = Math.max(1, Math.floor(Math.max(1, surface.viewport?.height ?? cardSize) / (cardSize + gap)));
  const pageSize = Math.max(1, columns * rows);
  const start = Math.min(projectionIndices.length, (page - 1) * pageSize);
  const end = Math.min(projectionIndices.length, start + pageSize);
  surface.currentPageSize = pageSize;
  surface.currentWindowEntries = Math.max(0, end - start);
  const emittedCollapsedGroups = new Set<string>();
  const entries: NativeSurfaceEngineEntry[] = [];
  for (let projectionIndex = start; projectionIndex < end; projectionIndex += 1) {
    const encodedIndex = projectionIndices[projectionIndex] ?? 0;
    const wasmCollapsedGroup = encodedIndex >= 0x80000000;
    const index = encodedIndex % 0x80000000;
    const row = getNativeCompactBrowserRow(browserPack, index);
    if (!row) continue;
    const itemId = browserPack.strings[row.itemIdRef] ?? "";
    const groupKey = browserPack.strings[row.groupKeyRef] ?? "";
    if (groupKey && wasmCollapsedGroup) {
      if (emittedCollapsedGroups.has(groupKey)) continue;
      emittedCollapsedGroups.add(groupKey);
      const group = surface.groupByKey.get(groupKey);
      const representativeItemId = group?.representativeItemId || itemId;
      entries.push({
        key: `native-group:${groupKey}`,
        kind: "group-collapsed",
        entryIndex: entries.length,
        itemId: representativeItemId,
        groupKey,
      });
      continue;
    }
    entries.push({
      key: groupKey ? `native-item:${groupKey}:${itemId}:${index}` : `native-item:${itemId}:${index}`,
      kind: "item",
      entryIndex: entries.length,
      itemId,
      groupKey: groupKey || null,
    });
  }
  return entries;
}

function buildRuntimeHistoryEntries(surface: SurfaceState): NativeSurfaceEngineEntry[] {
  return buildRuntimeHistoryEntriesFromProjection({
    browserPack: surface.browserPack,
    historyItems: surface.historyItems,
    runtimeBrowserIndexByItemId: surface.runtimeBrowserIndexByItemId,
  });
}

function canUseRuntimeBrowserProjection(surface: SurfaceState): boolean {
  return Boolean(surface.browserPack);
}

function getActiveEntries(surface: SurfaceState): {
  source: NativeSurfaceEngineWorkerMetrics["projectionSource"];
  entries: NativeSurfaceEngineEntry[];
} {
  if (canUseRuntimeBrowserProjection(surface)) {
    if (surface.enableHistoryViewport) {
      return { source: "runtime-history-pack", entries: buildRuntimeHistoryEntries(surface) };
    }
    return { source: "runtime-browser-pack", entries: buildRuntimeEntries(surface) };
  }
  return { source: "empty", entries: [] };
}

function getSurface(surfaceId: NativeSurfaceId): SurfaceState {
  const existing = surfaces.get(surfaceId);
  if (existing) return existing;
  const next = createSurfaceState();
  surfaces.set(surfaceId, next);
  return next;
}

function rebuildLayout(surface: SurfaceState): void {
  surface.layoutRebuilds += 1;
  const activeEntries = getActiveEntries(surface).entries;
  const viewportWidth = Math.max(1, Math.floor(surface.viewport?.width ?? 1));
  const cardSize = Math.max(1, Math.floor(surface.itemSize || 44));
  const gap = 4;
  const nativeLayout = computeWasmLayoutCommands(getWasmEngine(), activeEntries.length, viewportWidth, cardSize, gap);
  if (!nativeLayout) {
    const wasmError = getWasmError();
    surface.runtimeError = wasmError
      ? `WASM layout command writer unavailable: ${wasmError}`
      : "WASM layout command writer unavailable";
    surface.layoutCommands = [];
    return;
  }
  surface.layoutCommands = buildNativeSurfaceLayoutCommands(activeEntries, nativeLayout, cardSize);
  surface.runtimeError = null;
}

function buildMetrics(): NativeSurfaceEngineWorkerMetrics {
  const lastSurface = lastSurfaceId ? surfaces.get(lastSurfaceId) ?? null : null;
  return buildNativeSurfaceWorkerMetrics({
    surfaces: surfaces.values(),
    events,
    lastEvent,
    lastSurfaceId,
    lastSurface,
    wasmReady: Boolean(getWasmEngine()),
    wasmError: getWasmError(),
  });
}

async function handleRequest(message: NativeSurfaceEngineRequest): Promise<NativeSurfaceEngineResponse> {
  events += 1;
  lastEvent = message.type;
  lastSurfaceId = message.surfaceId;
  admitNativeSurfaceRequest(destroyedSurfaceIds, message.surfaceId, message.type);

  if (message.type === "destroy") {
    destroyNativeSurface({
      surfaceId: message.surfaceId,
      surfaces,
      renderConnections,
      disposeWasmPayloads,
      reason: "Native surface destroyed",
    });
    return {
      type: "ack",
      id: message.id,
      surfaceId: message.surfaceId,
      event: message.type,
      metrics: buildMetrics(),
    };
  }
  if (message.type === "connectRenderPort") {
    await connectRenderPort(message.surfaceId, message.sessionId, message.port);
    return {
      type: "ack",
      id: message.id,
      surfaceId: message.surfaceId,
      event: message.type,
      metrics: buildMetrics(),
    };
  }
  if (message.type === "disconnectRenderPort") {
    const connection = renderConnections.get(message.surfaceId);
    if (!connection || connection.sessionId !== message.sessionId) {
      throw new Error("Native render pipeline disconnect session mismatch");
    }
    closeRenderConnection(message.surfaceId, "Native render pipeline disconnected");
    return {
      type: "ack",
      id: message.id,
      surfaceId: message.surfaceId,
      event: message.type,
      metrics: buildMetrics(),
    };
  }
  const surface = getSurface(message.surfaceId);

  switch (message.type) {
    case "initialize":
      await ensureWasmEngine();
      if (!completeNativeSurfaceInitialize(destroyedSurfaceIds, surfaces, message.surfaceId, surface)) {
        throw new Error(`Native surface initialize was superseded or destroyed: ${message.surfaceId}`);
      }
      surface.renderer = message.preferredRenderer;
      surface.enableAnimations = message.enableAnimations;
      surface.enableHistoryViewport = message.enableHistoryViewport;
      surface.initialized = true;
      break;
    case "runtimePacks":
      surface.runtimeManifestUrl = message.manifestUrl;
      surface.runtimePacks = new Map(message.packs.map((pack) => [pack.name, pack.buffer]));
      try {
        const browserPack = message.packs.find((pack) => pack.name === "browser");
        const groupPack = message.packs.find((pack) => pack.name === "groups");
        const searchPack = message.packs.find((pack) => pack.name === "search");
        const stringPack = message.packs.find((pack) => pack.name === "stringsZhCn");
        const texturePack = message.packs.find((pack) => pack.name === "textures");
        const animationPack = message.packs.find((pack) => pack.name === "animations");
        disposeWasmPayloads(surface);
        surface.browserPack = browserPack ? parseNativeCompactBrowserPack(browserPack.buffer) : null;
        surface.runtimeBrowserIndexByItemId = buildRuntimeBrowserIndexByItemId(surface.browserPack);
        surface.groupByKey = groupPack ? parseNativeGroupPack(groupPack.buffer) : new Map();
        surface.searchByItemId = searchPack ? parseNativeSearchPack(searchPack.buffer) : new Map();
        surface.stringByItemId = stringPack ? parseNativeStringPack(stringPack.buffer) : new Map();
        surface.textureByItemId = texturePack ? parseNativeTexturePack(texturePack.buffer) : new Map();
        surface.animationByItemId = animationPack ? parseNativeAnimationPack(animationPack.buffer) : new Map();
        if (browserPack) installWasmBrowserPayload(surface, browserPack.buffer);
        if (searchPack) installWasmSearchPayload(surface, searchPack.buffer);
        if (groupPack) installWasmGroupPayload(surface, groupPack.buffer);
        if (stringPack) installWasmStringPayload(surface, stringPack.buffer);
        if (texturePack) installWasmTexturePayload(surface, texturePack.buffer);
        if (animationPack) installWasmAnimationPayload(surface, animationPack.buffer);
        surface.runtimeProjectionCacheKey = null;
        surface.runtimeProjectionIndices = null;
        surface.runtimeVisibleCacheKey = null;
        surface.runtimeVisibleEntries = null;
        surface.runtimeError = null;
      } catch (error) {
        disposeWasmPayloads(surface);
        surface.browserPack = null;
        surface.runtimeBrowserIndexByItemId = new Map();
        surface.groupByKey = new Map();
        surface.searchByItemId = new Map();
        surface.stringByItemId = new Map();
        surface.textureByItemId = new Map();
        surface.animationByItemId = new Map();
        surface.runtimeProjectionCacheKey = null;
        surface.runtimeProjectionIndices = null;
        surface.runtimeVisibleCacheKey = null;
        surface.runtimeVisibleEntries = null;
        surface.runtimeError = error instanceof Error ? error.message : String(error);
      }
      rebuildLayout(surface);
      break;
    case "viewport":
      if (applyNativeSurfaceMutation(surface, { type: "viewport", viewport: message.viewport })) rebuildLayout(surface);
      break;
    case "page":
      if (applyNativeSurfaceMutation(surface, { type: "page", page: message.page })) rebuildLayout(surface);
      break;
    case "search":
      if (applyNativeSurfaceMutation(surface, { type: "search", query: message.query })) rebuildLayout(surface);
      break;
    case "modFilter":
      if (applyNativeSurfaceMutation(surface, { type: "modFilter", modId: message.modId })) rebuildLayout(surface);
      break;
    case "expandedGroups":
      if (applyNativeSurfaceMutation(surface, { type: "expandedGroups", groupKeys: message.groupKeys })) rebuildLayout(surface);
      break;
    case "historyItems":
      if (applyNativeSurfaceMutation(surface, { type: "historyItems", itemIds: message.itemIds })) rebuildLayout(surface);
      break;
    case "itemSize":
      if (applyNativeSurfaceMutation(surface, { type: "itemSize", itemSize: message.itemSize })) rebuildLayout(surface);
      break;
    case "mutationBatch": {
      let needsLayout = false;
      for (const mutation of message.mutations) {
        needsLayout = applyNativeSurfaceMutation(surface, mutation) || needsLayout;
      }
      if (needsLayout) rebuildLayout(surface);
      break;
    }
    case "frame":
      surface.frameRequests += 1;
      const spriteFrame = buildSpriteFrame(surface, surface.layoutCommands, message.nowMs, getWasmEngine());
      surface.hasAnimatedSprites = spriteFrame.hasAnimatedSprites;
      surface.animatedSpriteCount = spriteFrame.animatedSpriteCount;
      surface.spriteCommandCount = spriteFrame.spriteCommands.length;
      surface.missingSpriteCount = spriteFrame.missingSpriteCount;
      surface.missingSpriteItemIds = spriteFrame.missingSpriteItemIds;
      surface.nextFrameDelayMs = spriteFrame.nextFrameDelayMs;
      const renderConnection = renderConnections.get(message.surfaceId);
      if (!renderConnection?.isReady()) {
        throw new Error(`Native render pipeline is not connected: ${message.surfaceId}`);
      }
      const frameRequest: NativeRenderPipelineFrameRequest = {
        type: "renderFrame",
        sessionId: renderConnection.sessionId,
        frameToken: message.id,
        commandBuffer: buildLayoutCommandBuffer(
          surface.layoutCommands,
          surface.lastHit?.key ?? null,
          surface.selectedItemId,
        ),
        commandStride: NATIVE_SURFACE_LAYOUT_COMMAND_U32_STRIDE,
        commandCount: surface.layoutCommands.length,
        spriteCommands: spriteFrame.spriteCommands,
        nowMs: message.nowMs,
      };
      const renderResult = await renderFrameDirectly(message.surfaceId, frameRequest);
      return {
        type: "frame",
        id: message.id,
        surfaceId: message.surfaceId,
        frameToken: message.id,
        rendered: renderResult.status === "rendered",
        missingTextureKeys: renderResult.missingTextureKeys,
        hasAnimatedSprites: spriteFrame.hasAnimatedSprites,
        animatedSpriteCount: spriteFrame.animatedSpriteCount,
        nextFrameDelayMs: spriteFrame.nextFrameDelayMs,
        metrics: buildMetrics(),
      };
    case "hitTest":
      return {
        type: "hitTest",
        id: message.id,
        surfaceId: message.surfaceId,
        hit: hitTestNativeSurface(surface, message, getWasmEngine()),
        metrics: buildMetrics(),
      };
    default: {
      const unsupportedMessage = message as NativeSurfaceEngineRequest & { type: string };
      throw new Error(`Unsupported native surface engine request type: ${unsupportedMessage.type}`);
    }
  }

  return {
    type: "ack",
    id: message.id,
    surfaceId: message.surfaceId,
    event: message.type,
    metrics: buildMetrics(),
  };
}

type WorkerResponsePort = {
  postMessage(message: unknown, transfer: Transferable[]): void;
};

self.onmessage = (event: MessageEvent<unknown>) => {
  const envelopeError = validateNativeSurfaceEngineRequestEnvelope(event.data);
  if (envelopeError) {
    const malformed = event.data as { id?: unknown; surfaceId?: unknown } | null;
    if (!Number.isSafeInteger(malformed?.id)) throw new Error(envelopeError);
    const response: NativeSurfaceEngineResponse = {
      type: "error",
      id: malformed?.id as number,
      surfaceId: typeof malformed?.surfaceId === "string" ? malformed.surfaceId : "invalid",
      error: envelopeError,
      metrics: buildMetrics(),
    };
    (self as unknown as WorkerResponsePort).postMessage(response, []);
    return;
  }
  const message = event.data as NativeSurfaceEngineRequest;
  const id = message.id;
  const surfaceId = message.surfaceId;
  void handleRequest(message).then(
    (response) => {
      (self as unknown as WorkerResponsePort).postMessage(response, []);
    },
    (error) => {
      const response: NativeSurfaceEngineResponse = {
        type: "error",
        id,
        surfaceId,
        error: error instanceof Error ? error.message : String(error),
        metrics: buildMetrics(),
      };
      (self as unknown as WorkerResponsePort).postMessage(response, []);
    },
  );
};

