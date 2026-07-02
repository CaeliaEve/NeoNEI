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

export function buildPinnedRuntimeManifestUrl(runtimeId: string): string {
  return `${CURRENT_RUNTIME_API_URLS.runtimeBase}${encodeURIComponent(runtimeId)}${CURRENT_RUNTIME_API_URLS.manifestSuffix}`;
}

export function buildPinnedRuntimeAssetBaseUrl(runtimeId: string): string {
  return `${CURRENT_RUNTIME_API_URLS.runtimeBase}${encodeURIComponent(runtimeId)}${CURRENT_RUNTIME_API_URLS.assetSuffix}`;
}
