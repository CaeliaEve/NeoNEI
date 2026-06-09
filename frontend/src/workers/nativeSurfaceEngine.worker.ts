import type {
  NativeSurfaceEngineRequest,
  NativeSurfaceEngineResponse,
  NativeSurfaceEngineEntry,
  NativeSurfaceEngineHit,
  NativeSurfaceEngineWorkerMetrics,
} from "../native-surface/NativeSurfaceEngineProtocol";
import { NATIVE_SURFACE_LAYOUT_COMMAND_U32_STRIDE } from "../native-surface/NativeSurfaceEngineProtocol";
import { createSurfaceState, type SurfaceState } from "./nativeSurfaceWorkerState";
import { applyNativeSurfaceMutation } from "./nativeSurfaceWorkerMutations";
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
import { buildNativeSurfaceMetrics } from "./nativeSurfaceMetrics";
import {
  buildRuntimeBrowserIndexByItemId,
  buildRuntimeHistoryEntries as buildRuntimeHistoryEntriesFromProjection,
  buildRuntimeSearchExactIndex,
  getRuntimeSearchPrefixCandidates,
  normalizeRuntimeSearchKey,
} from "./nativeSurfaceProjection";

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
  neonei_engine_write_layout_commands?: (
    entryCount: number,
    viewportWidth: number,
    itemSize: number,
    gap: number,
    outPtr: number,
    outLen: number,
  ) => number;
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
  neonei_engine_compact_browser_project_visible_indices?: (
    packPtr: number,
    packLen: number,
    queryPtr: number,
    queryLen: number,
    modPtr: number,
    modLen: number,
    expandedPtr: number,
    expandedLen: number,
    outPtr: number,
    outLen: number,
  ) => number;
  neonei_engine_compact_group_count?: (ptr: number, len: number) => number;
  neonei_engine_compact_string_item_count?: (ptr: number, len: number) => number;
  neonei_engine_compact_texture_item_count?: (ptr: number, len: number) => number;
  neonei_engine_compact_animation_item_count?: (ptr: number, len: number) => number;
  neonei_engine_compact_texture_select_frame_index?: (ptr: number, len: number, rowIndex: number, nowMs: number) => number;
  neonei_engine_compact_animation_select_frame_index?: (ptr: number, len: number, rowIndex: number, nowMs: number) => number;
  neonei_engine_compact_search_project_visible_indices?: (
    browserPtr: number,
    browserLen: number,
    searchPtr: number,
    searchLen: number,
    queryPtr: number,
    queryLen: number,
    modPtr: number,
    modLen: number,
    expandedPtr: number,
    expandedLen: number,
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

function disposeWasmPayloads(surface: SurfaceState): void {
  if (surface.runtimeBrowserWasmPtr > 0 && surface.runtimeBrowserWasmLen > 0) {
    wasmEngine?.neonei_engine_dealloc?.(surface.runtimeBrowserWasmPtr, surface.runtimeBrowserWasmLen);
  }
  surface.runtimeBrowserWasmPtr = 0;
  surface.runtimeBrowserWasmLen = 0;
  surface.runtimeBrowserWasmItemCount = 0;
  surface.runtimeBrowserWasmProjectedEntries = 0;
  if (surface.runtimeSearchWasmPtr > 0 && surface.runtimeSearchWasmLen > 0) {
    wasmEngine?.neonei_engine_dealloc?.(surface.runtimeSearchWasmPtr, surface.runtimeSearchWasmLen);
  }
  surface.runtimeSearchWasmPtr = 0;
  surface.runtimeSearchWasmLen = 0;
  if (surface.runtimeGroupWasmPtr > 0 && surface.runtimeGroupWasmLen > 0) {
    wasmEngine?.neonei_engine_dealloc?.(surface.runtimeGroupWasmPtr, surface.runtimeGroupWasmLen);
  }
  surface.runtimeGroupWasmPtr = 0;
  surface.runtimeGroupWasmLen = 0;
  surface.runtimeGroupWasmCount = 0;
  if (surface.runtimeStringWasmPtr > 0 && surface.runtimeStringWasmLen > 0) {
    wasmEngine?.neonei_engine_dealloc?.(surface.runtimeStringWasmPtr, surface.runtimeStringWasmLen);
  }
  surface.runtimeStringWasmPtr = 0;
  surface.runtimeStringWasmLen = 0;
  surface.runtimeStringWasmItemCount = 0;
  if (surface.runtimeTextureWasmPtr > 0 && surface.runtimeTextureWasmLen > 0) {
    wasmEngine?.neonei_engine_dealloc?.(surface.runtimeTextureWasmPtr, surface.runtimeTextureWasmLen);
  }
  surface.runtimeTextureWasmPtr = 0;
  surface.runtimeTextureWasmLen = 0;
  surface.runtimeTextureWasmItemCount = 0;
  if (surface.runtimeAnimationWasmPtr > 0 && surface.runtimeAnimationWasmLen > 0) {
    wasmEngine?.neonei_engine_dealloc?.(surface.runtimeAnimationWasmPtr, surface.runtimeAnimationWasmLen);
  }
  surface.runtimeAnimationWasmPtr = 0;
  surface.runtimeAnimationWasmLen = 0;
  surface.runtimeAnimationWasmItemCount = 0;
}

function installWasmBrowserPayload(surface: SurfaceState, payloadBuffer: ArrayBuffer): void {
  disposeWasmPayloads(surface);
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

function installWasmSearchPayload(surface: SurfaceState, payloadBuffer: ArrayBuffer): void {
  const ptr = installWasmPackPayload(payloadBuffer);
  if (!ptr) return;
  surface.runtimeSearchWasmPtr = ptr;
  surface.runtimeSearchWasmLen = payloadBuffer.byteLength;
}

function installWasmPackPayload(payloadBuffer: ArrayBuffer): number {
  const alloc = wasmEngine?.neonei_engine_alloc;
  const memory = wasmEngine?.memory;
  if (!alloc || !memory || payloadBuffer.byteLength <= 0) return 0;
  const ptr = alloc(payloadBuffer.byteLength);
  if (!ptr) return 0;
  new Uint8Array(memory.buffer, ptr, payloadBuffer.byteLength).set(new Uint8Array(payloadBuffer));
  return ptr;
}


function installWasmGroupPayload(surface: SurfaceState, payloadBuffer: ArrayBuffer): void {
  const ptr = installWasmPackPayload(payloadBuffer);
  if (!ptr) return;
  surface.runtimeGroupWasmPtr = ptr;
  surface.runtimeGroupWasmLen = payloadBuffer.byteLength;
  surface.runtimeGroupWasmCount = wasmEngine?.neonei_engine_compact_group_count?.(ptr, payloadBuffer.byteLength) ?? 0;
}

function installWasmStringPayload(surface: SurfaceState, payloadBuffer: ArrayBuffer): void {
  const ptr = installWasmPackPayload(payloadBuffer);
  if (!ptr) return;
  surface.runtimeStringWasmPtr = ptr;
  surface.runtimeStringWasmLen = payloadBuffer.byteLength;
  surface.runtimeStringWasmItemCount = wasmEngine?.neonei_engine_compact_string_item_count?.(ptr, payloadBuffer.byteLength) ?? 0;
}

function installWasmTexturePayload(surface: SurfaceState, payloadBuffer: ArrayBuffer): void {
  const ptr = installWasmPackPayload(payloadBuffer);
  if (!ptr) return;
  surface.runtimeTextureWasmPtr = ptr;
  surface.runtimeTextureWasmLen = payloadBuffer.byteLength;
  surface.runtimeTextureWasmItemCount = wasmEngine?.neonei_engine_compact_texture_item_count?.(ptr, payloadBuffer.byteLength) ?? 0;
}

function installWasmAnimationPayload(surface: SurfaceState, payloadBuffer: ArrayBuffer): void {
  const ptr = installWasmPackPayload(payloadBuffer);
  if (!ptr) return;
  surface.runtimeAnimationWasmPtr = ptr;
  surface.runtimeAnimationWasmLen = payloadBuffer.byteLength;
  surface.runtimeAnimationWasmItemCount = wasmEngine?.neonei_engine_compact_animation_item_count?.(ptr, payloadBuffer.byteLength) ?? 0;
}

function computeIndexedRuntimeVisibleEntries(
  surface: SurfaceState,
  browserPack: NativeCompactBrowserPack,
  normalizedQuery: string,
): Uint32Array | null {
  if (!normalizedQuery || surface.runtimeSearchExactIndex.size <= 0) return null;
  const candidateIndices = surface.runtimeSearchExactIndex.get(normalizedQuery)
    ?? getRuntimeSearchPrefixCandidates(surface, normalizedQuery);
  if (!candidateIndices) return null;
  const normalizedMod = `${surface.modId ?? ""}`.trim().toLowerCase();
  const expanded = new Set(surface.expandedGroups);
  const collapsedSeen = new Set<string>();
  const projected: number[] = [];
  for (const browserIndex of candidateIndices) {
    const row = getNativeCompactBrowserRow(browserPack, browserIndex);
    if (!row) continue;
    const modId = `${browserPack.strings[row.modIdRef] ?? ""}`.trim().toLowerCase();
    if (normalizedMod && modId !== normalizedMod) continue;
    const groupKey = browserPack.strings[row.groupKeyRef] ?? "";
    const collapsedGroup = Boolean(groupKey) && !expanded.has(groupKey);
    if (collapsedGroup) {
      if (collapsedSeen.has(groupKey)) continue;
      collapsedSeen.add(groupKey);
    }
    projected.push(collapsedGroup ? (browserIndex | 0x80000000) >>> 0 : browserIndex >>> 0);
  }
  surface.runtimeBrowserWasmProjectedEntries = projected.length;
  return Uint32Array.from(projected);
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

function computeWasmRuntimeVisibleEntries(surface: SurfaceState, itemCount: number): Uint32Array | null {
  const projectVisible = wasmEngine?.neonei_engine_compact_browser_project_visible_indices;
  const projectSearchVisible = wasmEngine?.neonei_engine_compact_search_project_visible_indices;
  const allocU32 = wasmEngine?.neonei_engine_alloc_u32;
  const deallocU32 = wasmEngine?.neonei_engine_dealloc_u32;
  const memory = wasmEngine?.memory;
  if (!projectVisible || !allocU32 || !deallocU32 || !memory || surface.runtimeBrowserWasmPtr <= 0 || surface.runtimeBrowserWasmLen <= 0) {
    return null;
  }
  const outCapacity = Math.max(0, Math.floor(itemCount));
  if (outCapacity <= 0) return new Uint32Array();
  const query = writeWasmUtf8(surface.query);
  const mod = writeWasmUtf8(surface.modId ?? "");
  const expanded = writeWasmUtf8(surface.expandedGroups.join("\n"));
  const outPtr = allocU32(outCapacity);
  if (!outPtr) {
    freeWasmBytes(query);
    freeWasmBytes(mod);
    freeWasmBytes(expanded);
    return null;
  }
  try {
    const normalizedQuery = `${surface.query ?? ""}`.trim();
    const canUseSearchPack = normalizedQuery.length > 0
      && typeof projectSearchVisible === "function"
      && surface.runtimeSearchWasmPtr > 0
      && surface.runtimeSearchWasmLen > 0;
    const count = canUseSearchPack
      ? projectSearchVisible(
        surface.runtimeBrowserWasmPtr,
        surface.runtimeBrowserWasmLen,
        surface.runtimeSearchWasmPtr,
        surface.runtimeSearchWasmLen,
        query.ptr,
        query.len,
        mod.ptr,
        mod.len,
        expanded.ptr,
        expanded.len,
        outPtr,
        outCapacity,
      )
      : projectVisible(
        surface.runtimeBrowserWasmPtr,
        surface.runtimeBrowserWasmLen,
        query.ptr,
        query.len,
        mod.ptr,
        mod.len,
        expanded.ptr,
        expanded.len,
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
    freeWasmBytes(expanded);
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
  const normalizedQuery = `${surface.query ?? ""}`.trim().toLowerCase().replace(/\s+/g, "");
  const indexedVisibleEntries = computeIndexedRuntimeVisibleEntries(surface, browserPack, normalizedQuery);
  const visibleEntries = indexedVisibleEntries ?? computeWasmRuntimeVisibleEntries(surface, browserPack.itemCount);
  if (!visibleEntries) {
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
  const columns = computeNativeSurfaceColumns(wasmEngine, viewportWidth, cardSize, gap);
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
  if (surface.entries.length > 0) {
    return { source: "compat-entries", entries: surface.entries };
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
  const nativeLayout = computeWasmLayoutCommands(wasmEngine, activeEntries.length, viewportWidth, cardSize, gap);
  if (!nativeLayout) {
    surface.runtimeError = wasmError
      ? `WASM layout command writer unavailable: ${wasmError}`
      : "WASM layout command writer unavailable";
    surface.layoutCommands = [];
    return;
  }
  surface.layoutCommands = buildNativeSurfaceLayoutCommands(activeEntries, nativeLayout, cardSize);
  surface.runtimeError = null;
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
    : null;
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
    tooltip: {
      itemId: hit.itemId,
      publicItemId: surface.searchByItemId.get(hit.itemId)?.publicItemId ?? null,
      ...(surface.stringByItemId.get(hit.itemId) ?? {}),
      groupKey: hit.groupKey ?? surface.stringByItemId.get(hit.itemId)?.groupKey ?? null,
      groupLabel: surface.groupByKey.get(hit.groupKey ?? "")?.groupLabel
        ?? surface.stringByItemId.get(hit.itemId)?.groupLabel
        ?? null,
      groupSize: surface.groupByKey.get(hit.groupKey ?? "")?.groupSize ?? null,
    },
  };
  return surface.lastHit;
}

function buildMetrics(): NativeSurfaceEngineWorkerMetrics {
  const lastSurface = lastSurfaceId ? surfaces.get(lastSurfaceId) ?? null : null;
  return buildNativeSurfaceMetrics({
    surfaces: surfaces.values(),
    events,
    lastEvent,
    lastSurfaceId,
    lastSurface,
    wasmReady: Boolean(wasmEngine),
    wasmError,
  });
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
        const searchPack = message.packs.find((pack) => pack.name === "search");
        const stringPack = message.packs.find((pack) => pack.name === "stringsZhCn");
        const texturePack = message.packs.find((pack) => pack.name === "textures");
        const animationPack = message.packs.find((pack) => pack.name === "animations");
        disposeWasmPayloads(surface);
        surface.browserPack = browserPack ? parseNativeCompactBrowserPack(browserPack.buffer) : null;
        surface.runtimeBrowserIndexByItemId = buildRuntimeBrowserIndexByItemId(surface.browserPack);
        surface.groupByKey = groupPack ? parseNativeGroupPack(groupPack.buffer) : new Map();
        surface.searchByItemId = searchPack ? parseNativeSearchPack(searchPack.buffer) : new Map();
        surface.runtimeSearchExactIndex = buildRuntimeSearchExactIndex(surface.searchByItemId);
        surface.runtimeSearchSortedKeys = Array.from(surface.runtimeSearchExactIndex.keys()).sort();
        surface.runtimeSearchPrefixCache = new Map();
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
        surface.runtimeSearchExactIndex = new Map();
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
      applyNativeSurfaceMutation(surface, { type: "historyItems", itemIds: message.itemIds });
      break;
    case "compatEntries":
      if (applyNativeSurfaceMutation(surface, { type: "compatEntries", entries: message.entries })) rebuildLayout(surface);
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
      const spriteFrame = buildSpriteFrame(surface, surface.layoutCommands, message.nowMs, wasmEngine);
      surface.hasAnimatedSprites = spriteFrame.hasAnimatedSprites;
      surface.animatedSpriteCount = spriteFrame.animatedSpriteCount;
      surface.nextFrameDelayMs = spriteFrame.nextFrameDelayMs;
      return {
        type: "frame",
        id: message.id,
        surfaceId: message.surfaceId,
        drawCommands: surface.layoutCommands,
        spriteCommands: spriteFrame.spriteCommands,
        commandBuffer: buildLayoutCommandBuffer(surface.layoutCommands, surface.lastHit?.key ?? null, surface.selectedItemId),
        commandStride: NATIVE_SURFACE_LAYOUT_COMMAND_U32_STRIDE,
        commandCount: surface.layoutCommands.length,
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
        hit: hitTest(surface, message),
        metrics: buildMetrics(),
      };
    case "destroy":
      disposeWasmPayloads(surface);
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


