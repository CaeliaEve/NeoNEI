import {
  NATIVE_RUNTIME_PACK_HEADER_BYTES,
  NATIVE_RUNTIME_PACK_MAGIC,
  NATIVE_RUNTIME_PACK_SCHEMAS,
  NATIVE_RUNTIME_PACK_VERSION,
  NATIVE_RUNTIME_PAYLOAD_ENCODINGS,
  type NativeRuntimePackName,
  type NativeRuntimePackSchema,
} from "./NativeRuntimeAbi.ts";
import type {
  NativeRuntimeBuffers,
  NativeRuntimeManifest,
  NativeRuntimePack,
} from "./NativeRuntimeManifest.ts";
import { parseNativeCompactBrowserPack } from "./NativeRuntimeBrowserPack.ts";
import { assertNativeRuntimePackEntrypoints } from "./NativeRuntimeCapabilityGate.ts";
import {
  appendNativeRuntimeRevision,
  buildNativeRuntimeRevision,
  createNativeRuntimePackCacheKey,
  getNativeRuntimeFetchCache,
  normalizeNativeRuntimeManifestUrl,
  resolveManifestRelativeUrl,
} from "./NativeRuntimeRequestPolicy.ts";
import {
  fetchRuntimeArtifactArrayBuffer,
  fetchRuntimeArtifactJson,
} from "../services/runtimeArtifactClient.ts";

export { resolveManifestRelativeUrl } from "./NativeRuntimeRequestPolicy.ts";

export type NativeRuntimeManifestGate = (manifest: NativeRuntimeManifest) => void;

type CurrentRuntimeManifestEnvelope = {
  ok?: boolean;
  data?: NativeRuntimeManifest;
};

function isNativeRuntimeManifestRecord(value: unknown): value is NativeRuntimeManifest {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function unwrapCurrentRuntimeManifestPayload(payload: unknown): NativeRuntimeManifest {
  if (isNativeRuntimeManifestRecord(payload) && ("ok" in payload || "data" in payload)) {
    const envelope = payload as CurrentRuntimeManifestEnvelope;
    if (envelope.ok !== true) {
      throw new Error("Native runtime current manifest envelope reported ok=false");
    }
    if (!isNativeRuntimeManifestRecord(envelope.data)) {
      throw new Error("Native runtime current manifest envelope is missing data");
    }
    return envelope.data;
  }
  if (!isNativeRuntimeManifestRecord(payload)) {
    throw new Error("Native runtime manifest response is not an object");
  }
  return payload;
}

function decodeAscii(view: DataView, offset: number, length: number): string {
  const bytes = new Uint8Array(view.buffer, view.byteOffset + offset, length);
  return new TextDecoder("utf-8").decode(bytes);
}

export function parseNativeRuntimePackHeader(
  buffer: ArrayBuffer,
  expectedSchema: NativeRuntimePackSchema,
): NativeRuntimePack["header"] {
  if (buffer.byteLength < NATIVE_RUNTIME_PACK_HEADER_BYTES) {
    throw new Error(`Native runtime pack is too small: ${buffer.byteLength} bytes`);
  }
  const view = new DataView(buffer);
  const magic = decodeAscii(view, 0, 8);
  const version = view.getUint32(8, true);
  const schemaLength = view.getUint32(12, true);
  const payloadLength = Number(view.getBigUint64(16, true));
  const schemaStart = NATIVE_RUNTIME_PACK_HEADER_BYTES;
  const schemaEnd = schemaStart + schemaLength;
  const payloadEnd = schemaEnd + payloadLength;

  if (magic !== NATIVE_RUNTIME_PACK_MAGIC) {
    throw new Error(`Native runtime pack has invalid magic: ${magic}`);
  }
  if (version !== NATIVE_RUNTIME_PACK_VERSION) {
    throw new Error(`Native runtime pack has invalid version: ${version}`);
  }
  if (schemaEnd > buffer.byteLength || payloadEnd !== buffer.byteLength) {
    throw new Error(`Native runtime pack has invalid length: schema=${schemaLength}, payload=${payloadLength}, bytes=${buffer.byteLength}`);
  }
  const schema = decodeAscii(view, schemaStart, schemaLength) as NativeRuntimePackSchema;
  if (schema !== expectedSchema) {
    throw new Error(`Native runtime pack schema mismatch: expected ${expectedSchema}, got ${schema}`);
  }
  return {
    magic: NATIVE_RUNTIME_PACK_MAGIC,
    version: NATIVE_RUNTIME_PACK_VERSION,
    schema,
    schemaLength,
    payloadLength,
    byteLength: buffer.byteLength,
  };
}

export function getNativeRuntimePackPayloadBuffer(buffer: ArrayBuffer, header: NativeRuntimePack["header"]): ArrayBuffer {
  const payloadStart = NATIVE_RUNTIME_PACK_HEADER_BYTES + header.schemaLength;
  return buffer.slice(payloadStart, payloadStart + header.payloadLength);
}

function detectPayloadEncoding(name: NativeRuntimePackName, payloadBuffer: ArrayBuffer): NativeRuntimePack["payloadEncoding"] {
  if (name === "browser") {
    parseNativeCompactBrowserPack(payloadBuffer);
    return NATIVE_RUNTIME_PAYLOAD_ENCODINGS.compactBrowserTable;
  }
  try {
    const firstByte = new Uint8Array(payloadBuffer, 0, Math.min(payloadBuffer.byteLength, 1))[0];
    if (firstByte === 123 || firstByte === 91) return NATIVE_RUNTIME_PAYLOAD_ENCODINGS.json;
  } catch {
    // Pack-level validation already verified the envelope; unknown payloads stay binary.
  }
  return NATIVE_RUNTIME_PAYLOAD_ENCODINGS.binary;
}

export async function loadNativeRuntimeManifest(manifestUrl: string): Promise<NativeRuntimeManifest> {
  const normalizedManifestUrl = normalizeNativeRuntimeManifestUrl(manifestUrl);
  const payload = await fetchRuntimeArtifactJson<unknown>({
    manifestIdentity: `native-manifest:${normalizedManifestUrl}`,
    artifactPath: normalizedManifestUrl,
    resolvedUrl: normalizedManifestUrl,
    fetchInit: { cache: getNativeRuntimeFetchCache("manifest") },
    persistent: false,
    memory: false,
  });
  return unwrapCurrentRuntimeManifestPayload(payload);
}

async function loadNativeRuntimePack(
  normalizedManifestUrl: string,
  manifest: NativeRuntimeManifest,
  entrypoints: Record<NativeRuntimePackName, string>,
  name: NativeRuntimePackName,
): Promise<NativeRuntimePack> {
  const path = entrypoints[name];
  const revision = buildNativeRuntimeRevision(manifest, path);
  const url = appendNativeRuntimeRevision(resolveManifestRelativeUrl(normalizedManifestUrl, path), revision);
  const cacheKey = createNativeRuntimePackCacheKey(normalizedManifestUrl, name, path, revision);
  const buffer = await fetchRuntimeArtifactArrayBuffer({
    manifestIdentity: manifest.sourceSignature ?? manifest.runtimeId ?? normalizedManifestUrl,
    artifactPath: cacheKey,
    resolvedUrl: url,
    fetchInit: { cache: getNativeRuntimeFetchCache("pack") },
  });
  const header = parseNativeRuntimePackHeader(buffer, NATIVE_RUNTIME_PACK_SCHEMAS[name]);
  const payloadBuffer = getNativeRuntimePackPayloadBuffer(buffer, header);
  return {
    name,
    path,
    url,
    header,
    buffer,
    payloadBuffer,
    payloadEncoding: detectPayloadEncoding(name, payloadBuffer),
  };
}

export async function loadNativeRuntimeBuffers(
  manifestUrl: string,
  packNames?: readonly NativeRuntimePackName[],
  manifestGate?: NativeRuntimeManifestGate,
): Promise<NativeRuntimeBuffers> {
  const normalizedManifestUrl = normalizeNativeRuntimeManifestUrl(manifestUrl);
  const manifest = await loadNativeRuntimeManifest(normalizedManifestUrl);
  const packs: Partial<Record<NativeRuntimePackName, NativeRuntimePack>> = {};
  const requestedPackNames = packNames?.length
    ? Array.from(new Set(packNames))
    : (Object.keys(NATIVE_RUNTIME_PACK_SCHEMAS) as NativeRuntimePackName[]);
  manifestGate?.(manifest);
  const entrypoints = assertNativeRuntimePackEntrypoints(manifest, requestedPackNames);

  await Promise.all(requestedPackNames.map(async (name) => {
    packs[name] = await loadNativeRuntimePack(normalizedManifestUrl, manifest, entrypoints, name);
  }));

  return {
    manifest,
    manifestUrl: normalizedManifestUrl,
    packs,
  };
}
