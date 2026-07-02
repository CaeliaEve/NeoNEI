/**
 * Backend native runtime binary pack ABI catalog.
 *
 * Runtime consumers must parse the compiler-produced NNEIBIN envelope through
 * this fail-closed contract instead of embedding pack header details in each
 * service or accepting historical raw payloads.
 */

export const NATIVE_RUNTIME_PACK_MAGIC = 'NNEIBIN\0';
export const NATIVE_RUNTIME_PACK_VERSION = 1;
export const NATIVE_RUNTIME_PACK_HEADER_BYTES = 24;

export const RUNTIME_RECIPE_PACK_SCHEMA = 'neonei/recipe-pack/current';
export const RUNTIME_RECIPE_PACK_PAYLOAD_MAGIC = 'NEIRCP1\0';
export const RUNTIME_RECIPE_PACK_PAYLOAD_VERSION = 1;

export type NativeRuntimePackEnvelope = {
  schema: string;
  payload: Buffer;
};

export function decodeNativeRuntimePackUtf8(buffer: Buffer, offset: number, length: number): string {
  return buffer.subarray(offset, offset + length).toString('utf8');
}

export function unwrapNativeRuntimePackEnvelope(
  buffer: Buffer,
  expectedSchema: string,
  label = 'Native runtime binary pack',
): NativeRuntimePackEnvelope {
  if (buffer.byteLength < NATIVE_RUNTIME_PACK_HEADER_BYTES) {
    throw new Error(`${label} is too small: ${buffer.byteLength}`);
  }
  const magic = decodeNativeRuntimePackUtf8(buffer, 0, 8);
  const version = buffer.readUInt32LE(8);
  const schemaLength = buffer.readUInt32LE(12);
  const payloadLength = Number(buffer.readBigUInt64LE(16));
  const schemaStart = NATIVE_RUNTIME_PACK_HEADER_BYTES;
  const schemaEnd = schemaStart + schemaLength;
  const payloadEnd = schemaEnd + payloadLength;
  if (magic !== NATIVE_RUNTIME_PACK_MAGIC) {
    throw new Error(`${label} magic mismatch: ${magic}`);
  }
  if (version !== NATIVE_RUNTIME_PACK_VERSION) {
    throw new Error(`${label} version mismatch: ${version}`);
  }
  if (schemaEnd > buffer.byteLength || payloadEnd !== buffer.byteLength) {
    throw new Error(`${label} length mismatch: schema=${schemaLength}, payload=${payloadLength}, bytes=${buffer.byteLength}`);
  }
  const schema = decodeNativeRuntimePackUtf8(buffer, schemaStart, schemaLength);
  if (schema !== expectedSchema) {
    throw new Error(`${label} schema mismatch: expected ${expectedSchema}, got ${schema}`);
  }
  return {
    schema,
    payload: buffer.subarray(schemaEnd, payloadEnd),
  };
}
