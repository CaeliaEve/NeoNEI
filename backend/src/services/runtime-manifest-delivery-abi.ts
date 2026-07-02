/** Stable manifest delivery contract catalog for public runtime manifests. */

export const RUNTIME_MANIFEST_DELIVERY_PROFILES = Object.freeze({
  current: 'current',
  apiV1: 'api-v1',
} as const);

export type RuntimeManifestDeliveryProfile =
  typeof RUNTIME_MANIFEST_DELIVERY_PROFILES[keyof typeof RUNTIME_MANIFEST_DELIVERY_PROFILES];

export type RuntimeManifestDeliveryContract = Readonly<{
  schemaVersion: string;
  contractIndex: string;
}>;

export type RuntimeManifestDeliveryDescriptor = RuntimeManifestDeliveryContract & Readonly<{
  profile: RuntimeManifestDeliveryProfile;
  etagKey: string;
}>;

const RUNTIME_MANIFEST_DELIVERY_PROFILE_VALUES = Object.freeze(
  Object.values(RUNTIME_MANIFEST_DELIVERY_PROFILES),
);

function runtimeManifestDeliveryDescriptor(
  profile: RuntimeManifestDeliveryProfile,
  schemaVersion: string,
  contractIndex: string,
  etagKey: string,
): RuntimeManifestDeliveryDescriptor {
  return Object.freeze({
    profile,
    schemaVersion,
    contractIndex,
    etagKey,
  });
}

function validateAndFreezeRuntimeManifestDeliveryDescriptors(
  descriptors: readonly RuntimeManifestDeliveryDescriptor[],
): readonly RuntimeManifestDeliveryDescriptor[] {
  const expectedProfiles = new Set<RuntimeManifestDeliveryProfile>(RUNTIME_MANIFEST_DELIVERY_PROFILE_VALUES);
  const seenProfiles = new Set<RuntimeManifestDeliveryProfile>();
  const seenContractIndexes = new Set<string>();
  const seenEtagKeys = new Set<string>();

  for (const descriptor of descriptors) {
    if (!descriptor) {
      throw new Error('Runtime manifest delivery descriptor must not be null');
    }
    if (!expectedProfiles.has(descriptor.profile)) {
      throw new Error(`Unknown runtime manifest delivery profile: ${descriptor.profile}`);
    }
    if (!seenProfiles.add(descriptor.profile)) {
      throw new Error(`Duplicate runtime manifest delivery profile: ${descriptor.profile}`);
    }
    if (!descriptor.schemaVersion.trim()) {
      throw new Error(`Runtime manifest delivery schema version must be non-empty: ${descriptor.profile}`);
    }
    if (!descriptor.contractIndex.startsWith('/')) {
      throw new Error(`Runtime manifest delivery contract index must be absolute: ${descriptor.profile}`);
    }
    if (!seenContractIndexes.add(descriptor.contractIndex)) {
      throw new Error(`Duplicate runtime manifest delivery contract index: ${descriptor.contractIndex}`);
    }
    if (!descriptor.etagKey.trim()) {
      throw new Error(`Runtime manifest delivery ETag key must be non-empty: ${descriptor.profile}`);
    }
    if (!seenEtagKeys.add(descriptor.etagKey)) {
      throw new Error(`Duplicate runtime manifest delivery ETag key: ${descriptor.etagKey}`);
    }
  }

  for (const profile of RUNTIME_MANIFEST_DELIVERY_PROFILE_VALUES) {
    if (!seenProfiles.has(profile)) {
      throw new Error(`Missing runtime manifest delivery profile: ${profile}`);
    }
  }

  return Object.freeze(descriptors.map((descriptor) => Object.freeze({ ...descriptor })));
}

export const RUNTIME_MANIFEST_DELIVERY_DESCRIPTORS = validateAndFreezeRuntimeManifestDeliveryDescriptors([
  runtimeManifestDeliveryDescriptor(
    RUNTIME_MANIFEST_DELIVERY_PROFILES.current,
    'neonei/runtime-manifest/current',
    '/runtime/contracts',
    'runtime-manifest',
  ),
  runtimeManifestDeliveryDescriptor(
    RUNTIME_MANIFEST_DELIVERY_PROFILES.apiV1,
    'neonei/api-v1/runtime-manifest/v1',
    '/api/v1/runtime/contracts',
    'v1-runtime-manifest',
  ),
] as const);

export const RUNTIME_MANIFEST_DELIVERY_CONTRACTS = Object.freeze(
  RUNTIME_MANIFEST_DELIVERY_DESCRIPTORS.reduce(
    (contracts, descriptor) => {
      contracts[descriptor.profile] = Object.freeze({
        schemaVersion: descriptor.schemaVersion,
        contractIndex: descriptor.contractIndex,
      });
      return contracts;
    },
    {} as Record<RuntimeManifestDeliveryProfile, RuntimeManifestDeliveryContract>,
  ),
);

export const RUNTIME_MANIFEST_ETAG_KEYS = Object.freeze(
  RUNTIME_MANIFEST_DELIVERY_DESCRIPTORS.reduce(
    (etagKeys, descriptor) => {
      etagKeys[descriptor.profile] = descriptor.etagKey;
      return etagKeys;
    },
    {} as Record<RuntimeManifestDeliveryProfile, string>,
  ),
);
