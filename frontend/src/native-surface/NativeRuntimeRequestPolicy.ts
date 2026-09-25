import {
  NATIVE_RUNTIME_CURRENT_ASSET_BASE_PATH,
  NATIVE_RUNTIME_CURRENT_MANIFEST_PATH,
  NATIVE_RUNTIME_DEFAULT_BASE_URL,
  NATIVE_RUNTIME_FETCH_CACHE,
  NATIVE_RUNTIME_REVISION,
  type NativeRuntimePackName,
} from "./NativeRuntimeAbi.ts";
import type { NativeRuntimeManifest } from "./NativeRuntimeManifest.ts";
import { getManifestRuntimeFileBytes } from "../services/runtimeManifestPath.ts";

export type NativeRuntimeRequestKind = keyof typeof NATIVE_RUNTIME_FETCH_CACHE;

export const NATIVE_RUNTIME_REVISION_FIELDS = Object.freeze([
  "runtimeId",
  "generatedAt",
  "sourceSignature",
  "schemaRevision",
  "relativePath",
  "fileBytes",
] as const);

export const NATIVE_RUNTIME_AUTHORITATIVE_REVISION_FIELDS = Object.freeze([
  "runtimeId",
  "generatedAt",
  "sourceSignature",
  "schemaRevision",
  "fileBytes",
] as const);

export const NATIVE_RUNTIME_PACK_CACHE_KEY_FIELDS = Object.freeze([
  "manifestUrl",
  "packName",
  "relativePath",
  "revision",
] as const);

export const NATIVE_RUNTIME_REQUEST_POLICY_MODULE = Object.freeze({
  id: "nativeRuntime.requestPolicy",
  currentManifestPath: NATIVE_RUNTIME_CURRENT_MANIFEST_PATH,
  currentAssetBasePath: NATIVE_RUNTIME_CURRENT_ASSET_BASE_PATH,
  fetchCache: NATIVE_RUNTIME_FETCH_CACHE,
  revisionQueryParam: NATIVE_RUNTIME_REVISION.queryParam,
  revisionFields: NATIVE_RUNTIME_REVISION_FIELDS,
  authoritativeRevisionFields: NATIVE_RUNTIME_AUTHORITATIVE_REVISION_FIELDS,
  packCacheKeyFields: NATIVE_RUNTIME_PACK_CACHE_KEY_FIELDS,
  pathPolicy: "portable-relative-runtime-path",
  failurePolicy: "fail-closed",
} as const);

export function getNativeRuntimeFetchCache(kind: NativeRuntimeRequestKind): RequestCache {
  return NATIVE_RUNTIME_FETCH_CACHE[kind];
}

export function normalizeNativeRuntimeManifestUrl(manifestUrl: string): string {
  return new URL(manifestUrl, globalThis.location?.href ?? NATIVE_RUNTIME_DEFAULT_BASE_URL).toString();
}

export function isPortableRuntimePath(path: string): boolean {
  return Boolean(path)
    && !path.startsWith("/")
    && !path.includes("\\")
    && !/^[A-Za-z]:[\\/]/.test(path)
    && !path.split("/").includes("..");
}

export function assertPortableRuntimePath(
  path: string,
  label = "Native runtime path",
): void {
  if (!isPortableRuntimePath(path)) {
    throw new Error(`${label} is not portable: ${path}`);
  }
}

export function encodeRuntimeFilePath(relativePath: string): string {
  return relativePath.split("/").map((part) => encodeURIComponent(part)).join("/");
}

export function isCurrentRuntimeManifestUrl(manifestUrl: string): boolean {
  try {
    const pathname = new URL(manifestUrl, globalThis.location?.href ?? NATIVE_RUNTIME_DEFAULT_BASE_URL).pathname;
    return pathname.endsWith(NATIVE_RUNTIME_CURRENT_MANIFEST_PATH);
  } catch {
    return manifestUrl.includes(NATIVE_RUNTIME_CURRENT_MANIFEST_PATH);
  }
}

export function resolveCurrentRuntimeAssetUrl(manifestUrl: string, relativePath: string): string {
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

export function resolveManifestRelativeUrl(
  manifestUrl: string,
  relativePath: string,
  pathLabel = "Native runtime path",
): string {
  assertPortableRuntimePath(relativePath, pathLabel);
  if (isCurrentRuntimeManifestUrl(manifestUrl)) {
    return resolveCurrentRuntimeAssetUrl(manifestUrl, relativePath);
  }
  return new URL(relativePath, manifestUrl).toString();
}

export function buildNativeRuntimeRevision(
  manifest: NativeRuntimeManifest,
  relativePath: string,
): string {
  assertPortableRuntimePath(relativePath, "Native runtime revision path");
  const fileBytes = getManifestRuntimeFileBytes(manifest.files, relativePath);
  const revisionToken = (value: unknown) => `${value ?? ""}`.trim();
  const authoritativeRevisionTokens = [
    manifest.runtimeId,
    manifest.generatedAt,
    manifest.sourceSignature,
    manifest.schemaRevision,
    fileBytes,
  ]
    .map(revisionToken)
    .filter(Boolean);
  if (authoritativeRevisionTokens.length === 0) {
    throw new Error(`Native runtime manifest is missing authoritative revision identity for ${relativePath}`);
  }
  const revision = [
    manifest.runtimeId,
    manifest.generatedAt,
    manifest.sourceSignature,
    manifest.schemaRevision,
    relativePath,
    fileBytes,
  ]
    .map(revisionToken)
    .filter(Boolean)
    .join(NATIVE_RUNTIME_REVISION.separator);
  return revision;
}

export function appendNativeRuntimeRevision(url: string, revision: string): string {
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

export function createNativeRuntimePackCacheKey(
  normalizedManifestUrl: string,
  packName: NativeRuntimePackName,
  relativePath: string,
  revision: string,
): string {
  return `${normalizedManifestUrl}::${packName}::${relativePath}::${revision}`;
}
