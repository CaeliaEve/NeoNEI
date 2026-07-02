/** Stable manifest delivery contract catalog for public runtime manifests. */

export const RUNTIME_MANIFEST_DELIVERY_PROFILES = Object.freeze({
  current: 'current',
  apiV1: 'api-v1',
} as const);

export type RuntimeManifestDeliveryProfile =
  typeof RUNTIME_MANIFEST_DELIVERY_PROFILES[keyof typeof RUNTIME_MANIFEST_DELIVERY_PROFILES];

export const RUNTIME_MANIFEST_DELIVERY_CONTRACTS = Object.freeze({
  [RUNTIME_MANIFEST_DELIVERY_PROFILES.current]: Object.freeze({
    schemaVersion: 'neonei/runtime-manifest/current',
    contractIndex: '/runtime/contracts',
  }),
  [RUNTIME_MANIFEST_DELIVERY_PROFILES.apiV1]: Object.freeze({
    schemaVersion: 'neonei/api-v1/runtime-manifest/v1',
    contractIndex: '/api/v1/runtime/contracts',
  }),
} as const);

export const RUNTIME_MANIFEST_ETAG_KEYS = Object.freeze({
  [RUNTIME_MANIFEST_DELIVERY_PROFILES.current]: 'runtime-manifest',
  [RUNTIME_MANIFEST_DELIVERY_PROFILES.apiV1]: 'v1-runtime-manifest',
} as const);
