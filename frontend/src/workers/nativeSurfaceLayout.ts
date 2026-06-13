import type {
  NativeSurfaceEngineEntry,
  NativeSurfaceEngineLayoutCommand,
} from "../native-surface/NativeSurfaceEngineProtocol";
import { NATIVE_SURFACE_LAYOUT_COMMAND_U32_STRIDE } from "../native-surface/NativeSurfaceEngineProtocol";

export type NativeSurfaceLayoutWasmExports = {
  memory?: WebAssembly.Memory;
  neonei_engine_alloc_u32?: (len: number) => number;
  neonei_engine_dealloc_u32?: (ptr: number, len: number) => void;
  neonei_engine_compute_columns?: (viewportWidth: number, itemSize: number, gap: number) => number;
  neonei_engine_write_layout_commands?: (
    entryCount: number,
    viewportWidth: number,
    itemSize: number,
    gap: number,
    outPtr: number,
    outLen: number,
  ) => number;
};

export function toLayoutU32(value: number): number {
  return Math.max(0, Math.floor(Number(value) || 0));
}

export function computeNativeSurfaceColumns(
  wasmEngine: NativeSurfaceLayoutWasmExports | null,
  viewportWidth: number,
  cardSize: number,
  gap: number,
): number {
  const wasmColumns = wasmEngine?.neonei_engine_compute_columns?.(
    toLayoutU32(viewportWidth),
    toLayoutU32(cardSize),
    toLayoutU32(gap),
  );
  if (Number.isFinite(wasmColumns) && wasmColumns && wasmColumns > 0) {
    return Math.max(1, Math.floor(wasmColumns));
  }
  return Math.max(1, Math.floor((viewportWidth + gap) / (cardSize + gap)));
}

export function computeWasmLayoutCommands(
  wasmEngine: NativeSurfaceLayoutWasmExports | null,
  entryCount: number,
  viewportWidth: number,
  cardSize: number,
  gap: number,
): Uint32Array | null {
  const writeLayout = wasmEngine?.neonei_engine_write_layout_commands;
  const allocU32 = wasmEngine?.neonei_engine_alloc_u32;
  const deallocU32 = wasmEngine?.neonei_engine_dealloc_u32;
  const memory = wasmEngine?.memory;
  const count = Math.max(0, Math.floor(entryCount));
  if (!writeLayout || !allocU32 || !deallocU32 || !memory) return null;
  if (count <= 0) return new Uint32Array();
  const outLen = count * 7;
  const outPtr = allocU32(outLen);
  if (!outPtr) return null;
  try {
    const writtenCount = writeLayout(
      toLayoutU32(count),
      toLayoutU32(viewportWidth),
      toLayoutU32(cardSize),
      toLayoutU32(gap),
      outPtr,
      outLen,
    );
    const clampedCount = Math.min(count, Math.max(0, Math.floor(writtenCount)));
    return Uint32Array.from(new Uint32Array(memory.buffer, outPtr, clampedCount * 7));
  } finally {
    deallocU32(outPtr, outLen);
  }
}

export function buildNativeSurfaceLayoutCommands(
  activeEntries: NativeSurfaceEngineEntry[],
  nativeLayout: Uint32Array,
  cardSize: number,
): NativeSurfaceEngineLayoutCommand[] {
  return activeEntries.map((entry, index) => {
    const offset = index * 7;
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
}

export function buildLayoutCommandBuffer(
  commands: NativeSurfaceEngineLayoutCommand[],
  hoverKey: string | null,
  selectedItemId: string | null,
): ArrayBuffer {
  const stride = NATIVE_SURFACE_LAYOUT_COMMAND_U32_STRIDE;
  const values = new Uint32Array(commands.length * stride);
  commands.forEach((command, index) => {
    const offset = index * stride;
    values[offset] = toLayoutU32(command.entryIndex);
    values[offset + 1] = toLayoutU32(command.x);
    values[offset + 2] = toLayoutU32(command.y);
    values[offset + 3] = toLayoutU32(command.size);
    values[offset + 4] = toLayoutU32(command.iconX);
    values[offset + 5] = toLayoutU32(command.iconY);
    values[offset + 6] = toLayoutU32(command.iconSize);
    values[offset + 7] = command.kind === "item" ? 0 : command.kind === "group-collapsed" ? 1 : 2;
    values[offset + 8] = (command.kind === "group-collapsed" ? 1 : 0)
      | (command.kind === "group-header" ? 2 : 0)
      | (hoverKey === command.key ? 4 : 0)
      | (selectedItemId && command.itemId === selectedItemId ? 8 : 0)
      | (
        command.groupKey
        && command.kind === "item"
        && !command.key.startsWith("native-history:")
          ? 16
          : 0
      );
  });
  return values.buffer;
}
