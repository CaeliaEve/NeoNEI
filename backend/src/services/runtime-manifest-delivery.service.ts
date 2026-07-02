import { createWeakEtag } from '../utils/http-cache';
import { getPublishManifestService, type PublicRuntimeManifest } from './publish-manifest.service';

type RuntimeManifestDeliveryProfile = 'current' | 'api-v1';

type RuntimeManifestContract = Readonly<{
  schemaVersion: 'neonei/runtime-manifest/current' | 'neonei/api-v1/runtime-manifest/v1';
  contractIndex: '/runtime/contracts' | '/api/v1/runtime/contracts';
}>;

export type RuntimeManifestPayload = PublicRuntimeManifest & Readonly<{
  contract: RuntimeManifestContract;
}>;

export type RuntimeManifestDelivery = Readonly<{
  payload: RuntimeManifestPayload;
  etag: string;
}>;

const RUNTIME_MANIFEST_DELIVERY_CONTRACTS: Record<RuntimeManifestDeliveryProfile, RuntimeManifestContract> = Object.freeze({
  current: Object.freeze({
    schemaVersion: 'neonei/runtime-manifest/current',
    contractIndex: '/runtime/contracts',
  }),
  'api-v1': Object.freeze({
    schemaVersion: 'neonei/api-v1/runtime-manifest/v1',
    contractIndex: '/api/v1/runtime/contracts',
  }),
});

const RUNTIME_MANIFEST_ETAG_KEYS: Record<RuntimeManifestDeliveryProfile, string> = Object.freeze({
  current: 'runtime-manifest',
  'api-v1': 'v1-runtime-manifest',
});

function createRuntimeManifestEtag(profile: RuntimeManifestDeliveryProfile, manifest: PublicRuntimeManifest): string {
  return createWeakEtag(
    RUNTIME_MANIFEST_ETAG_KEYS[profile],
    manifest.version,
    manifest.sourceSignature,
    manifest.compiledAt,
    manifest.publishRevision,
    manifest.publishCompiledAt,
    manifest.runtimeCacheKey,
  );
}

function createRuntimeManifestDelivery(profile: RuntimeManifestDeliveryProfile): RuntimeManifestDelivery {
  const manifest = getPublishManifestService().getRuntimeManifest();
  return Object.freeze({
    payload: Object.freeze({
      ...manifest,
      contract: RUNTIME_MANIFEST_DELIVERY_CONTRACTS[profile],
    }),
    etag: createRuntimeManifestEtag(profile, manifest),
  });
}

export function getCurrentRuntimeManifestDelivery(): RuntimeManifestDelivery {
  return createRuntimeManifestDelivery('current');
}

export function getApiV1RuntimeManifestDelivery(): RuntimeManifestDelivery {
  return createRuntimeManifestDelivery('api-v1');
}
