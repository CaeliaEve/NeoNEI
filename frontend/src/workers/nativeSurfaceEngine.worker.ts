import type {
  NativeSurfaceEngineRequest,
  NativeSurfaceEngineResponse,
  NativeSurfaceEngineEntry,
  NativeSurfaceEngineHit,
  NativeSurfaceEngineLayoutCommand,
  NativeSurfaceEngineWorkerMetrics,
} from "../native-surface/NativeSurfaceEngineProtocol";
import { NATIVE_SURFACE_LAYOUT_COMMAND_U32_STRIDE } from "../native-surface/NativeSurfaceEngineProtocol";
import type {
  NativeRendererBackendKind,
  NativeSurfaceId,
  NativeSurfaceViewport,
} from "../native-surface/contracts";
import {
  getNativeCompactBrowserRow,
  parseNativeCompactBrowserPack,
  type NativeCompactBrowserPack,
} from "../native-surface/NativeRuntimeBrowserPack";
import { getCachedNativeRuntimeProjectionIndices } from "../native-surface/NativeRuntimeProjection";

type SurfaceState = {
  initialized: boolean;
  renderer: NativeRendererBackendKind;
  viewport: NativeSurfaceViewport | null;
  enableAnimations: boolean;
  enableHistoryViewport: boolean;
  page: number;
  itemSize: number;
  query: string;
  modId: string | null;
  expandedGroups: string[];
  historyItems: string[];
  entries: NativeSurfaceEngineEntry[];
  layoutCommands: NativeSurfaceEngineLayoutCommand[];
  lastHit: NativeSurfaceEngineHit;
  runtimeManifestUrl: string | null;
  runtimePacks: Map<string, ArrayBuffer>;
  runtimeError: string | null;
  browserPack: NativeCompactBrowserPack | null;
  groupByKey: Map<string, NativeRuntimeGroup>;
  runtimeProjectionCacheKey: string | null;
  runtimeProjectionIndices: Uint32Array | null;
  runtimeBrowserWasmPtr: number;
  runtimeBrowserWasmLen: number;
  runtimeBrowserWasmItemCount: number;
  runtimeBrowserWasmProjectedEntries: number;
};

type NativeRuntimeGroup = {
  groupKey: string;
  groupLabel?: string | null;
  groupSize?: number | null;
  representativeItemId?: string | null;
  memberItemIds: string[];
};

const surfaces = new Map<NativeSurfaceId, SurfaceState>();
let events = 0;
let lastEvent: NativeSurfaceEngineRequest["type"] | null = null;
let lastSurfaceId: NativeSurfaceId | null = null;

type NativeWasmEngineExports = {
  memory?: WebAssembly.Memory;
  neonei_engine_alloc?: (len: number) => number;
  neonei_engine_dealloc?: (ptr: number, len: number) => void;
  neonei_engine_alloc_u32?: (len: number) => number;
  neonei_engine_dealloc_u32?: (ptr: number, len: number) => void;
  neonei_engine_compute_columns: (viewportWidth: number, itemSize: number, gap: number) => number;
  neonei_engine_hit_test_index: (
    x: number,
    y: number,
    viewportWidth: number,
    itemSize: number,
    gap: number,
    entryCount: number,
  ) => number;
  neonei_engine_compact_browser_item_count?: (ptr: number, len: number) => number;
  neonei_engine_compact_browser_project_count?: (
    packPtr: number,
    packLen: number,
    queryPtr: number,
    queryLen: number,
    modPtr: number,
    modLen: number,
  ) => number;
  neonei_engine_compact_browser_project_indices?: (
    packPtr: number,
    packLen: number,
    queryPtr: number,
    queryLen: number,
    modPtr: number,
    modLen: number,
    outPtr: number,
    outLen: number,
  ) => number;
};

const WASM_ENGINE_URL = "/native/engine/neonei_wasm_engine.wasm";
let wasmEngine: NativeWasmEngineExports | null = null;
let wasmEnginePromise: Promise<NativeWasmEngineExports | null> | null = null;
let wasmError: string | null = null;

function toU32(value: number): number {
  return Math.max(0, Math.floor(Number(value) || 0));
}

async function ensureWasmEngine(): Promise<NativeWasmEngineExports | null> {
  if (wasmEngine || wasmError) return wasmEngine;
  if (wasmEnginePromise) return wasmEnginePromise;
  wasmEnginePromise = (async () => {
    try {
      const response = await fetch(WASM_ENGINE_URL);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const bytes = await response.arrayBuffer();
      const instance = await WebAssembly.instantiate(bytes, {});
      const exports = instance.instance.exports as unknown as NativeWasmEngineExports;
      if (typeof exports.neonei_engine_compute_columns !== "function"
        || typeof exports.neonei_engine_hit_test_index !== "function") {
        throw new Error("missing native engine exports");
      }
      wasmEngine = exports;
      wasmError = null;
      return wasmEngine;
    } catch (error) {
      wasmError = error instanceof Error ? error.message : String(error);
      wasmEngine = null;
      return null;
    }
  })();
  return wasmEnginePromise;
}

function computeColumns(viewportWidth: number, cardSize: number, gap: number): number {
  const wasmColumns = wasmEngine?.neonei_engine_compute_columns(toU32(viewportWidth), toU32(cardSize), toU32(gap));
  if (Number.isFinite(wasmColumns) && wasmColumns && wasmColumns > 0) return Math.max(1, Math.floor(wasmColumns));
  return Math.max(1, Math.floor((viewportWidth + gap) / (cardSize + gap)));
}

function disposeWasmBrowserPayload(surface: SurfaceState): void {
  if (surface.runtimeBrowserWasmPtr > 0 && surface.runtimeBrowserWasmLen > 0) {
    wasmEngine?.neonei_engine_dealloc?.(surface.runtimeBrowserWasmPtr, surface.runtimeBrowserWasmLen);
  }
  surface.runtimeBrowserWasmPtr = 0;
  surface.runtimeBrowserWasmLen = 0;
  surface.runtimeBrowserWasmItemCount = 0;
  surface.runtimeBrowserWasmProjectedEntries = 0;
}

function installWasmBrowserPayload(surface: SurfaceState, payloadBuffer: ArrayBuffer): void {
  disposeWasmBrowserPayload(surface);
  const alloc = wasmEngine?.neonei_engine_alloc;
  const memory = wasmEngine?.memory;
  if (!alloc || !memory || payloadBuffer.byteLength <= 0) return;
  const ptr = alloc(payloadBuffer.byteLength);
  if (!ptr) return;
  new Uint8Array(memory.buffer, ptr, payloadBuffer.byteLength).set(new Uint8Array(payloadBuffer));
  surface.runtimeBrowserWasmPtr = ptr;
  surface.runtimeBrowserWasmLen = payloadBuffer.byteLength;
  surface.runtimeBrowserWasmItemCount = wasmEngine?.neonei_engine_compact_browser_item_count?.(ptr, payloadBuffer.byteLength) ?? 0;
}

function parseJsonPayload<T>(payloadBuffer: ArrayBuffer): T | null {
  try {
    const text = new TextDecoder("utf-8").decode(new Uint8Array(payloadBuffer));
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function parseNativeGroupPack(payloadBuffer: ArrayBuffer): Map<string, NativeRuntimeGroup> {
  const pack = parseJsonPayload<{ groups?: unknown[] }>(payloadBuffer);
  const groups = new Map<string, NativeRuntimeGroup>();
  for (const row of pack?.groups ?? []) {
    if (!row || typeof row !== "object") continue;
    const value = row as Record<string, unknown>;
    const groupKey = `${value.groupKey ?? ""}`.trim();
    if (!groupKey) continue;
    const members = Array.isArray(value.memberItemIds)
      ? value.memberItemIds.map((entry) => `${entry ?? ""}`.trim()).filter(Boolean)
      : [];
    groups.set(groupKey, {
      groupKey,
      groupLabel: typeof value.groupLabel === "string" ? value.groupLabel : null,
      groupSize: typeof value.groupSize === "number" ? value.groupSize : members.length,
      representativeItemId: typeof value.representativeItemId === "string" ? value.representativeItemId : members[0] ?? null,
      memberItemIds: members,
    });
  }
  return groups;
}

function writeWasmUtf8(value: string): { ptr: number; len: number } {
  const alloc = wasmEngine?.neonei_engine_alloc;
  const memory = wasmEngine?.memory;
  const bytes = new TextEncoder().encode(value);
  if (!alloc || !memory || bytes.byteLength <= 0) return { ptr: 0, len: 0 };
  const ptr = alloc(bytes.byteLength);
  if (!ptr) return { ptr: 0, len: 0 };
  new Uint8Array(memory.buffer, ptr, bytes.byteLength).set(bytes);
  return { ptr, len: bytes.byteLength };
}

function freeWasmBytes(bytes: { ptr: number; len: number }): void {
  if (bytes.ptr > 0 && bytes.len > 0) wasmEngine?.neonei_engine_dealloc?.(bytes.ptr, bytes.len);
}

function computeWasmRuntimeProjectionCount(surface: SurfaceState): number | null {
  const projectCount = wasmEngine?.neonei_engine_compact_browser_project_count;
  if (!projectCount || surface.runtimeBrowserWasmPtr <= 0 || surface.runtimeBrowserWasmLen <= 0) return null;
  const query = writeWasmUtf8(surface.query);
  const mod = writeWasmUtf8(surface.modId ?? "");
  try {
    return projectCount(
      surface.runtimeBrowserWasmPtr,
      surface.runtimeBrowserWasmLen,
      query.ptr,
      query.len,
      mod.ptr,
      mod.len,
    );
  } finally {
    freeWasmBytes(query);
    freeWasmBytes(mod);
  }
}

function computeWasmRuntimeProjectionIndices(surface: SurfaceState, itemCount: number): Uint32Array | null {
  const projectIndices = wasmEngine?.neonei_engine_compact_browser_project_indices;
  const allocU32 = wasmEngine?.neonei_engine_alloc_u32;
  const deallocU32 = wasmEngine?.neonei_engine_dealloc_u32;
  const memory = wasmEngine?.memory;
  if (!projectIndices || !allocU32 || !deallocU32 || !memory || surface.runtimeBrowserWasmPtr <= 0 || surface.runtimeBrowserWasmLen <= 0) {
    return null;
  }
  const outCapacity = Math.max(0, Math.floor(itemCount));
  if (outCapacity <= 0) return new Uint32Array();
  const query = writeWasmUtf8(surface.query);
  const mod = writeWasmUtf8(surface.modId ?? "");
  const outPtr = allocU32(outCapacity);
  if (!outPtr) {
    freeWasmBytes(query);
    freeWasmBytes(mod);
    return null;
  }
  try {
    const count = projectIndices(
      surface.runtimeBrowserWasmPtr,
      surface.runtimeBrowserWasmLen,
      query.ptr,
      query.len,
      mod.ptr,
      mod.len,
      outPtr,
      outCapacity,
    );
    const clampedCount = Math.min(outCapacity, Math.max(0, Math.floor(count)));
    surface.runtimeBrowserWasmProjectedEntries = count;
    return Uint32Array.from(new Uint32Array(memory.buffer, outPtr, clampedCount));
  } finally {
    deallocU32(outPtr, outCapacity);
    freeWasmBytes(query);
    freeWasmBytes(mod);
  }
}

function getRuntimeProjectionIndices(surface: SurfaceState, browserPack: NativeCompactBrowserPack): Uint32Array {
  const cacheKey = [
    browserPack.itemCount,
    `${surface.query ?? ""}`.trim().toLowerCase().replace(/\s+/g, ""),
    `${surface.modId ?? ""}`.trim().toLowerCase(),
    "wasm-primary",
  ].join("|");
  if (surface.runtimeProjectionCacheKey === cacheKey && surface.runtimeProjectionIndices) return surface.runtimeProjectionIndices;

  const wasmIndices = computeWasmRuntimeProjectionIndices(surface, browserPack.itemCount);
  if (wasmIndices) {
    surface.runtimeProjectionCacheKey = cacheKey;
    surface.runtimeProjectionIndices = wasmIndices;
    return wasmIndices;
  }

  const indices = getCachedNativeRuntimeProjectionIndices(
    browserPack,
    { query: surface.query, modId: surface.modId },
    {
      get key() { return surface.runtimeProjectionCacheKey; },
      set key(value: string | null) { surface.runtimeProjectionCacheKey = value; },
      get indices() { return surface.runtimeProjectionIndices; },
      set indices(value: Uint32Array | null) { surface.runtimeProjectionIndices = value; },
    },
  );
  const wasmProjectedEntries = computeWasmRuntimeProjectionCount(surface);
  if (wasmProjectedEntries !== null) {
    surface.runtimeBrowserWasmProjectedEntries = wasmProjectedEntries;
    if (wasmProjectedEntries !== indices.length) {
      surface.runtimeError = `WASM/browser projection mismatch: wasm=${wasmProjectedEntries}, ts=${indices.length}`;
    }
  }
  return indices;
}

function buildRuntimeEntries(surface: SurfaceState): NativeSurfaceEngineEntry[] {
  const browserPack = surface.browserPack;
  if (!browserPack) return [];
  const projectionIndices = getRuntimeProjectionIndices(surface, browserPack);
  const expandedGroups = new Set(surface.expandedGroups);
  const emittedCollapsedGroups = new Set<string>();
  const projected: NativeSurfaceEngineEntry[] = [];
  for (let projectionIndex = 0; projectionIndex < projectionIndices.length; projectionIndex += 1) {
    const index = projectionIndices[projectionIndex] ?? 0;
    const row = getNativeCompactBrowserRow(browserPack, index);
    if (!row) continue;
    const itemId = browserPack.strings[row.itemIdRef] ?? "";
    const groupKey = browserPack.strings[row.groupKeyRef] ?? "";
    if (groupKey && !expandedGroups.has(groupKey)) {
      if (emittedCollapsedGroups.has(groupKey)) continue;
      emittedCollapsedGroups.add(groupKey);
      const group = surface.groupByKey.get(groupKey);
      const representativeItemId = group?.representativeItemId || itemId;
      projected.push({
        key: `native-group:${groupKey}`,
        kind: "group-collapsed",
        entryIndex: projected.length,
        itemId: representativeItemId,
        groupKey,
      });
      continue;
    }
    projected.push({
      key: groupKey ? `native-item:${groupKey}:${itemId}:${index}` : `native-item:${itemId}:${index}`,
      kind: "item",
      entryIndex: projected.length,
      itemId,
      groupKey: groupKey || null,
    });
  }
  const page = Math.max(1, surface.page);
  const viewportWidth = Math.max(1, Math.floor(surface.viewport?.width ?? 1));
  const cardSize = Math.max(1, Math.floor(surface.itemSize || 44));
  const gap = 4;
  const columns = computeColumns(viewportWidth, cardSize, gap);
  const rows = Math.max(1, Math.floor(Math.max(1, surface.viewport?.height ?? cardSize) / (cardSize + gap)));
  const pageSize = Math.max(1, columns * rows);
  const start = Math.min(projected.length, (page - 1) * pageSize);
  return projected.slice(start, start + pageSize).map((entry, entryIndex) => ({ ...entry, entryIndex }));
}

function canUseRuntimeBrowserProjection(surface: SurfaceState): boolean {
  return Boolean(surface.browserPack)
    && !surface.enableHistoryViewport;
}

function getActiveEntries(surface: SurfaceState): {
  source: NativeSurfaceEngineWorkerMetrics["projectionSource"];
  entries: NativeSurfaceEngineEntry[];
} {
  if (canUseRuntimeBrowserProjection(surface)) {
    return { source: "runtime-browser-pack", entries: buildRuntimeEntries(surface) };
  }
  if (surface.entries.length > 0) {
    return { source: "compat-entries", entries: surface.entries };
  }
  return { source: "empty", entries: [] };
}

function getSurface(surfaceId: NativeSurfaceId): SurfaceState {
  const existing = surfaces.get(surfaceId);
  if (existing) return existing;
  const next: SurfaceState = {
    initialized: false,
    renderer: "compat-canvas",
    viewport: null,
    enableAnimations: false,
    enableHistoryViewport: false,
    page: 1,
    itemSize: 44,
    query: "",
    modId: null,
    expandedGroups: [],
    historyItems: [],
    entries: [],
    layoutCommands: [],
    lastHit: null,
    runtimeManifestUrl: null,
    runtimePacks: new Map(),
    runtimeError: null,
    browserPack: null,
    groupByKey: new Map(),
    runtimeProjectionCacheKey: null,
    runtimeProjectionIndices: null,
    runtimeBrowserWasmPtr: 0,
    runtimeBrowserWasmLen: 0,
    runtimeBrowserWasmItemCount: 0,
    runtimeBrowserWasmProjectedEntries: 0,
  };
  surfaces.set(surfaceId, next);
  return next;
}

function rebuildLayout(surface: SurfaceState): void {
  const activeEntries = getActiveEntries(surface).entries;
  const viewportWidth = Math.max(1, Math.floor(surface.viewport?.width ?? 1));
  const cardSize = Math.max(1, Math.floor(surface.itemSize || 44));
  const iconSize = Math.max(1, Math.floor(cardSize * 0.9));
  const gap = 4;
  const columns = computeColumns(viewportWidth, cardSize, gap);
  surface.layoutCommands = activeEntries.map((entry, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const x = col * (cardSize + gap);
    const y = row * (cardSize + gap);
    return {
      key: entry.key,
      kind: entry.kind,
      entryIndex: entry.entryIndex,
      itemId: entry.itemId,
      groupKey: entry.groupKey ?? null,
      x,
      y,
      size: cardSize,
      iconX: x + Math.round((cardSize - iconSize) / 2),
      iconY: y + Math.round((cardSize - iconSize) / 2),
      iconSize,
    };
  });
}

function buildLayoutCommandBuffer(commands: NativeSurfaceEngineLayoutCommand[]): ArrayBuffer {
  const stride = NATIVE_SURFACE_LAYOUT_COMMAND_U32_STRIDE;
  const values = new Uint32Array(commands.length * stride);
  commands.forEach((command, index) => {
    const offset = index * stride;
    values[offset] = toU32(command.entryIndex);
    values[offset + 1] = toU32(command.x);
    values[offset + 2] = toU32(command.y);
    values[offset + 3] = toU32(command.size);
    values[offset + 4] = toU32(command.iconX);
    values[offset + 5] = toU32(command.iconY);
    values[offset + 6] = toU32(command.iconSize);
    values[offset + 7] = command.kind === "item" ? 0 : command.kind === "group-collapsed" ? 1 : 2;
  });
  return values.buffer;
}
function hitTest(surface: SurfaceState, message: Extract<NativeSurfaceEngineRequest, { type: "hitTest" }>): NativeSurfaceEngineHit {
  const viewportWidth = Math.max(1, Math.floor(surface.viewport?.width ?? 1));
  const cardSize = Math.max(1, Math.floor(surface.itemSize || 44));
  const gap = 4;
  const nativeIndex = wasmEngine?.neonei_engine_hit_test_index(
    toU32(message.x),
    toU32(message.y),
    toU32(viewportWidth),
    toU32(cardSize),
    toU32(gap),
    toU32(surface.layoutCommands.length),
  );
  const hit = Number.isInteger(nativeIndex) && nativeIndex >= 0
    ? surface.layoutCommands[nativeIndex]
    : surface.layoutCommands.find((command) =>
      message.x >= command.x
      && message.x <= command.x + command.size
      && message.y >= command.y
      && message.y <= command.y + command.size
    );
  if (!hit) {
    surface.lastHit = null;
    return null;
  }
  surface.lastHit = {
    key: hit.key,
    kind: hit.kind,
    entryIndex: hit.entryIndex,
    itemId: hit.itemId,
    groupKey: hit.groupKey ?? null,
    viewport: message.viewport,
  };
  return surface.lastHit;
}

function buildMetrics(): NativeSurfaceEngineWorkerMetrics {
  const lastSurface = lastSurfaceId ? surfaces.get(lastSurfaceId) : null;
  const projectionSource = lastSurface ? getActiveEntries(lastSurface).source : "empty";
  return {
    initializedSurfaces: Array.from(surfaces.values()).filter((surface) => surface.initialized).length,
    events,
    lastEvent,
    lastSurfaceId,
    layoutCommands: lastSurface?.layoutCommands.length ?? 0,
    lastHit: lastSurface?.lastHit ?? null,
    wasmReady: Boolean(wasmEngine),
    wasmError,
    runtimeReady: Boolean(lastSurface?.runtimePacks.size),
    runtimePacks: lastSurface?.runtimePacks.size ?? 0,
    runtimeError: lastSurface?.runtimeError ?? null,
    projectionSource,
    nativeBrowserEntries: lastSurface?.browserPack?.itemCount ?? 0,
    nativeBrowserProjectedEntries: lastSurface?.runtimeProjectionIndices?.length ?? 0,
    nativeBrowserWasmEntries: lastSurface?.runtimeBrowserWasmItemCount ?? 0,
    nativeBrowserWasmProjectedEntries: lastSurface?.runtimeBrowserWasmProjectedEntries ?? 0,
    nativeBrowserStrings: lastSurface?.browserPack?.stringCount ?? 0,
    updatedAt: performance.now(),
  };
}

async function handleRequest(message: NativeSurfaceEngineRequest): Promise<NativeSurfaceEngineResponse> {
  const surface = getSurface(message.surfaceId);
  events += 1;
  lastEvent = message.type;
  lastSurfaceId = message.surfaceId;

  switch (message.type) {
    case "initialize":
      await ensureWasmEngine();
      surface.initialized = true;
      surface.renderer = message.preferredRenderer;
      surface.enableAnimations = message.enableAnimations;
      surface.enableHistoryViewport = message.enableHistoryViewport;
      break;
    case "runtimePacks":
      surface.runtimeManifestUrl = message.manifestUrl;
      surface.runtimePacks = new Map(message.packs.map((pack) => [pack.name, pack.buffer]));
      try {
        const browserPack = message.packs.find((pack) => pack.name === "browser");
        const groupPack = message.packs.find((pack) => pack.name === "groups");
        disposeWasmBrowserPayload(surface);
        surface.browserPack = browserPack ? parseNativeCompactBrowserPack(browserPack.buffer) : null;
        surface.groupByKey = groupPack ? parseNativeGroupPack(groupPack.buffer) : new Map();
        if (browserPack) installWasmBrowserPayload(surface, browserPack.buffer);
        surface.runtimeProjectionCacheKey = null;
        surface.runtimeProjectionIndices = null;
        surface.runtimeError = null;
      } catch (error) {
        disposeWasmBrowserPayload(surface);
        surface.browserPack = null;
        surface.groupByKey = new Map();
        surface.runtimeProjectionCacheKey = null;
        surface.runtimeProjectionIndices = null;
        surface.runtimeError = error instanceof Error ? error.message : String(error);
      }
      rebuildLayout(surface);
      break;
    case "viewport":
      surface.viewport = message.viewport;
      rebuildLayout(surface);
      break;
    case "page":
      surface.page = Math.max(1, Math.floor(Number(message.page) || 1));
      rebuildLayout(surface);
      break;
    case "search":
      surface.query = `${message.query ?? ""}`;
      surface.runtimeProjectionCacheKey = null;
      rebuildLayout(surface);
      break;
    case "modFilter":
      surface.modId = message.modId ? `${message.modId}` : null;
      surface.runtimeProjectionCacheKey = null;
      rebuildLayout(surface);
      break;
    case "expandedGroups":
      surface.expandedGroups = Array.from(new Set(message.groupKeys));
      rebuildLayout(surface);
      break;
    case "historyItems":
      surface.historyItems = Array.from(new Set(message.itemIds));
      break;
    case "compatEntries":
      surface.entries = message.entries;
      rebuildLayout(surface);
      break;
    case "itemSize":
      surface.itemSize = Math.max(1, Math.floor(Number(message.itemSize) || 1));
      rebuildLayout(surface);
      break;
    case "frame":
      rebuildLayout(surface);
      return {
        type: "frame",
        id: message.id,
        surfaceId: message.surfaceId,
        drawCommands: surface.layoutCommands,
        commandBuffer: buildLayoutCommandBuffer(surface.layoutCommands),
        commandStride: NATIVE_SURFACE_LAYOUT_COMMAND_U32_STRIDE,
        commandCount: surface.layoutCommands.length,
        metrics: buildMetrics(),
      };
    case "hitTest":
      return {
        type: "hitTest",
        id: message.id,
        surfaceId: message.surfaceId,
        hit: hitTest(surface, message),
        metrics: buildMetrics(),
      };
    case "destroy":
      disposeWasmBrowserPayload(surface);
      surface.initialized = false;
      break;
  }

  return {
    type: "ack",
    id: message.id,
    surfaceId: message.surfaceId,
    event: message.type,
    metrics: buildMetrics(),
  };
}

self.onmessage = (event: MessageEvent<NativeSurfaceEngineRequest>) => {
  const message = event.data;
  if (!message?.type || !message.surfaceId) return;
  void handleRequest(message).then((response) => self.postMessage(response));
};






