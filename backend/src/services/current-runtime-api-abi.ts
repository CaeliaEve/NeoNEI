import { CURRENT_RUNTIME_SNAPSHOT_DEFAULTS } from './current-runtime-snapshot-abi';

/**
 * Current runtime API ABI catalog.
 *
 * Runtime API services must consume schema, URL, ETag, cache, parameter, and
 * error contracts from here. The service layer owns snapshot reads and delivery
 * decisions only; this file owns the externally visible API vocabulary.
 */

export const CURRENT_RUNTIME_API_SCHEMA = 'neonei/api/current';
export const CURRENT_RUNTIME_API_SCHEMA_REVISION = 1;
export { CURRENT_RUNTIME_SNAPSHOT_DEFAULTS } from './current-runtime-snapshot-abi';
export const CURRENT_RUNTIME_MISSING_ID = CURRENT_RUNTIME_SNAPSHOT_DEFAULTS.missingRuntimeId;
export const CURRENT_RUNTIME_UNKNOWN_SCHEMA_REVISION = CURRENT_RUNTIME_SNAPSHOT_DEFAULTS.unknownSchemaRevision;

export const CURRENT_RUNTIME_API_CACHE = Object.freeze({
  immutable: true,
  maxAgeSeconds: 31_536_000,
} as const);

export const CURRENT_RUNTIME_API_PARAMS = Object.freeze({
  runtimeId: 'runtimeId',
  fileName: 'fileName',
} as const);

export type CurrentRuntimeApiParamName =
  typeof CURRENT_RUNTIME_API_PARAMS[keyof typeof CURRENT_RUNTIME_API_PARAMS];

export const CURRENT_RUNTIME_API_ERRORS = Object.freeze({
  runtimeIdRequired: 'runtimeId is required',
  fileNameRequired: 'fileName is required',
  runtimeNotCurrent: 'Runtime id is not the current published runtime',
  manifestMissing: 'Runtime manifest not found',
  filePathInvalid: 'fileName must be a runtime-relative file path',
  fileNotDeclared: 'Runtime file is not declared by the current runtime manifest',
} as const);

export const CURRENT_RUNTIME_API_ETAG_KEYS = Object.freeze({
  manifest: 'runtime-manifest',
  asset: 'runtime-asset',
} as const);

export const CURRENT_RUNTIME_API_URLS = Object.freeze({
  currentManifest: '/api/runtime/current/manifest',
  currentAssetBase: '/api/runtime/current/asset/',
  runtimeBase: '/api/runtime/',
  manifestSuffix: '/manifest',
  assetSuffix: '/asset/',
} as const);

export function buildPinnedRuntimeManifestUrl(runtimeId: string): string {
  return `${CURRENT_RUNTIME_API_URLS.runtimeBase}${encodeURIComponent(runtimeId)}${CURRENT_RUNTIME_API_URLS.manifestSuffix}`;
}

export function buildPinnedRuntimeAssetBaseUrl(runtimeId: string): string {
  return `${CURRENT_RUNTIME_API_URLS.runtimeBase}${encodeURIComponent(runtimeId)}${CURRENT_RUNTIME_API_URLS.assetSuffix}`;
}
