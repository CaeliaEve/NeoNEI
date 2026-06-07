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
  selectedItemId: string | null;
  runtimeManifestUrl: string | null;
  runtimePacks: Map<string, ArrayBuffer>;
  runtimeError: string | null;
  browserPack: NativeCompactBrowserPack | null;
  groupByKey: Map<string, NativeRuntimeGroup>;
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
};

type NativeRuntimeGroup = {
  groupKey: string;
  groupLabel?: string | null;
  groupSize?: number | null;
  representativeItemId?: string | null;
  memberItemIds: string[];
};

type NativeRuntimeStringItem = {
  itemId: string;
  localizedName?: string | null;
  modId?: string | null;
  internalName?: string | null;
  groupKey?: string | null;
  groupLabel?: string | null;
};

type NativeRuntimeAtlasFrame = {
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

type NativeRuntimeTimelineFrame = {
  frameIndex: number;
  durationMs: number;
};

type NativeRuntimeTextureItem = {
  itemId: string;
  staticAtlas?: {
    atlasFile: string;
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
  animatedAtlas?: {
    atlasFile: string;
    frames: NativeRuntimeAtlasFrame[];
    timeline: NativeRuntimeTimelineFrame[];
    frameDurationMs: number | null;
  } | null;
};

type NativeRuntimeAnimationItem = {
  itemId: string;
  atlasFile?: string | null;
  timeline: NativeRuntimeTimelineFrame[];
  frameDurationMs: number | null;
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

const COMPACT_STRING_MAGIC = "NEISTR1\0";
const COMPACT_STRING_HEADER_BYTES = 8 + 4 * 4;
const COMPACT_STRING_ROW_STRIDE = 6;

function decodeAscii(bytes: Uint8Array): string {
  return new TextDecoder("utf-8").decode(bytes);
}

function readNullTerminatedString(bytes: Uint8Array, offset: number): string {
  if (offset < 0 || offset >= bytes.byteLength) return "";
  let end = offset;
  while (end < bytes.byteLength && bytes[end] !== 0) end += 1;
  return new TextDecoder("utf-8").decode(bytes.subarray(offset, end));
}

function parseCompactStringPack(payloadBuffer: ArrayBuffer): Map<string, NativeRuntimeStringItem> | null {
  if (payloadBuffer.byteLength < COMPACT_STRING_HEADER_BYTES) return null;
  const bytes = new Uint8Array(payloadBuffer);
  const magic = decodeAscii(bytes.subarray(0, 8));
  if (magic !== COMPACT_STRING_MAGIC) return null;

  const view = new DataView(payloadBuffer);
  const version = view.getUint32(8, true);
  const itemCount = view.getUint32(12, true);
  const stringCount = view.getUint32(16, true);
  const rowStride = view.getUint32(20, true);
  if (version !== 1 || rowStride !== COMPACT_STRING_ROW_STRIDE) {
    throw new Error(`compact string pack has invalid header: version=${version}, rowStride=${rowStride}`);
  }

  const offsetsStart = COMPACT_STRING_HEADER_BYTES;
  const rowsStart = offsetsStart + stringCount * 4;
  const rowsBytes = itemCount * rowStride * 4;
  const stringTableStart = rowsStart + rowsBytes;
  if (stringTableStart > payloadBuffer.byteLength) {
    throw new Error(`compact string pack exceeds payload bounds: rows=${itemCount}, strings=${stringCount}, bytes=${payloadBuffer.byteLength}`);
  }

  const stringTableBytes = bytes.subarray(stringTableStart);
  const strings: string[] = new Array(stringCount);
  for (let index = 0; index < stringCount; index += 1) {
    const offset = view.getUint32(offsetsStart + index * 4, true);
    strings[index] = readNullTerminatedString(stringTableBytes, offset);
  }

  const result = new Map<string, NativeRuntimeStringItem>();
  for (let index = 0; index < itemCount; index += 1) {
    const rowOffset = rowsStart + index * rowStride * 4;
    const itemId = strings[view.getUint32(rowOffset, true)] ?? "";
    if (!itemId) continue;
    result.set(itemId, {
      itemId,
      localizedName: strings[view.getUint32(rowOffset + 4, true)] ?? "",
      modId: strings[view.getUint32(rowOffset + 8, true)] ?? "",
      internalName: strings[view.getUint32(rowOffset + 12, true)] ?? "",
      groupKey: strings[view.getUint32(rowOffset + 16, true)] ?? "",
      groupLabel: strings[view.getUint32(rowOffset + 20, true)] ?? "",
    });
  }
  return result;
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

function parseNativeStringPack(payloadBuffer: ArrayBuffer): Map<string, NativeRuntimeStringItem> {
  const compact = parseCompactStringPack(payloadBuffer);
  if (compact) return compact;

  const pack = parseJsonPayload<{ items?: unknown[] }>(payloadBuffer);
  const strings = new Map<string, NativeRuntimeStringItem>();
  for (const row of pack?.items ?? []) {
    if (!row || typeof row !== "object") continue;
    const value = row as Record<string, unknown>;
    const itemId = `${value.itemId ?? ""}`.trim();
    if (!itemId) continue;
    strings.set(itemId, {
      itemId,
      localizedName: typeof value.localizedName === "string" ? value.localizedName : null,
      modId: typeof value.modId === "string" ? value.modId : null,
      internalName: typeof value.internalName === "string" ? value.internalName : null,
      groupKey: typeof value.groupKey === "string" ? value.groupKey : null,
      groupLabel: typeof value.groupLabel === "string" ? value.groupLabel : null,
    });
  }
  return strings;
}

function toFiniteNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function normalizeAtlasFile(value: unknown): string | null {
  const normalized = `${value ?? ""}`.trim().replace(/\\/g, "/").replace(/^\/+/, "");
  return normalized || null;
}

function parseAtlasFrames(value: unknown): NativeRuntimeAtlasFrame[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((frame, index) => {
      const compact = Array.isArray(frame) ? frame as unknown[] : null;
      const record = frame && typeof frame === "object" && !Array.isArray(frame) ? frame as Record<string, unknown> : {};
      return {
        index: Math.max(0, Math.floor(toFiniteNumber(compact?.[0] ?? record.index, index))),
        x: Math.max(0, Math.floor(toFiniteNumber(compact?.[1] ?? record.x, 0))),
        y: Math.max(0, Math.floor(toFiniteNumber(compact?.[2] ?? record.y, 0))),
        width: Math.max(0, Math.floor(toFiniteNumber(compact?.[3] ?? record.width, 0))),
        height: Math.max(0, Math.floor(toFiniteNumber(compact?.[4] ?? record.height, 0))),
      };
    })
    .filter((frame) => frame.width > 0 && frame.height > 0);
}

function parseTimeline(value: unknown, fallbackDurationMs?: unknown): NativeRuntimeTimelineFrame[] {
  if (!Array.isArray(value)) return [];
  const fallbackDuration = Math.max(16, Math.floor(toFiniteNumber(fallbackDurationMs, 50)));
  return value
    .map((frame, index) => {
      const compact = Array.isArray(frame) ? frame as unknown[] : null;
      const record = frame && typeof frame === "object" && !Array.isArray(frame) ? frame as Record<string, unknown> : {};
      return {
        frameIndex: Math.max(0, Math.floor(toFiniteNumber(compact?.[0] ?? record.frameIndex ?? record.index, index))),
        durationMs: Math.max(16, Math.floor(toFiniteNumber(compact?.[1] ?? record.durationMs, fallbackDuration))),
      };
    });
}

function parseNativeTexturePack(payloadBuffer: ArrayBuffer): Map<string, NativeRuntimeTextureItem> {
  const pack = parseJsonPayload<{ atlasMap?: Record<string, unknown>; atlas?: { items?: unknown[] } }>(payloadBuffer);
  const rows: unknown[] = [];
  if (pack?.atlasMap && typeof pack.atlasMap === "object") rows.push(...Object.values(pack.atlasMap));
  if (Array.isArray(pack?.atlas?.items)) rows.push(...pack.atlas.items);
  const textures = new Map<string, NativeRuntimeTextureItem>();
  for (const row of rows) {
    const record = row && typeof row === "object" ? row as Record<string, unknown> : null;
    if (!record) continue;
    const atlasRecord = record.atlas && typeof record.atlas === "object" ? record.atlas as Record<string, unknown> : record;
    const itemId = `${record.itemId ?? atlasRecord.itemId ?? ""}`.trim();
    if (!itemId || textures.has(itemId)) continue;
    const staticAtlas = atlasRecord.staticAtlas && typeof atlasRecord.staticAtlas === "object"
      ? atlasRecord.staticAtlas as Record<string, unknown>
      : null;
    const animatedAtlas = atlasRecord.animatedAtlas && typeof atlasRecord.animatedAtlas === "object"
      ? atlasRecord.animatedAtlas as Record<string, unknown>
      : null;
    textures.set(itemId, {
      itemId,
      staticAtlas: staticAtlas ? {
        atlasFile: normalizeAtlasFile(staticAtlas.atlasFile) ?? "",
        x: Math.max(0, Math.floor(toFiniteNumber(staticAtlas.x, 0))),
        y: Math.max(0, Math.floor(toFiniteNumber(staticAtlas.y, 0))),
        width: Math.max(0, Math.floor(toFiniteNumber(staticAtlas.width, 0))),
        height: Math.max(0, Math.floor(toFiniteNumber(staticAtlas.height, 0))),
      } : null,
      animatedAtlas: animatedAtlas ? {
        atlasFile: normalizeAtlasFile(animatedAtlas.atlasFile) ?? "",
        frames: parseAtlasFrames(animatedAtlas.frames),
        timeline: parseTimeline(animatedAtlas.timeline, animatedAtlas.frameDurationMs),
        frameDurationMs: toFiniteNumber(animatedAtlas.frameDurationMs, 0) || null,
      } : null,
    });
  }
  return textures;
}

function parseNativeAnimationPack(payloadBuffer: ArrayBuffer): Map<string, NativeRuntimeAnimationItem> {
  const pack = parseJsonPayload<{ animations?: unknown[] }>(payloadBuffer);
  const animations = new Map<string, NativeRuntimeAnimationItem>();
  for (const row of pack?.animations ?? []) {
    const record = row && typeof row === "object" ? row as Record<string, unknown> : null;
    if (!record) continue;
    const itemId = `${record.itemId ?? ""}`.trim();
    if (!itemId) continue;
    animations.set(itemId, {
      itemId,
      atlasFile: normalizeAtlasFile(record.atlasFile),
      timeline: parseTimeline(record.timeline, record.frameDurationMs),
      frameDurationMs: toFiniteNumber(record.frameDurationMs, 0) || null,
    });
  }
  return animations;
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
    const count = projectVisible(
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
  const visibleEntries = computeWasmRuntimeVisibleEntries(surface, browserPack.itemCount);
  if (!visibleEntries) {
    surface.runtimeError = wasmError
      ? `WASM/browser visible projection unavailable: ${wasmError}`
      : "WASM/browser visible projection unavailable";
    surface.runtimeVisibleCacheKey = cacheKey;
    surface.runtimeVisibleEntries = new Uint32Array();
    surface.runtimeBrowserWasmProjectedEntries = 0;
    return surface.runtimeVisibleEntries;
  }
  surface.runtimeVisibleCacheKey = cacheKey;
  surface.runtimeVisibleEntries = visibleEntries;
  surface.runtimeError = null;
  return visibleEntries;
}

function buildRuntimeEntries(surface: SurfaceState): NativeSurfaceEngineEntry[] {
  const browserPack = surface.browserPack;
  if (!browserPack) return [];
  const projectionIndices = getRuntimeVisibleEntries(surface, browserPack);
  const emittedCollapsedGroups = new Set<string>();
  const projected: NativeSurfaceEngineEntry[] = [];
  for (let projectionIndex = 0; projectionIndex < projectionIndices.length; projectionIndex += 1) {
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
    selectedItemId: null,
    runtimeManifestUrl: null,
    runtimePacks: new Map(),
    runtimeError: null,
    browserPack: null,
    groupByKey: new Map(),
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

function pickTimelineFrame(
  frames: NativeRuntimeAtlasFrame[],
  timeline: NativeRuntimeTimelineFrame[],
  nowMs: number,
): NativeRuntimeAtlasFrame | null {
  if (frames.length <= 0) return null;
  if (timeline.length <= 0) return frames[0] ?? null;
  const totalDuration = timeline.reduce((sum, frame) => sum + Math.max(16, frame.durationMs), 0);
  if (totalDuration <= 0) return frames[0] ?? null;
  let cursor = Math.floor(nowMs) % totalDuration;
  let selectedFrameIndex = timeline[0]?.frameIndex ?? 0;
  for (const frame of timeline) {
    const duration = Math.max(16, frame.durationMs);
    if (cursor < duration) {
      selectedFrameIndex = frame.frameIndex;
      break;
    }
    cursor -= duration;
  }
  return frames.find((frame) => frame.index === selectedFrameIndex)
    ?? frames[selectedFrameIndex]
    ?? frames[0]
    ?? null;
}

function buildSpriteCommands(
  surface: SurfaceState,
  commands: NativeSurfaceEngineLayoutCommand[],
  nowMs: number,
): NativeSurfaceEngineSpriteCommand[] {
  const sprites: NativeSurfaceEngineSpriteCommand[] = [];
  for (const command of commands) {
    if (!command.itemId) continue;
    const texture = surface.textureByItemId.get(command.itemId);
    if (!texture) continue;
    const animation = surface.animationByItemId.get(command.itemId);
    const animatedAtlas = texture.animatedAtlas;
    if (animatedAtlas?.atlasFile && animatedAtlas.frames.length > 0) {
      const frame = pickTimelineFrame(
        animatedAtlas.frames,
        animation?.timeline?.length ? animation.timeline : animatedAtlas.timeline,
        nowMs,
      );
      if (frame) {
        sprites.push({
          textureKey: animation?.atlasFile || animatedAtlas.atlasFile,
          sourceX: frame.x,
          sourceY: frame.y,
          sourceWidth: frame.width,
          sourceHeight: frame.height,
          destX: command.iconX,
          destY: command.iconY,
          destWidth: command.iconSize,
          destHeight: command.iconSize,
        });
        continue;
      }
    }
    const staticAtlas = texture.staticAtlas;
    if (staticAtlas?.atlasFile && staticAtlas.width > 0 && staticAtlas.height > 0) {
      sprites.push({
        textureKey: staticAtlas.atlasFile,
        sourceX: staticAtlas.x,
        sourceY: staticAtlas.y,
        sourceWidth: staticAtlas.width,
        sourceHeight: staticAtlas.height,
        destX: command.iconX,
        destY: command.iconY,
        destWidth: command.iconSize,
        destHeight: command.iconSize,
      });
    }
  }
  return sprites;
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
    tooltip: {
      itemId: hit.itemId,
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
      return false;
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
    nativeBrowserStrings: lastSurface?.stringByItemId.size ?? lastSurface?.browserPack?.stringCount ?? 0,
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
        const stringPack = message.packs.find((pack) => pack.name === "stringsZhCn");
        const texturePack = message.packs.find((pack) => pack.name === "textures");
        const animationPack = message.packs.find((pack) => pack.name === "animations");
        disposeWasmBrowserPayload(surface);
        surface.browserPack = browserPack ? parseNativeCompactBrowserPack(browserPack.buffer) : null;
        surface.groupByKey = groupPack ? parseNativeGroupPack(groupPack.buffer) : new Map();
        surface.stringByItemId = stringPack ? parseNativeStringPack(stringPack.buffer) : new Map();
        surface.textureByItemId = texturePack ? parseNativeTexturePack(texturePack.buffer) : new Map();
        surface.animationByItemId = animationPack ? parseNativeAnimationPack(animationPack.buffer) : new Map();
        if (browserPack) installWasmBrowserPayload(surface, browserPack.buffer);
        surface.runtimeProjectionCacheKey = null;
        surface.runtimeProjectionIndices = null;
        surface.runtimeVisibleCacheKey = null;
        surface.runtimeVisibleEntries = null;
        surface.runtimeError = null;
      } catch (error) {
        disposeWasmBrowserPayload(surface);
        surface.browserPack = null;
        surface.groupByKey = new Map();
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
      rebuildLayout(surface);
      return {
        type: "frame",
        id: message.id,
        surfaceId: message.surfaceId,
        drawCommands: surface.layoutCommands,
        spriteCommands: buildSpriteCommands(surface, surface.layoutCommands, message.nowMs),
        commandBuffer: buildLayoutCommandBuffer(surface.layoutCommands, surface.lastHit?.key ?? null, surface.selectedItemId),
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






