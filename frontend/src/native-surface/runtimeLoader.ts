import {
  NATIVE_RUNTIME_PACK_SCHEMAS,
  type NativeRuntimeBuffers,
  type NativeRuntimeManifest,
  type NativeRuntimePack,
  type NativeRuntimePackName,
  type NativeRuntimePackSchema,
} from "./NativeRuntimeManifest";
import { parseNativeCompactBrowserPack } from "./NativeRuntimeBrowserPack";

const NATIVE_PACK_MAGIC = "NNEIBIN\0";
const NATIVE_PACK_HEADER_BYTES = 24;

function isPortableRelativePath(path: string): boolean {
  return Boolean(path)
    && !path.startsWith("/")
    && !path.includes("\\")
    && !/^[A-Za-z]:[\\/]/.test(path)
    && !path.split("/").includes("..");
}

type CurrentNativeRuntimeManifestEnvelope = {
  ok?: boolean;
  data?: NativeRuntimeManifest;
};

function encodeRuntimeFilePath(relativePath: string): string {
  return relativePath.split("/").map((part) => encodeURIComponent(part)).join("/");
}

function isCurrentNativeRuntimeManifestUrl(manifestUrl: string): boolean {
  try {
    return new URL(manifestUrl, globalThis.location?.href ?? "http://localhost/").pathname.endsWith("/api/native-runtime/current/manifest");
  } catch {
    return manifestUrl.includes("/api/native-runtime/current/manifest");
  }
}

function resolveManifestRelativeUrl(manifestUrl: string, relativePath: string): string {
  if (!isPortableRelativePath(relativePath)) {
    throw new Error(`Native runtime path is not portable: ${relativePath}`);
  }
  if (isCurrentNativeRuntimeManifestUrl(manifestUrl)) {
    return new URL(`/api/native-runtime/current/files/${encodeRuntimeFilePath(relativePath)}`, manifestUrl).toString();
  }
  return new URL(relativePath, manifestUrl).toString();
}

function getManifestEntrypoints(manifest: NativeRuntimeManifest): Record<NativeRuntimePackName, string> {
  const source = manifest.entrypoints ?? (!Array.isArray(manifest.files) ? manifest.files : undefined) ?? {};
  const result = {} as Record<NativeRuntimePackName, string>;
  for (const packName of Object.keys(NATIVE_RUNTIME_PACK_SCHEMAS) as NativeRuntimePackName[]) {
    const path = source[packName];
    if (!path) {
      throw new Error(`Native runtime manifest is missing ${packName} entrypoint`);
    }
    result[packName] = path;
  }
  return result;
}

function decodeAscii(view: DataView, offset: number, length: number): string {
  const bytes = new Uint8Array(view.buffer, view.byteOffset + offset, length);
  return new TextDecoder("utf-8").decode(bytes);
}

export function parseNativeRuntimePackHeader(
  buffer: ArrayBuffer,
  expectedSchema: NativeRuntimePackSchema,
): NativeRuntimePack["header"] {
  if (buffer.byteLength < NATIVE_PACK_HEADER_BYTES) {
    throw new Error(`Native runtime pack is too small: ${buffer.byteLength} bytes`);
  }
  const view = new DataView(buffer);
  const magic = decodeAscii(view, 0, 8);
  const version = view.getUint32(8, true);
  const schemaLength = view.getUint32(12, true);
  const payloadLength = Number(view.getBigUint64(16, true));
  const schemaStart = NATIVE_PACK_HEADER_BYTES;
  const schemaEnd = schemaStart + schemaLength;
  const payloadEnd = schemaEnd + payloadLength;

  if (magic !== NATIVE_PACK_MAGIC) {
    throw new Error(`Native runtime pack has invalid magic: ${magic}`);
  }
  if (version !== 1) {
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
    magic: NATIVE_PACK_MAGIC,
    version: 1,
    schema,
    schemaLength,
    payloadLength,
    byteLength: buffer.byteLength,
  };
}

export function getNativeRuntimePackPayloadBuffer(buffer: ArrayBuffer, header: NativeRuntimePack["header"]): ArrayBuffer {
  const payloadStart = NATIVE_PACK_HEADER_BYTES + header.schemaLength;
  return buffer.slice(payloadStart, payloadStart + header.payloadLength);
}

function detectPayloadEncoding(name: NativeRuntimePackName, payloadBuffer: ArrayBuffer): NativeRuntimePack["payloadEncoding"] {
  if (name === "browser") {
    parseNativeCompactBrowserPack(payloadBuffer);
    return "compact-browser-table";
  }
  try {
    const firstByte = new Uint8Array(payloadBuffer, 0, Math.min(payloadBuffer.byteLength, 1))[0];
    if (firstByte === 123 || firstByte === 91) return "json";
  } catch {
    // Pack-level validation already verified the envelope; unknown payloads stay binary.
  }
  return "binary";
}

export async function loadNativeRuntimeManifest(manifestUrl: string): Promise<NativeRuntimeManifest> {
  const response = await fetch(manifestUrl, { cache: "no-cache" });
  if (!response.ok) {
    throw new Error(`Failed to load native runtime manifest: ${response.status} ${response.statusText}`);
  }
  const payload = await response.json() as NativeRuntimeManifest | CurrentNativeRuntimeManifestEnvelope;
  if (payload && typeof payload === "object" && "ok" in payload && "data" in payload) {
    return (payload as CurrentNativeRuntimeManifestEnvelope).data ?? {};
  }
  return payload as NativeRuntimeManifest;
}

export async function loadNativeRuntimeBuffers(manifestUrl: string): Promise<NativeRuntimeBuffers> {
  const normalizedManifestUrl = new URL(manifestUrl, globalThis.location?.href ?? "http://localhost/").toString();
  const manifest = await loadNativeRuntimeManifest(normalizedManifestUrl);
  const entrypoints = getManifestEntrypoints(manifest);
  const packs = {} as Record<NativeRuntimePackName, NativeRuntimePack>;

  await Promise.all((Object.keys(NATIVE_RUNTIME_PACK_SCHEMAS) as NativeRuntimePackName[]).map(async (name) => {
    const path = entrypoints[name];
    const url = resolveManifestRelativeUrl(normalizedManifestUrl, path);
    const response = await fetch(url, { cache: "force-cache" });
    if (!response.ok) {
      throw new Error(`Failed to load native runtime pack ${name}: ${response.status} ${response.statusText}`);
    }
    const buffer = await response.arrayBuffer();
    const header = parseNativeRuntimePackHeader(buffer, NATIVE_RUNTIME_PACK_SCHEMAS[name]);
    const payloadBuffer = getNativeRuntimePackPayloadBuffer(buffer, header);
    packs[name] = {
      name,
      path,
      url,
      header,
      buffer,
      payloadBuffer,
      payloadEncoding: detectPayloadEncoding(name, payloadBuffer),
    };
  }));

  return {
    manifest,
    manifestUrl: normalizedManifestUrl,
    packs,
  };
}
