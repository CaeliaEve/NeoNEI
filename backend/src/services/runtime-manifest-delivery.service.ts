import { createWeakEtag } from '../utils/http-cache';
import { getPublishManifestService, type PublicRuntimeManifest } from './publish-manifest.service';
import {
  RUNTIME_MANIFEST_DELIVERY_CONTRACTS,
  RUNTIME_MANIFEST_DELIVERY_PROFILES,
  RUNTIME_MANIFEST_ETAG_KEYS,
  type RuntimeManifestDeliveryProfile,
} from './runtime-manifest-delivery-abi';

type RuntimeManifestContract = Readonly<{
  schemaVersion: typeof RUNTIME_MANIFEST_DELIVERY_CONTRACTS[RuntimeManifestDeliveryProfile]['schemaVersion'];
  contractIndex: typeof RUNTIME_MANIFEST_DELIVERY_CONTRACTS[RuntimeManifestDeliveryProfile]['contractIndex'];
}>;

export type RuntimeManifestPayload = PublicRuntimeManifest & Readonly<{
  contract: RuntimeManifestContract;
}>;

export type RuntimeManifestDelivery = Readonly<{
  payload: RuntimeManifestPayload;
  etag: string;
}>;

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
  return createRuntimeManifestDelivery(RUNTIME_MANIFEST_DELIVERY_PROFILES.current);
}

export function getApiV1RuntimeManifestDelivery(): RuntimeManifestDelivery {
  return createRuntimeManifestDelivery(RUNTIME_MANIFEST_DELIVERY_PROFILES.apiV1);
}
