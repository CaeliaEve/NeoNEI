import type { SurfaceState } from "./nativeSurfaceWorkerState";

export type NativeWasmEngineExports = {
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
  neonei_engine_compact_browser_project_visible_indices_with_groups?: (
    browserPtr: number,
    browserLen: number,
    groupPtr: number,
    groupLen: number,
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
  neonei_engine_compact_search_project_visible_indices_with_groups?: (
    browserPtr: number,
    browserLen: number,
    searchPtr: number,
    searchLen: number,
    groupPtr: number,
    groupLen: number,
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

export async function ensureWasmEngine(): Promise<NativeWasmEngineExports | null> {
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

type NativeWasmDeallocate = (ptr: number, len: number) => void;

export function releaseNativeWasmPayloads(surface: SurfaceState, deallocate?: NativeWasmDeallocate): void {
  let firstError: unknown = null;
  const release = (ptr: number, len: number, reset: () => void) => {
    try {
      if (ptr > 0 && len > 0) deallocate?.(ptr, len);
    } catch (error) {
      firstError ??= error;
    } finally {
      reset();
    }
  };

  release(surface.runtimeBrowserWasmPtr, surface.runtimeBrowserWasmLen, () => {
    surface.runtimeBrowserWasmPtr = 0;
    surface.runtimeBrowserWasmLen = 0;
    surface.runtimeBrowserWasmItemCount = 0;
    surface.runtimeBrowserWasmProjectedEntries = 0;
  });
  release(surface.runtimeSearchWasmPtr, surface.runtimeSearchWasmLen, () => {
    surface.runtimeSearchWasmPtr = 0;
    surface.runtimeSearchWasmLen = 0;
  });
  release(surface.runtimeGroupWasmPtr, surface.runtimeGroupWasmLen, () => {
    surface.runtimeGroupWasmPtr = 0;
    surface.runtimeGroupWasmLen = 0;
    surface.runtimeGroupWasmCount = 0;
  });
  release(surface.runtimeStringWasmPtr, surface.runtimeStringWasmLen, () => {
    surface.runtimeStringWasmPtr = 0;
    surface.runtimeStringWasmLen = 0;
    surface.runtimeStringWasmItemCount = 0;
  });
  release(surface.runtimeTextureWasmPtr, surface.runtimeTextureWasmLen, () => {
    surface.runtimeTextureWasmPtr = 0;
    surface.runtimeTextureWasmLen = 0;
    surface.runtimeTextureWasmItemCount = 0;
  });
  release(surface.runtimeAnimationWasmPtr, surface.runtimeAnimationWasmLen, () => {
    surface.runtimeAnimationWasmPtr = 0;
    surface.runtimeAnimationWasmLen = 0;
    surface.runtimeAnimationWasmItemCount = 0;
  });
  if (firstError) throw firstError;
}

export function disposeWasmPayloads(surface: SurfaceState): void {
  releaseNativeWasmPayloads(surface, (ptr, len) => {
    wasmEngine?.neonei_engine_dealloc?.(ptr, len);
  });
}

export function installWasmBrowserPayload(surface: SurfaceState, payloadBuffer: ArrayBuffer): void {
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

export function installWasmSearchPayload(surface: SurfaceState, payloadBuffer: ArrayBuffer): void {
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


export function installWasmGroupPayload(surface: SurfaceState, payloadBuffer: ArrayBuffer): void {
  const ptr = installWasmPackPayload(payloadBuffer);
  if (!ptr) return;
  surface.runtimeGroupWasmPtr = ptr;
  surface.runtimeGroupWasmLen = payloadBuffer.byteLength;
  surface.runtimeGroupWasmCount = wasmEngine?.neonei_engine_compact_group_count?.(ptr, payloadBuffer.byteLength) ?? 0;
}

export function installWasmStringPayload(surface: SurfaceState, payloadBuffer: ArrayBuffer): void {
  const ptr = installWasmPackPayload(payloadBuffer);
  if (!ptr) return;
  surface.runtimeStringWasmPtr = ptr;
  surface.runtimeStringWasmLen = payloadBuffer.byteLength;
  surface.runtimeStringWasmItemCount = wasmEngine?.neonei_engine_compact_string_item_count?.(ptr, payloadBuffer.byteLength) ?? 0;
}

export function installWasmTexturePayload(surface: SurfaceState, payloadBuffer: ArrayBuffer): void {
  const ptr = installWasmPackPayload(payloadBuffer);
  if (!ptr) return;
  surface.runtimeTextureWasmPtr = ptr;
  surface.runtimeTextureWasmLen = payloadBuffer.byteLength;
  surface.runtimeTextureWasmItemCount = wasmEngine?.neonei_engine_compact_texture_item_count?.(ptr, payloadBuffer.byteLength) ?? 0;
}

export function installWasmAnimationPayload(surface: SurfaceState, payloadBuffer: ArrayBuffer): void {
  const ptr = installWasmPackPayload(payloadBuffer);
  if (!ptr) return;
  surface.runtimeAnimationWasmPtr = ptr;
  surface.runtimeAnimationWasmLen = payloadBuffer.byteLength;
  surface.runtimeAnimationWasmItemCount = wasmEngine?.neonei_engine_compact_animation_item_count?.(ptr, payloadBuffer.byteLength) ?? 0;
}

export function writeWasmUtf8(value: string): { ptr: number; len: number } {
  const alloc = wasmEngine?.neonei_engine_alloc;
  const memory = wasmEngine?.memory;
  const bytes = new TextEncoder().encode(value);
  if (!alloc || !memory || bytes.byteLength <= 0) return { ptr: 0, len: 0 };
  const ptr = alloc(bytes.byteLength);
  if (!ptr) return { ptr: 0, len: 0 };
  new Uint8Array(memory.buffer, ptr, bytes.byteLength).set(bytes);
  return { ptr, len: bytes.byteLength };
}

export function freeWasmBytes(bytes: { ptr: number; len: number }): void {
  if (bytes.ptr > 0 && bytes.len > 0) wasmEngine?.neonei_engine_dealloc?.(bytes.ptr, bytes.len);
}

export function computeWasmRuntimeVisibleEntries(surface: SurfaceState, itemCount: number): Uint32Array | null {
  const projectVisible = wasmEngine?.neonei_engine_compact_browser_project_visible_indices;
  const projectVisibleWithGroups = wasmEngine?.neonei_engine_compact_browser_project_visible_indices_with_groups;
  const projectSearchVisible = wasmEngine?.neonei_engine_compact_search_project_visible_indices;
  const projectSearchVisibleWithGroups = wasmEngine?.neonei_engine_compact_search_project_visible_indices_with_groups;
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
    const canUseSearchPackWithGroups = canUseSearchPack
      && typeof projectSearchVisibleWithGroups === "function"
      && surface.runtimeGroupWasmPtr > 0
      && surface.runtimeGroupWasmLen > 0;
    const canUseNativeGroupPack = typeof projectVisibleWithGroups === "function"
      && surface.runtimeGroupWasmPtr > 0
      && surface.runtimeGroupWasmLen > 0
      && !canUseSearchPack;
    const count = canUseSearchPackWithGroups
      ? projectSearchVisibleWithGroups(
        surface.runtimeBrowserWasmPtr,
        surface.runtimeBrowserWasmLen,
        surface.runtimeSearchWasmPtr,
        surface.runtimeSearchWasmLen,
        surface.runtimeGroupWasmPtr,
        surface.runtimeGroupWasmLen,
        query.ptr,
        query.len,
        mod.ptr,
        mod.len,
        expanded.ptr,
        expanded.len,
        outPtr,
        outCapacity,
      )
      : canUseSearchPack
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
      : canUseNativeGroupPack
        ? projectVisibleWithGroups(
          surface.runtimeBrowserWasmPtr,
          surface.runtimeBrowserWasmLen,
          surface.runtimeGroupWasmPtr,
          surface.runtimeGroupWasmLen,
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

export function getWasmEngine(): NativeWasmEngineExports | null {
  return wasmEngine;
}

export function getWasmError(): string | null {
  return wasmError;
}
