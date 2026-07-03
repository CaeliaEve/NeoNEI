import { createWeakEtag } from '../utils/http-cache';
import type { CurrentRuntimeArtifact } from './current-runtime-artifact-index.service';
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

export type CurrentRuntimeApiParamKey = 'runtimeId' | 'fileName';
export type CurrentRuntimeApiErrorKey =
  | 'runtimeIdRequired'
  | 'fileNameRequired'
  | 'runtimeNotCurrent'
  | 'manifestMissing'
  | 'filePathInvalid'
  | 'fileNotDeclared';
export type CurrentRuntimeApiEtagKey = 'manifest' | 'asset';
export type CurrentRuntimeApiUrlKey =
  | 'currentManifest'
  | 'currentAssetBase'
  | 'runtimeBase'
  | 'manifestSuffix'
  | 'assetSuffix';

type JsonRecord = Record<string, unknown>;

export type CurrentRuntimeApiMeta = Readonly<{
  schema: typeof CURRENT_RUNTIME_API_SCHEMA;
  schemaRevision: typeof CURRENT_RUNTIME_API_SCHEMA_REVISION;
  runtimeId: string;
  capabilities: JsonRecord;
}>;

export type CurrentRuntimeApiMetaInput = Readonly<{
  snapshotRuntimeId: string | null | undefined;
  healthRuntimeId: unknown;
  healthSource: unknown;
  capabilities: JsonRecord;
}>;

export type CurrentRuntimeOverview = Readonly<{
  runtimeId: string;
  schemaRevision: string;
  manifestUrl: string;
  runtimeManifestUrl: string;
  assetBaseUrl: string;
  runtimeAssetBaseUrl: string;
  capabilities: JsonRecord;
  manifestPath: string | null;
  cache: Readonly<{
    immutable: true;
    maxAgeSeconds: number;
  }>;
}>;

export type CurrentRuntimeOverviewInput = Readonly<{
  meta: CurrentRuntimeApiMeta;
  runtimeSchemaRevision: string | null | undefined;
  manifestPath: string | null | undefined;
}>;

export type CurrentRuntimeManifestDelivery = Readonly<{
  payload: JsonRecord;
  etag: string;
}>;

export type CurrentRuntimeManifestDeliveryInput = Readonly<{
  payload: JsonRecord;
  runtimeId: string;
  manifestPath: string;
  fingerprint: string;
}>;

export type CurrentRuntimeAssetDelivery = Readonly<{
  artifact: CurrentRuntimeArtifact;
  etag: string;
}>;

export type CurrentRuntimeAssetDeliveryInput = Readonly<{
  artifact: CurrentRuntimeArtifact;
  runtimeId: string;
}>;

type CurrentRuntimeApiStringDescriptor<TKey extends string> = Readonly<{
  key: TKey;
  value: string;
}>;

type CurrentRuntimeApiCacheDescriptor = Readonly<{
  key: 'immutable-assets';
  immutable: true;
  maxAgeSeconds: number;
}>;

function stringDescriptor<TKey extends string>(
  key: TKey,
  value: string,
): CurrentRuntimeApiStringDescriptor<TKey> {
  return Object.freeze({ key, value });
}

function validateAndFreezeCurrentRuntimeApiStringDescriptors<TKey extends string>(
  label: string,
  descriptors: readonly CurrentRuntimeApiStringDescriptor<TKey>[],
  expectedKeys: readonly TKey[],
  options: Readonly<{ valuesMustBeUnique?: boolean; valuesMustBeAbsoluteUrls?: boolean }> = {},
): readonly CurrentRuntimeApiStringDescriptor<TKey>[] {
  const expected = new Set<TKey>(expectedKeys);
  const seen = new Set<TKey>();
  const seenValues = new Set<string>();

  for (const descriptor of descriptors) {
    if (!descriptor) {
      throw new Error(`${label} descriptor must not be null`);
    }
    if (!expected.has(descriptor.key)) {
      throw new Error(`Unknown ${label} descriptor: ${descriptor.key}`);
    }
    if (!seen.add(descriptor.key)) {
      throw new Error(`Duplicate ${label} descriptor: ${descriptor.key}`);
    }
    if (!descriptor.value.trim()) {
      throw new Error(`${label} descriptor value must be non-empty: ${descriptor.key}`);
    }
    if (options.valuesMustBeAbsoluteUrls && !descriptor.value.startsWith('/')) {
      throw new Error(`${label} descriptor value must be an absolute URL path: ${descriptor.key}`);
    }
    if (options.valuesMustBeUnique && !seenValues.add(descriptor.value)) {
      throw new Error(`Duplicate ${label} descriptor value: ${descriptor.value}`);
    }
  }

  for (const key of expectedKeys) {
    if (!seen.has(key)) {
      throw new Error(`Missing ${label} descriptor: ${key}`);
    }
  }

  return Object.freeze(descriptors.map((descriptor) => Object.freeze({ ...descriptor })));
}

function projectStringDescriptorMap<TKey extends string>(
  descriptors: readonly CurrentRuntimeApiStringDescriptor<TKey>[],
): Readonly<Record<TKey, string>> {
  return Object.freeze(
    descriptors.reduce(
      (map, descriptor) => {
        map[descriptor.key] = descriptor.value;
        return map;
      },
      {} as Record<TKey, string>,
    ),
  );
}

function validateAndFreezeCurrentRuntimeApiCacheDescriptor(
  descriptor: CurrentRuntimeApiCacheDescriptor,
): CurrentRuntimeApiCacheDescriptor {
  if (!descriptor) {
    throw new Error('current runtime API cache descriptor must not be null');
  }
  if (descriptor.key !== 'immutable-assets') {
    throw new Error(`Unknown current runtime API cache descriptor: ${descriptor.key}`);
  }
  if (descriptor.immutable !== true) {
    throw new Error('current runtime API cache descriptor must be immutable');
  }
  if (!Number.isInteger(descriptor.maxAgeSeconds) || descriptor.maxAgeSeconds <= 0) {
    throw new Error(`current runtime API cache max age must be positive: ${descriptor.maxAgeSeconds}`);
  }
  return Object.freeze({ ...descriptor });
}

export const CURRENT_RUNTIME_API_CACHE_DESCRIPTOR = validateAndFreezeCurrentRuntimeApiCacheDescriptor({
  key: 'immutable-assets',
  immutable: true,
  maxAgeSeconds: 31_536_000,
});

export const CURRENT_RUNTIME_API_CACHE = Object.freeze({
  immutable: CURRENT_RUNTIME_API_CACHE_DESCRIPTOR.immutable,
  maxAgeSeconds: CURRENT_RUNTIME_API_CACHE_DESCRIPTOR.maxAgeSeconds,
} as const);

export const CURRENT_RUNTIME_API_PARAM_DESCRIPTORS = validateAndFreezeCurrentRuntimeApiStringDescriptors(
  'current runtime API parameter',
  [
    stringDescriptor('runtimeId', 'runtimeId'),
    stringDescriptor('fileName', 'fileName'),
  ] as const,
  ['runtimeId', 'fileName'] as const,
  { valuesMustBeUnique: true },
);

export const CURRENT_RUNTIME_API_PARAMS =
  projectStringDescriptorMap(CURRENT_RUNTIME_API_PARAM_DESCRIPTORS);

export type CurrentRuntimeApiParamName =
  typeof CURRENT_RUNTIME_API_PARAMS[keyof typeof CURRENT_RUNTIME_API_PARAMS];

export const CURRENT_RUNTIME_API_ERROR_DESCRIPTORS = validateAndFreezeCurrentRuntimeApiStringDescriptors(
  'current runtime API error',
  [
    stringDescriptor('runtimeIdRequired', 'runtimeId is required'),
    stringDescriptor('fileNameRequired', 'fileName is required'),
    stringDescriptor('runtimeNotCurrent', 'Runtime id is not the current published runtime'),
    stringDescriptor('manifestMissing', 'Runtime manifest not found'),
    stringDescriptor('filePathInvalid', 'fileName must be a runtime-relative file path'),
    stringDescriptor('fileNotDeclared', 'Runtime file is not declared by the current runtime manifest'),
  ] as const,
  [
    'runtimeIdRequired',
    'fileNameRequired',
    'runtimeNotCurrent',
    'manifestMissing',
    'filePathInvalid',
    'fileNotDeclared',
  ] as const,
  { valuesMustBeUnique: true },
);

export const CURRENT_RUNTIME_API_ERRORS =
  projectStringDescriptorMap(CURRENT_RUNTIME_API_ERROR_DESCRIPTORS);

export const CURRENT_RUNTIME_API_ETAG_KEY_DESCRIPTORS = validateAndFreezeCurrentRuntimeApiStringDescriptors(
  'current runtime API ETag key',
  [
    stringDescriptor('manifest', 'runtime-manifest'),
    stringDescriptor('asset', 'runtime-asset'),
  ] as const,
  ['manifest', 'asset'] as const,
  { valuesMustBeUnique: true },
);

export const CURRENT_RUNTIME_API_ETAG_KEYS =
  projectStringDescriptorMap(CURRENT_RUNTIME_API_ETAG_KEY_DESCRIPTORS);

export const CURRENT_RUNTIME_API_URL_DESCRIPTORS = validateAndFreezeCurrentRuntimeApiStringDescriptors(
  'current runtime API URL',
  [
    stringDescriptor('currentManifest', '/api/runtime/current/manifest'),
    stringDescriptor('currentAssetBase', '/api/runtime/current/asset/'),
    stringDescriptor('runtimeBase', '/api/runtime/'),
    stringDescriptor('manifestSuffix', '/manifest'),
    stringDescriptor('assetSuffix', '/asset/'),
  ] as const,
  ['currentManifest', 'currentAssetBase', 'runtimeBase', 'manifestSuffix', 'assetSuffix'] as const,
  { valuesMustBeAbsoluteUrls: true },
);

export const CURRENT_RUNTIME_API_URLS =
  projectStringDescriptorMap(CURRENT_RUNTIME_API_URL_DESCRIPTORS);

function asString(value: unknown): string | null {
  const text = `${value ?? ''}`.trim();
  return text || null;
}

export function buildPinnedRuntimeManifestUrl(runtimeId: string): string {
  return `${CURRENT_RUNTIME_API_URLS.runtimeBase}${encodeURIComponent(runtimeId)}${CURRENT_RUNTIME_API_URLS.manifestSuffix}`;
}

export function buildPinnedRuntimeAssetBaseUrl(runtimeId: string): string {
  return `${CURRENT_RUNTIME_API_URLS.runtimeBase}${encodeURIComponent(runtimeId)}${CURRENT_RUNTIME_API_URLS.assetSuffix}`;
}

export function getCurrentRuntimeRequiredParamError(name: CurrentRuntimeApiParamName): string {
  return name === CURRENT_RUNTIME_API_PARAMS.runtimeId
    ? CURRENT_RUNTIME_API_ERRORS.runtimeIdRequired
    : CURRENT_RUNTIME_API_ERRORS.fileNameRequired;
}

export function normalizeCurrentRuntimeRequiredParamValue(
  value: string | undefined,
  _name: CurrentRuntimeApiParamName,
): string | null {
  const normalized = `${value ?? ''}`.trim();
  return normalized || null;
}

export function buildCurrentRuntimeApiMeta(input: CurrentRuntimeApiMetaInput): CurrentRuntimeApiMeta {
  return Object.freeze({
    schema: CURRENT_RUNTIME_API_SCHEMA,
    schemaRevision: CURRENT_RUNTIME_API_SCHEMA_REVISION,
    runtimeId: input.snapshotRuntimeId
      ?? asString(input.healthRuntimeId)
      ?? asString(input.healthSource)
      ?? CURRENT_RUNTIME_MISSING_ID,
    capabilities: input.capabilities,
  });
}

export function buildCurrentRuntimeOverview(input: CurrentRuntimeOverviewInput): CurrentRuntimeOverview {
  const { meta } = input;
  return Object.freeze({
    runtimeId: meta.runtimeId,
    schemaRevision: input.runtimeSchemaRevision ?? CURRENT_RUNTIME_UNKNOWN_SCHEMA_REVISION,
    manifestUrl: CURRENT_RUNTIME_API_URLS.currentManifest,
    runtimeManifestUrl: buildPinnedRuntimeManifestUrl(meta.runtimeId),
    assetBaseUrl: CURRENT_RUNTIME_API_URLS.currentAssetBase,
    runtimeAssetBaseUrl: buildPinnedRuntimeAssetBaseUrl(meta.runtimeId),
    capabilities: meta.capabilities,
    manifestPath: input.manifestPath ?? null,
    cache: CURRENT_RUNTIME_API_CACHE,
  });
}

export function createCurrentRuntimeManifestEtag(input: CurrentRuntimeManifestDeliveryInput): string {
  return createWeakEtag(
    CURRENT_RUNTIME_API_ETAG_KEYS.manifest,
    input.runtimeId,
    input.manifestPath,
    input.fingerprint,
  );
}

export function createCurrentRuntimeAssetEtag(input: CurrentRuntimeAssetDeliveryInput): string {
  const { artifact } = input;
  return createWeakEtag(
    CURRENT_RUNTIME_API_ETAG_KEYS.asset,
    input.runtimeId,
    artifact.relativePath,
    artifact.bytes,
    artifact.mtimeMs,
  );
}

export function createCurrentRuntimeManifestDelivery(
  input: CurrentRuntimeManifestDeliveryInput,
): CurrentRuntimeManifestDelivery {
  return Object.freeze({
    payload: input.payload,
    etag: createCurrentRuntimeManifestEtag(input),
  });
}

export function createCurrentRuntimeAssetDelivery(
  input: CurrentRuntimeAssetDeliveryInput,
): CurrentRuntimeAssetDelivery {
  return Object.freeze({
    artifact: input.artifact,
    etag: createCurrentRuntimeAssetEtag(input),
  });
}
