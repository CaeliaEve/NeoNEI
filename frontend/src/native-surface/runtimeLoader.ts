import {
  NATIVE_RUNTIME_CURRENT_ASSET_BASE_PATH,
  NATIVE_RUNTIME_CURRENT_MANIFEST_PATH,
  NATIVE_RUNTIME_DEFAULT_BASE_URL,
  NATIVE_RUNTIME_FETCH_CACHE,
  NATIVE_RUNTIME_PACK_HEADER_BYTES,
  NATIVE_RUNTIME_PACK_MAGIC,
  NATIVE_RUNTIME_PACK_SCHEMAS,
  NATIVE_RUNTIME_PACK_VERSION,
  NATIVE_RUNTIME_PAYLOAD_ENCODINGS,
  NATIVE_RUNTIME_REVISION,
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
import { getManifestRuntimeFileBytes } from "../services/runtimeManifestPath.ts";

const manifestRequestCache = new Map<string, Promise<NativeRuntimeManifest>>();
const packRequestCache = new Map<string, Promise<NativeRuntimePack>>();

export type NativeRuntimeManifestGate = (manifest: NativeRuntimeManifest) => void;

function isPortableRelativePath(path: string): boolean {
  return Boolean(path)
    && !path.startsWith("/")
    && !path.includes("\\")
    && !/^[A-Za-z]:[\\/]/.test(path)
    && !path.split("/").includes("..");
}

type CurrentRuntimeManifestEnvelope = {
  ok?: boolean;
  data?: NativeRuntimeManifest;
};

function encodeRuntimeFilePath(relativePath: string): string {
  return relativePath.split("/").map((part) => encodeURIComponent(part)).join("/");
}

function isCurrentRuntimeManifestUrl(manifestUrl: string): boolean {
  try {
    const pathname = new URL(manifestUrl, globalThis.location?.href ?? NATIVE_RUNTIME_DEFAULT_BASE_URL).pathname;
    return pathname.endsWith(NATIVE_RUNTIME_CURRENT_MANIFEST_PATH);
  } catch {
    return manifestUrl.includes(NATIVE_RUNTIME_CURRENT_MANIFEST_PATH);
  }
}

function resolveCurrentRuntimeAssetUrl(manifestUrl: string, relativePath: string): string {
  const encodedPath = encodeRuntimeFilePath(relativePath);
  try {
    return new URL(
      `${NATIVE_RUNTIME_CURRENT_ASSET_BASE_PATH}${encodedPath}`,
      new URL(manifestUrl, globalThis.location?.href ?? NATIVE_RUNTIME_DEFAULT_BASE_URL),
    ).toString();
  } catch {
    return `${NATIVE_RUNTIME_CURRENT_ASSET_BASE_PATH}${encodedPath}`;
  }
}

export function resolveManifestRelativeUrl(manifestUrl: string, relativePath: string): string {
  if (!isPortableRelativePath(relativePath)) {
    throw new Error(`Native runtime path is not portable: ${relativePath}`);
  }
  if (isCurrentRuntimeManifestUrl(manifestUrl)) {
    return resolveCurrentRuntimeAssetUrl(manifestUrl, relativePath);
  }
  return new URL(relativePath, manifestUrl).toString();
}

function buildNativeRuntimeRevision(manifest: NativeRuntimeManifest, relativePath: string): string {
  return [
    manifest.runtimeId,
    manifest.generatedAt,
    manifest.sourceSignature,
    manifest.schemaRevision,
    relativePath,
    getManifestRuntimeFileBytes(manifest.files, relativePath),
  ]
    .map((value) => `${value ?? ""}`.trim())
    .filter(Boolean)
    .join(NATIVE_RUNTIME_REVISION.separator)
    || `${relativePath}${NATIVE_RUNTIME_REVISION.separator}${NATIVE_RUNTIME_REVISION.currentFallback}`;
}

function appendNativeRuntimeRevision(url: string, revision: string): string {
  const encoded = encodeURIComponent(revision);
  try {
    const next = new URL(url, globalThis.location?.href ?? NATIVE_RUNTIME_DEFAULT_BASE_URL);
    next.searchParams.set(NATIVE_RUNTIME_REVISION.queryParam, encoded);
    return next.toString();
  } catch {
    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}${NATIVE_RUNTIME_REVISION.queryParam}=${encoded}`;
  }
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
  const normalizedManifestUrl = new URL(manifestUrl, globalThis.location?.href ?? NATIVE_RUNTIME_DEFAULT_BASE_URL).toString();
  const existing = manifestRequestCache.get(normalizedManifestUrl);
  if (existing) return existing;
  const request = (async () => {
  const response = await fetch(normalizedManifestUrl, { cache: NATIVE_RUNTIME_FETCH_CACHE.manifest });
  if (!response.ok) {
    throw new Error(`Failed to load native runtime manifest: ${response.status} ${response.statusText}`);
  }
  const payload = await response.json() as NativeRuntimeManifest | CurrentRuntimeManifestEnvelope;
  if (payload && typeof payload === "object" && "ok" in payload && "data" in payload) {
    return (payload as CurrentRuntimeManifestEnvelope).data ?? {};
  }
  return payload as NativeRuntimeManifest;
  })().catch((error) => {
    manifestRequestCache.delete(normalizedManifestUrl);
    throw error;
  });
  manifestRequestCache.set(normalizedManifestUrl, request);
  return request;
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
  const cacheKey = `${normalizedManifestUrl}::${name}::${path}::${revision}`;
  const existing = packRequestCache.get(cacheKey);
  if (existing) return existing;
  const request = (async () => {
    const response = await fetch(url, { cache: NATIVE_RUNTIME_FETCH_CACHE.pack });
    if (!response.ok) {
      throw new Error(`Failed to load native runtime pack ${name}: ${response.status} ${response.statusText}`);
    }
    const buffer = await response.arrayBuffer();
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
  })().catch((error) => {
    packRequestCache.delete(cacheKey);
    throw error;
  });
  packRequestCache.set(cacheKey, request);
  return request;
}

export async function loadNativeRuntimeBuffers(
  manifestUrl: string,
  packNames?: readonly NativeRuntimePackName[],
  manifestGate?: NativeRuntimeManifestGate,
): Promise<NativeRuntimeBuffers> {
  const normalizedManifestUrl = new URL(manifestUrl, globalThis.location?.href ?? NATIVE_RUNTIME_DEFAULT_BASE_URL).toString();
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
