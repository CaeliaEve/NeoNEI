export const NATIVE_BROWSER_COMPACT_MAGIC = "NEIBRW1\0";
export const NATIVE_BROWSER_COMPACT_VERSION = 1;
export const NATIVE_BROWSER_COMPACT_ROW_STRIDE = 6;

const COMPACT_BROWSER_HEADER_BYTES = 8 + 4 * 4;

export type NativeCompactBrowserRow = {
  itemIdRef: number;
  localizedNameRef: number;
  modIdRef: number;
  groupKeyRef: number;
  browserOrder: number;
  flags: number;
};

export type NativeCompactBrowserPack = {
  encoding: "compact-browser-table";
  version: 1;
  itemCount: number;
  stringCount: number;
  rowStride: 6;
  strings: string[];
  rows: Uint32Array;
};

function decodeAscii(bytes: Uint8Array): string {
  return new TextDecoder("utf-8").decode(bytes);
}

function readNullTerminatedString(bytes: Uint8Array, offset: number): string {
  if (offset < 0 || offset >= bytes.byteLength) return "";
  let end = offset;
  while (end < bytes.byteLength && bytes[end] !== 0) end += 1;
  return new TextDecoder("utf-8").decode(bytes.subarray(offset, end));
}

export function parseNativeCompactBrowserPack(payloadBuffer: ArrayBuffer): NativeCompactBrowserPack {
  if (payloadBuffer.byteLength < COMPACT_BROWSER_HEADER_BYTES) {
    throw new Error(`compact browser pack is too small: ${payloadBuffer.byteLength} bytes`);
  }

  const bytes = new Uint8Array(payloadBuffer);
  const view = new DataView(payloadBuffer);
  const magic = decodeAscii(bytes.subarray(0, 8));
  if (magic !== NATIVE_BROWSER_COMPACT_MAGIC) {
    throw new Error(`compact browser pack has invalid magic: ${magic}`);
  }

  const version = view.getUint32(8, true);
  const itemCount = view.getUint32(12, true);
  const stringCount = view.getUint32(16, true);
  const rowStride = view.getUint32(20, true);
  if (version !== NATIVE_BROWSER_COMPACT_VERSION) {
    throw new Error(`compact browser pack has invalid version: ${version}`);
  }
  if (rowStride !== NATIVE_BROWSER_COMPACT_ROW_STRIDE) {
    throw new Error(`compact browser pack has invalid row stride: ${rowStride}`);
  }

  const offsetsStart = COMPACT_BROWSER_HEADER_BYTES;
  const rowsStart = offsetsStart + stringCount * 4;
  const rowsBytes = itemCount * rowStride * 4;
  const stringTableStart = rowsStart + rowsBytes;
  if (stringTableStart > payloadBuffer.byteLength) {
    throw new Error(`compact browser pack exceeds payload bounds: rows=${itemCount}, strings=${stringCount}, bytes=${payloadBuffer.byteLength}`);
  }

  const stringTableBytes = bytes.subarray(stringTableStart);
  const strings: string[] = new Array(stringCount);
  for (let index = 0; index < stringCount; index += 1) {
    const offset = view.getUint32(offsetsStart + index * 4, true);
    if (offset >= stringTableBytes.byteLength && stringTableBytes.byteLength > 0) {
      throw new Error(`compact browser pack string offset is out of bounds: ${offset}`);
    }
    strings[index] = readNullTerminatedString(stringTableBytes, offset);
  }

  const rows = new Uint32Array(payloadBuffer, rowsStart, itemCount * rowStride);
  return {
    encoding: "compact-browser-table",
    version: 1,
    itemCount,
    stringCount,
    rowStride: 6,
    strings,
    rows,
  };
}

export function getNativeCompactBrowserRow(
  pack: NativeCompactBrowserPack,
  index: number,
): NativeCompactBrowserRow | null {
  if (index < 0 || index >= pack.itemCount) return null;
  const offset = index * pack.rowStride;
  return {
    itemIdRef: pack.rows[offset] ?? 0,
    localizedNameRef: pack.rows[offset + 1] ?? 0,
    modIdRef: pack.rows[offset + 2] ?? 0,
    groupKeyRef: pack.rows[offset + 3] ?? 0,
    browserOrder: pack.rows[offset + 4] ?? 0,
    flags: pack.rows[offset + 5] ?? 0,
  };
}

