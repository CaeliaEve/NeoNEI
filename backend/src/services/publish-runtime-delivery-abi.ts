/** Publish runtime delivery ABI catalog. */

import { createWeakEtag } from '../utils/http-cache';
import type { AccelerationCompilerAuthority } from './acceleration-runtime-compiler-authority.service';
import type { PublicRuntimeManifest } from './publish-manifest.service';

export type PublishHomeBootstrapQuery = Readonly<{
  page?: unknown;
  pageSize?: unknown;
  slotSize?: unknown;
  modId?: unknown;
}>;

export type NormalizedPublishHomeBootstrapQuery = Readonly<{
  page: number;
  pageSize: number;
  slotSize: number;
  modId?: string;
}>;

export type PublishHomeBootstrapIntegerParamKey =
  | 'page'
  | 'pageSize'
  | 'slotSize';

export type PublishHomeBootstrapIntegerParamDescriptor = Readonly<{
  key: PublishHomeBootstrapIntegerParamKey;
  fallback: number;
  min: number;
  max: number;
}>;

export type PublishRuntimeEtagNamespaceKey =
  | 'manifest'
  | 'homeBootstrap';

export type PublishRuntimeEtagNamespaceDescriptor = Readonly<{
  key: PublishRuntimeEtagNamespaceKey;
  namespace: string;
}>;

export type PublishHomeBootstrapMaterializedPolicy = Readonly<{
  page: number;
  allModsSentinel: string;
}>;

export type PublishRuntimeExternalAuthorityPolicy = Readonly<{
  authority: AccelerationCompilerAuthority;
  bundleRequiredMessage: string;
  bundleRequiredCode: string;
}>;

export type PublishRuntimeExternalBundleRequiredError = Readonly<{
  message: string;
  code: string;
}>;

export const PUBLISH_HOME_BOOTSTRAP_INTEGER_PARAM_DESCRIPTORS = validateAndFreezeIntegerParamDescriptors([
  {
    key: 'page',
    fallback: 1,
    min: 1,
    max: 1_000_000,
  },
  {
    key: 'pageSize',
    fallback: 50,
    min: 1,
    max: 500,
  },
  {
    key: 'slotSize',
    fallback: 48,
    min: 24,
    max: 128,
  },
]);

export const PUBLISH_HOME_BOOTSTRAP_INTEGER_PARAMS = projectIntegerParamMap(
  PUBLISH_HOME_BOOTSTRAP_INTEGER_PARAM_DESCRIPTORS,
);

export const PUBLISH_RUNTIME_ETAG_NAMESPACE_DESCRIPTORS = validateAndFreezeEtagNamespaceDescriptors([
  {
    key: 'manifest',
    namespace: 'publish-manifest',
  },
  {
    key: 'homeBootstrap',
    namespace: 'publish-home-bootstrap',
  },
]);

export const PUBLISH_RUNTIME_ETAG_NAMESPACES = projectEtagNamespaceMap(
  PUBLISH_RUNTIME_ETAG_NAMESPACE_DESCRIPTORS,
);

export const PUBLISH_HOME_BOOTSTRAP_MATERIALIZED_POLICY = validateAndFreezeMaterializedPolicy({
  page: 1,
  allModsSentinel: 'all',
});

export const PUBLISH_RUNTIME_EXTERNAL_AUTHORITY_POLICY = validateAndFreezeExternalAuthorityPolicy({
  authority: 'external-runtime',
  bundleRequiredMessage: 'External runtime publish home bootstrap requires a materialized publish bundle; dynamic SQLite fallback is disabled.',
  bundleRequiredCode: 'EXTERNAL_RUNTIME_PUBLISH_BUNDLE_REQUIRED',
});

export function normalizeHomeBootstrapQuery(
  query: PublishHomeBootstrapQuery,
): NormalizedPublishHomeBootstrapQuery {
  const modIdRaw = typeof query.modId === 'string' ? query.modId.trim() : '';
  const modId = modIdRaw && modIdRaw !== PUBLISH_HOME_BOOTSTRAP_MATERIALIZED_POLICY.allModsSentinel
    ? modIdRaw
    : undefined;
  return Object.freeze({
    page: parseBoundedInteger(query.page, PUBLISH_HOME_BOOTSTRAP_INTEGER_PARAMS.page),
    pageSize: parseBoundedInteger(query.pageSize, PUBLISH_HOME_BOOTSTRAP_INTEGER_PARAMS.pageSize),
    slotSize: parseBoundedInteger(query.slotSize, PUBLISH_HOME_BOOTSTRAP_INTEGER_PARAMS.slotSize),
    modId,
  });
}

export function shouldUseMaterializedHomeBootstrap(
  manifest: PublicRuntimeManifest,
  query: NormalizedPublishHomeBootstrapQuery,
): boolean {
  return query.page === PUBLISH_HOME_BOOTSTRAP_MATERIALIZED_POLICY.page
    && !query.modId
    && (manifest.publishBundle?.files.homeBootstrapWindows?.length ?? 0) > 0;
}

export function isPublishExternalRuntimeAuthority(
  authority: AccelerationCompilerAuthority,
): boolean {
  return authority === PUBLISH_RUNTIME_EXTERNAL_AUTHORITY_POLICY.authority;
}

export function getPublishRuntimeExternalBundleRequiredError(): PublishRuntimeExternalBundleRequiredError {
  return Object.freeze({
    message: PUBLISH_RUNTIME_EXTERNAL_AUTHORITY_POLICY.bundleRequiredMessage,
    code: PUBLISH_RUNTIME_EXTERNAL_AUTHORITY_POLICY.bundleRequiredCode,
  });
}

export function createPublishManifestEtag(manifest: PublicRuntimeManifest): string {
  return createWeakEtag(
    PUBLISH_RUNTIME_ETAG_NAMESPACES.manifest,
    manifest.version,
    manifest.sourceSignature,
    manifest.compiledAt,
    manifest.publishRevision,
    manifest.publishCompiledAt,
    manifest.runtimeCacheKey,
  );
}

export function createHomeBootstrapEtag(
  manifest: PublicRuntimeManifest,
  query: NormalizedPublishHomeBootstrapQuery,
): string {
  return createWeakEtag(
    PUBLISH_RUNTIME_ETAG_NAMESPACES.homeBootstrap,
    manifest.version,
    manifest.runtimeCacheKey,
    manifest.compiledAt,
    query.page,
    query.pageSize,
    query.slotSize,
    query.modId ?? PUBLISH_HOME_BOOTSTRAP_MATERIALIZED_POLICY.allModsSentinel,
  );
}

export function getMaterializedHomeBootstrapPage(): number {
  return PUBLISH_HOME_BOOTSTRAP_MATERIALIZED_POLICY.page;
}

function parseBoundedInteger(
  value: unknown,
  descriptor: PublishHomeBootstrapIntegerParamDescriptor,
): number {
  const parsed = Number.parseInt(`${value ?? ''}`, 10);
  if (!Number.isFinite(parsed)) return descriptor.fallback;
  return Math.max(descriptor.min, Math.min(descriptor.max, Math.floor(parsed)));
}

function validateAndFreezeIntegerParamDescriptors(
  descriptors: readonly PublishHomeBootstrapIntegerParamDescriptor[],
): readonly PublishHomeBootstrapIntegerParamDescriptor[] {
  const expected = new Set<PublishHomeBootstrapIntegerParamKey>(['page', 'pageSize', 'slotSize']);
  const seen = new Set<PublishHomeBootstrapIntegerParamKey>();
  for (const descriptor of descriptors) {
    if (!expected.has(descriptor.key)) {
      throw new Error(`Unknown publish home-bootstrap integer parameter: ${descriptor.key}`);
    }
    if (!seen.add(descriptor.key)) {
      throw new Error(`Duplicate publish home-bootstrap integer parameter: ${descriptor.key}`);
    }
    if (!Number.isInteger(descriptor.fallback)) {
      throw new Error(`Publish home-bootstrap fallback must be an integer: ${descriptor.key}`);
    }
    if (!Number.isInteger(descriptor.min) || descriptor.min <= 0) {
      throw new Error(`Publish home-bootstrap minimum must be positive: ${descriptor.key}`);
    }
    if (!Number.isInteger(descriptor.max) || descriptor.max < descriptor.min) {
      throw new Error(`Publish home-bootstrap maximum must be >= minimum: ${descriptor.key}`);
    }
    if (descriptor.fallback < descriptor.min || descriptor.fallback > descriptor.max) {
      throw new Error(`Publish home-bootstrap fallback must be within bounds: ${descriptor.key}`);
    }
  }
  for (const key of expected) {
    if (!seen.has(key)) {
      throw new Error(`Missing publish home-bootstrap integer parameter: ${key}`);
    }
  }
  return Object.freeze(descriptors.map((descriptor) => Object.freeze({ ...descriptor })));
}

function validateAndFreezeEtagNamespaceDescriptors(
  descriptors: readonly PublishRuntimeEtagNamespaceDescriptor[],
): readonly PublishRuntimeEtagNamespaceDescriptor[] {
  const expected = new Set<PublishRuntimeEtagNamespaceKey>(['manifest', 'homeBootstrap']);
  const seen = new Set<PublishRuntimeEtagNamespaceKey>();
  const namespaces = new Set<string>();
  for (const descriptor of descriptors) {
    if (!expected.has(descriptor.key)) {
      throw new Error(`Unknown publish runtime ETag namespace: ${descriptor.key}`);
    }
    if (!seen.add(descriptor.key)) {
      throw new Error(`Duplicate publish runtime ETag namespace key: ${descriptor.key}`);
    }
    if (!descriptor.namespace.trim()) {
      throw new Error(`Publish runtime ETag namespace must be non-empty: ${descriptor.key}`);
    }
    if (!namespaces.add(descriptor.namespace)) {
      throw new Error(`Duplicate publish runtime ETag namespace: ${descriptor.namespace}`);
    }
  }
  for (const key of expected) {
    if (!seen.has(key)) {
      throw new Error(`Missing publish runtime ETag namespace: ${key}`);
    }
  }
  return Object.freeze(descriptors.map((descriptor) => Object.freeze({ ...descriptor })));
}

function validateAndFreezeMaterializedPolicy(
  policy: PublishHomeBootstrapMaterializedPolicy,
): PublishHomeBootstrapMaterializedPolicy {
  if (!Number.isInteger(policy.page) || policy.page <= 0) {
    throw new Error('Publish home-bootstrap materialized page must be positive');
  }
  if (!policy.allModsSentinel.trim()) {
    throw new Error('Publish home-bootstrap all-mods sentinel must be non-empty');
  }
  return Object.freeze({ ...policy });
}

function validateAndFreezeExternalAuthorityPolicy(
  policy: PublishRuntimeExternalAuthorityPolicy,
): PublishRuntimeExternalAuthorityPolicy {
  if (policy.authority !== 'external-runtime') {
    throw new Error(`Publish runtime external authority must be external-runtime: ${policy.authority}`);
  }
  if (!policy.bundleRequiredMessage.trim()) {
    throw new Error('Publish runtime external bundle-required message must be non-empty');
  }
  if (!policy.bundleRequiredCode.trim()) {
    throw new Error('Publish runtime external bundle-required code must be non-empty');
  }
  return Object.freeze({ ...policy });
}

function projectIntegerParamMap(
  descriptors: readonly PublishHomeBootstrapIntegerParamDescriptor[],
): Readonly<Record<PublishHomeBootstrapIntegerParamKey, PublishHomeBootstrapIntegerParamDescriptor>> {
  return Object.freeze(
    descriptors.reduce(
      (map, descriptor) => {
        map[descriptor.key] = descriptor;
        return map;
      },
      {} as Record<PublishHomeBootstrapIntegerParamKey, PublishHomeBootstrapIntegerParamDescriptor>,
    ),
  );
}

function projectEtagNamespaceMap(
  descriptors: readonly PublishRuntimeEtagNamespaceDescriptor[],
): Readonly<Record<PublishRuntimeEtagNamespaceKey, string>> {
  return Object.freeze(
    descriptors.reduce(
      (map, descriptor) => {
        map[descriptor.key] = descriptor.namespace;
        return map;
      },
      {} as Record<PublishRuntimeEtagNamespaceKey, string>,
    ),
  );
}
