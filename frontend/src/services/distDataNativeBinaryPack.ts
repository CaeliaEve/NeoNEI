import {
  NATIVE_RUNTIME_PACK_HEADER_BYTES,
  NATIVE_RUNTIME_PACK_MAGIC,
  NATIVE_RUNTIME_PACK_VERSION,
} from "../native-surface/NativeRuntimeAbi.ts";

export type NativeBinaryPackEnvelope = {
  schema: string;
  payload: ArrayBuffer;
};

const textDecoder = new TextDecoder("utf-8");

export function decodeBinaryUtf8(buffer: ArrayBuffer, offset: number, length: number): string {
  return textDecoder.decode(new Uint8Array(buffer, offset, length));
}

export function decodeBinaryUtf8Bytes(bytes: Uint8Array): string {
  return textDecoder.decode(bytes);
}

export function parseNativeBinaryPackEnvelope(
  buffer: ArrayBuffer,
  expectedSchema: string,
): NativeBinaryPackEnvelope {
  if (buffer.byteLength < NATIVE_RUNTIME_PACK_HEADER_BYTES) {
    throw new Error(`Native binary pack is too small: ${buffer.byteLength}`);
  }
  const view = new DataView(buffer);
  const magic = decodeBinaryUtf8(buffer, 0, 8);
  const version = view.getUint32(8, true);
  const schemaLength = view.getUint32(12, true);
  const payloadLength = Number(view.getBigUint64(16, true));
  const schemaStart = NATIVE_RUNTIME_PACK_HEADER_BYTES;
  const schemaEnd = schemaStart + schemaLength;
  const payloadEnd = schemaEnd + payloadLength;
  if (magic !== NATIVE_RUNTIME_PACK_MAGIC) {
    throw new Error(`Native binary pack magic mismatch: ${magic}`);
  }
  if (version !== NATIVE_RUNTIME_PACK_VERSION) {
    throw new Error(`Native binary pack version mismatch: ${version}`);
  }
  if (schemaEnd > buffer.byteLength || payloadEnd !== buffer.byteLength) {
    throw new Error(`Native binary pack length mismatch: schema=${schemaLength}, payload=${payloadLength}, bytes=${buffer.byteLength}`);
  }
  const schema = decodeBinaryUtf8(buffer, schemaStart, schemaLength);
  if (schema !== expectedSchema) {
    throw new Error(`Native binary pack schema mismatch: expected ${expectedSchema}, got ${schema}`);
  }
  return { schema, payload: buffer.slice(schemaEnd, payloadEnd) };
}
