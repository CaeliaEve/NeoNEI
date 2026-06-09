import type {
  NativeSurfaceEngineRequest,
  NativeSurfaceEngineResponse,
  NativeSurfaceEngineEntry,
  NativeSurfaceEngineHit,
  NativeSurfaceEngineLayoutCommand,
  NativeSurfaceEngineMutation,
  NativeSurfaceEngineSpriteCommand,
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
import {
  buildSpriteFrame,
  type NativeRuntimeAnimationItem,
  type NativeRuntimeAtlasFrame,
  type NativeRuntimeTextureItem,
  type NativeRuntimeTimelineFrame,
} from "./nativeSurfaceSpriteTimeline";
import {
  parseNativeAnimationPack,
  parseNativeGroupPack,
  parseNativeSearchPack,
  parseNativeStringPack,
  parseNativeTexturePack,
  type NativeRuntimeGroup,
  type NativeRuntimeSearchItem,
  type NativeRuntimeStringItem,
} from "./nativeSurfaceRuntimeParsers";

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
  layoutRebuilds: number;
  frameRequests: number;
  lastHit: NativeSurfaceEngineHit;
  selectedItemId: string | null;
  runtimeManifestUrl: string | null;
  runtimePacks: Map<string, ArrayBuffer>;
  runtimeError: string | null;
  browserPack: NativeCompactBrowserPack | null;
  runtimeBrowserIndexByItemId: Map<string, number>;
  groupByKey: Map<string, NativeRuntimeGroup>;
  searchByItemId: Map<string, NativeRuntimeSearchItem>;
  runtimeSearchExactIndex: Map<string, Uint32Array>;
  runtimeSearchSortedKeys: string[];
  runtimeSearchPrefixCache: Map<string, Uint32Array>;
  stringByItemId: Map<string, NativeRuntimeStringItem>;
  textureByItemId: Map<string, NativeRuntimeTextureItem>;
  animationByItemId: Map<string, NativeRuntimeAnimationItem>;
  runtimeProjectionCacheKey: string | null;
  runtimeProjectionIndices: Uint32Array | null;
  runtimeVisibleCacheKey: string | null;
  runtimeVisibleEntries: Uint32Array | null;
  runtimeBrowserWasmPtr: number;
  runtimeBrowserWasmLen: number;
  runtimeBrowserWasmItemCount: number;
  runtimeBrowserWasmProjectedEntries: number;
  currentPageSize: number;
  currentWindowEntries: number;
  lastProjectionMs: number;
  lastProjectionTotalEntries: number;
  lastProjectionQuery: string;
  lastProjectionSource: "browser" | "search" | "empty";
  runtimeSearchWasmPtr: number;
  runtimeSearchWasmLen: number;
  runtimeGroupWasmPtr: number;
  runtimeGroupWasmLen: number;
  runtimeGroupWasmCount: number;
  runtimeStringWasmPtr: number;
  runtimeStringWasmLen: number;
  runtimeStringWasmItemCount: number;
  runtimeTextureWasmPtr: number;
  runtimeTextureWasmLen: number;
  runtimeTextureWasmItemCount: number;
  runtimeAnimationWasmPtr: number;
  runtimeAnimationWasmLen: number;
  runtimeAnimationWasmItemCount: number;
  hasAnimatedSprites: boolean;
  animatedSpriteCount: number;
  nextFrameDelayMs: number | null;
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

function computeColumns(viewportWidth: number, cardSize: number, gap: number): number {
  const wasmColumns = wasmEngine?.neonei_engine_compute_columns(toU32(viewportWidth), toU32(cardSize), toU32(gap));
  if (Number.isFinite(wasmColumns) && wasmColumns && wasmColumns > 0) return Math.max(1, Math.floor(wasmColumns));
  return Math.max(1, Math.floor((viewportWidth + gap) / (cardSize + gap)));
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

function normalizeRuntimeSearchKey(value: unknown): string {
  return `${value ?? ""}`.trim().toLowerCase().replace(/\s+/g, "");
}

function addRuntimeSearchIndexCandidate(
  index: Map<string, number[]>,
  key: string,
  browserIndex: number,
): void {
  const normalized = normalizeRuntimeSearchKey(key);
  if (!normalized) return;
  const list = index.get(normalized);
  if (list) {
    list.push(browserIndex);
    return;
  }
  index.set(normalized, [browserIndex]);
}

function dedupeRuntimeSearchIndex(index: Map<string, number[]>): Map<string, Uint32Array> {
  const result = new Map<string, Uint32Array>();
  for (const [key, values] of index) {
    values.sort((left, right) => left - right);
    const unique: number[] = [];
    let previous = -1;
    for (const value of values) {
      if (value === previous) continue;
      unique.push(value);
      previous = value;
    }
    result.set(key, Uint32Array.from(unique));
  }
  return result;
}

function buildRuntimeSearchExactIndex(searchByItemId: Map<string, NativeRuntimeSearchItem>): Map<string, Uint32Array> {
  const exactIndex = new Map<string, number[]>();
  const addKey = (key: unknown, browserIndex: number): void => {
    addRuntimeSearchIndexCandidate(exactIndex, `${key ?? ""}`, browserIndex);
  };
  for (const item of searchByItemId.values()) {
    const browserIndex = Math.max(0, Math.floor(Number(item.browserIndex) || 0));
    addKey(item.itemId, browserIndex);
    addKey(item.publicItemId, browserIndex);
    addKey(item.localizedName, browserIndex);
    addKey(item.modId, browserIndex);
    addKey(item.normalizedLocalizedName, browserIndex);
    addKey(item.normalizedInternalName, browserIndex);
    addKey(item.normalizedItemId, browserIndex);
    addKey(item.pinyinFull, browserIndex);
    addKey(item.pinyinAcronym, browserIndex);
    for (const token of `${item.normalizedSearchTerms ?? ""}`.split(/[|,;\s]+/)) {
      addKey(token, browserIndex);
    }
  }
  return dedupeRuntimeSearchIndex(exactIndex);
}

function lowerBoundRuntimeSearchKey(keys: string[], target: string): number {
  let left = 0;
  let right = keys.length;
  while (left < right) {
    const middle = (left + right) >>> 1;
    if ((keys[middle] ?? "") < target) left = middle + 1;
    else right = middle;
  }
  return left;
}

function getRuntimeSearchPrefixCandidates(surface: SurfaceState, normalizedQuery: string): Uint32Array | null {
  const cached = surface.runtimeSearchPrefixCache.get(normalizedQuery);
  if (cached) return cached;
  if (surface.runtimeSearchSortedKeys.length <= 0) return null;
  const merged: number[] = [];
  const seen = new Set<number>();
  for (
    let index = lowerBoundRuntimeSearchKey(surface.runtimeSearchSortedKeys, normalizedQuery);
    index < surface.runtimeSearchSortedKeys.length;
    index += 1
  ) {
    const key = surface.runtimeSearchSortedKeys[index] ?? "";
    if (!key.startsWith(normalizedQuery)) break;
    const candidates = surface.runtimeSearchExactIndex.get(key);
    if (!candidates) continue;
    for (const candidate of candidates) {
      if (seen.has(candidate)) continue;
      seen.add(candidate);
      merged.push(candidate);
    }
  }
  if (merged.length <= 0) return null;
  merged.sort((left, right) => left - right);
  const compact = Uint32Array.from(merged);
  surface.runtimeSearchPrefixCache.set(normalizedQuery, compact);
  return compact;
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
  const columns = computeColumns(viewportWidth, cardSize, gap);
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

function buildRuntimeBrowserIndexByItemId(browserPack: NativeCompactBrowserPack | null): Map<string, number> {
  const indexByItemId = new Map<string, number>();
  if (!browserPack) return indexByItemId;
  for (let index = 0; index < browserPack.itemCount; index += 1) {
    const row = getNativeCompactBrowserRow(browserPack, index);
    if (!row) continue;
    const itemId = browserPack.strings[row.itemIdRef] ?? "";
    if (itemId && !indexByItemId.has(itemId)) {
      indexByItemId.set(itemId, index);
    }
  }
  return indexByItemId;
}

function buildRuntimeHistoryEntries(surface: SurfaceState): NativeSurfaceEngineEntry[] {
  const browserPack = surface.browserPack;
  if (!browserPack || surface.historyItems.length <= 0) return [];
  const projected: NativeSurfaceEngineEntry[] = [];
  for (const itemId of surface.historyItems) {
    const index = surface.runtimeBrowserIndexByItemId.get(itemId);
    if (index === undefined) continue;
    const row = getNativeCompactBrowserRow(browserPack, index);
    if (!row) continue;
    const groupKey = browserPack.strings[row.groupKeyRef] ?? "";
    projected.push({
      key: `native-history:${itemId}:${projected.length}`,
      kind: "item",
      entryIndex: projected.length,
      itemId,
      groupKey: groupKey || null,
    });
  }
  return projected;
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
    layoutRebuilds: 0,
    frameRequests: 0,
    lastHit: null,
    selectedItemId: null,
    runtimeManifestUrl: null,
    runtimePacks: new Map(),
    runtimeError: null,
    browserPack: null,
    runtimeBrowserIndexByItemId: new Map(),
    groupByKey: new Map(),
    searchByItemId: new Map(),
    runtimeSearchExactIndex: new Map(),
    runtimeSearchSortedKeys: [],
    runtimeSearchPrefixCache: new Map(),
    stringByItemId: new Map(),
    textureByItemId: new Map(),
    animationByItemId: new Map(),
    runtimeProjectionCacheKey: null,
    runtimeProjectionIndices: null,
    runtimeVisibleCacheKey: null,
    runtimeVisibleEntries: null,
    runtimeBrowserWasmPtr: 0,
    runtimeBrowserWasmLen: 0,
    runtimeBrowserWasmItemCount: 0,
    runtimeBrowserWasmProjectedEntries: 0,
    currentPageSize: 0,
    currentWindowEntries: 0,
    lastProjectionMs: 0,
    lastProjectionTotalEntries: 0,
    lastProjectionQuery: "",
    lastProjectionSource: "empty",
    runtimeSearchWasmPtr: 0,
    runtimeSearchWasmLen: 0,
    runtimeGroupWasmPtr: 0,
    runtimeGroupWasmLen: 0,
    runtimeGroupWasmCount: 0,
    runtimeStringWasmPtr: 0,
    runtimeStringWasmLen: 0,
    runtimeStringWasmItemCount: 0,
    runtimeTextureWasmPtr: 0,
    runtimeTextureWasmLen: 0,
    runtimeTextureWasmItemCount: 0,
    runtimeAnimationWasmPtr: 0,
    runtimeAnimationWasmLen: 0,
    runtimeAnimationWasmItemCount: 0,
    hasAnimatedSprites: false,
    animatedSpriteCount: 0,
    nextFrameDelayMs: null,
  };
  surfaces.set(surfaceId, next);
  return next;
}

const WASM_LAYOUT_COMMAND_U32_STRIDE = 7;

function computeWasmLayoutCommands(entryCount: number, viewportWidth: number, cardSize: number, gap: number): Uint32Array | null {
  const writeLayout = wasmEngine?.neonei_engine_write_layout_commands;
  const allocU32 = wasmEngine?.neonei_engine_alloc_u32;
  const deallocU32 = wasmEngine?.neonei_engine_dealloc_u32;
  const memory = wasmEngine?.memory;
  const count = Math.max(0, Math.floor(entryCount));
  if (!writeLayout || !allocU32 || !deallocU32 || !memory) return null;
  if (count <= 0) return new Uint32Array();
  const outLen = count * WASM_LAYOUT_COMMAND_U32_STRIDE;
  const outPtr = allocU32(outLen);
  if (!outPtr) return null;
  try {
    const writtenCount = writeLayout(
      toU32(count),
      toU32(viewportWidth),
      toU32(cardSize),
      toU32(gap),
      outPtr,
      outLen,
    );
    const clampedCount = Math.min(count, Math.max(0, Math.floor(writtenCount)));
    return Uint32Array.from(new Uint32Array(memory.buffer, outPtr, clampedCount * WASM_LAYOUT_COMMAND_U32_STRIDE));
  } finally {
    deallocU32(outPtr, outLen);
  }
}

function rebuildLayout(surface: SurfaceState): void {
  surface.layoutRebuilds += 1;
  const activeEntries = getActiveEntries(surface).entries;
  const viewportWidth = Math.max(1, Math.floor(surface.viewport?.width ?? 1));
  const cardSize = Math.max(1, Math.floor(surface.itemSize || 44));
  const gap = 4;
  const nativeLayout = computeWasmLayoutCommands(activeEntries.length, viewportWidth, cardSize, gap);
  if (!nativeLayout) {
    surface.runtimeError = wasmError
      ? `WASM layout command writer unavailable: ${wasmError}`
      : "WASM layout command writer unavailable";
    surface.layoutCommands = [];
    return;
  }
  surface.layoutCommands = activeEntries.map((entry, index) => {
    const offset = index * WASM_LAYOUT_COMMAND_U32_STRIDE;
    const x = nativeLayout[offset + 1] ?? 0;
    const y = nativeLayout[offset + 2] ?? 0;
    const size = nativeLayout[offset + 3] ?? cardSize;
    const iconX = nativeLayout[offset + 4] ?? x;
    const iconY = nativeLayout[offset + 5] ?? y;
    const iconSize = nativeLayout[offset + 6] ?? size;
    return {
      key: entry.key,
      kind: entry.kind,
      entryIndex: entry.entryIndex,
      itemId: entry.itemId,
      groupKey: entry.groupKey ?? null,
      x,
      y,
      size,
      iconX,
      iconY,
      iconSize,
    };
  });
  surface.runtimeError = null;
}

function buildLayoutCommandBuffer(
  commands: NativeSurfaceEngineLayoutCommand[],
  hoverKey: string | null,
  selectedItemId: string | null,
): ArrayBuffer {
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
    values[offset + 8] = (command.kind === "group-collapsed" ? 1 : 0)
      | (command.kind === "group-header" ? 2 : 0)
      | (hoverKey === command.key ? 4 : 0)
      | (selectedItemId && command.itemId === selectedItemId ? 8 : 0);
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

function applyMutation(surface: SurfaceState, mutation: NativeSurfaceEngineMutation): boolean {
  switch (mutation.type) {
    case "viewport":
      surface.viewport = mutation.viewport;
      return true;
    case "page":
      surface.page = Math.max(1, Math.floor(Number(mutation.page) || 1));
      return true;
    case "search": {
      const nextQuery = `${mutation.query ?? ""}`;
      if (surface.query !== nextQuery) {
        surface.query = nextQuery;
        surface.runtimeProjectionCacheKey = null;
      }
      return true;
    }
    case "modFilter": {
      const nextModId = mutation.modId ? `${mutation.modId}` : null;
      if (surface.modId !== nextModId) {
        surface.modId = nextModId;
        surface.runtimeProjectionCacheKey = null;
      }
      return true;
    }
    case "expandedGroups":
      surface.expandedGroups = Array.from(new Set(mutation.groupKeys));
      return true;
    case "historyItems":
      surface.historyItems = Array.from(new Set(mutation.itemIds));
      return true;
    case "compatEntries":
      surface.entries = mutation.entries;
      return true;
    case "itemSize":
      surface.itemSize = Math.max(1, Math.floor(Number(mutation.itemSize) || 1));
      return true;
    case "selectedItem":
      surface.selectedItemId = mutation.itemId ? `${mutation.itemId}` : null;
      return true;
  }
}

function getProjectionSourceForMetrics(surface: SurfaceState | null): NativeSurfaceEngineWorkerMetrics["projectionSource"] {
  if (!surface) return "empty";
  if (surface.browserPack) return surface.enableHistoryViewport ? "runtime-history-pack" : "runtime-browser-pack";
  if (surface.entries.length > 0) return "compat-entries";
  return "empty";
}

function buildMetrics(): NativeSurfaceEngineWorkerMetrics {
  const lastSurface = lastSurfaceId ? surfaces.get(lastSurfaceId) : null;
  const projectionSource = getProjectionSourceForMetrics(lastSurface);
  return {
    initializedSurfaces: Array.from(surfaces.values()).filter((surface) => surface.initialized).length,
    events,
    lastEvent,
    lastSurfaceId,
    layoutCommands: lastSurface?.layoutCommands.length ?? 0,
    layoutRebuilds: lastSurface?.layoutRebuilds ?? 0,
    frameRequests: lastSurface?.frameRequests ?? 0,
    lastHit: lastSurface?.lastHit ?? null,
    wasmReady: Boolean(wasmEngine),
    wasmError,
    runtimeReady: Boolean(lastSurface?.runtimePacks.size),
    runtimePacks: lastSurface?.runtimePacks.size ?? 0,
    runtimeError: lastSurface?.runtimeError ?? null,
    projectionSource,
    nativeBrowserEntries: lastSurface?.browserPack?.itemCount ?? 0,
    nativeBrowserProjectedEntries: lastSurface?.runtimeVisibleEntries?.length ?? 0,
    nativeBrowserWasmEntries: lastSurface?.runtimeBrowserWasmItemCount ?? 0,
    nativeBrowserWasmProjectedEntries: lastSurface?.runtimeBrowserWasmProjectedEntries ?? 0,
    nativeGroupWasmEntries: lastSurface?.runtimeGroupWasmCount ?? 0,
    nativeStringWasmEntries: lastSurface?.runtimeStringWasmItemCount ?? 0,
    nativeTextureWasmEntries: lastSurface?.runtimeTextureWasmItemCount ?? 0,
    nativeAnimationWasmEntries: lastSurface?.runtimeAnimationWasmItemCount ?? 0,
    nativeBrowserStrings: lastSurface?.stringByItemId.size ?? lastSurface?.browserPack?.stringCount ?? 0,
    currentPage: lastSurface?.page ?? 1,
    currentQuery: lastSurface?.query ?? "",
    currentModFilter: lastSurface?.modId ?? null,
    currentPageSize: lastSurface?.currentPageSize ?? 0,
    currentWindowEntries: lastSurface?.currentWindowEntries ?? 0,
    lastProjectionMs: lastSurface?.lastProjectionMs ?? 0,
    lastProjectionTotalEntries: lastSurface?.lastProjectionTotalEntries ?? 0,
    lastProjectionQuery: lastSurface?.lastProjectionQuery ?? "",
    lastProjectionSource: lastSurface?.lastProjectionSource ?? "empty",
    hasAnimatedSprites: lastSurface?.hasAnimatedSprites ?? false,
    animatedSpriteCount: lastSurface?.animatedSpriteCount ?? 0,
    nextFrameDelayMs: lastSurface?.nextFrameDelayMs ?? null,
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
      if (applyMutation(surface, { type: "viewport", viewport: message.viewport })) rebuildLayout(surface);
      break;
    case "page":
      if (applyMutation(surface, { type: "page", page: message.page })) rebuildLayout(surface);
      break;
    case "search":
      if (applyMutation(surface, { type: "search", query: message.query })) rebuildLayout(surface);
      break;
    case "modFilter":
      if (applyMutation(surface, { type: "modFilter", modId: message.modId })) rebuildLayout(surface);
      break;
    case "expandedGroups":
      if (applyMutation(surface, { type: "expandedGroups", groupKeys: message.groupKeys })) rebuildLayout(surface);
      break;
    case "historyItems":
      applyMutation(surface, { type: "historyItems", itemIds: message.itemIds });
      break;
    case "compatEntries":
      if (applyMutation(surface, { type: "compatEntries", entries: message.entries })) rebuildLayout(surface);
      break;
    case "itemSize":
      if (applyMutation(surface, { type: "itemSize", itemSize: message.itemSize })) rebuildLayout(surface);
      break;
    case "mutationBatch": {
      let needsLayout = false;
      for (const mutation of message.mutations) {
        needsLayout = applyMutation(surface, mutation) || needsLayout;
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
