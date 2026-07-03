import {
  CONTRACTS_DIR,
  IMAGES_PATH,
  PUBLIC_DIR,
  PUBLISH_OUTPUT_DIR,
} from '../config/runtime-paths';
import type { ImageArtifactFamily } from '../services/static-asset-delivery.service';
import { validateAndFreezeRouteDescriptors } from './route-descriptor-registry';

export type StaticAssetFallbackRouteKey =
  | 'imageItem'
  | 'imageFluid'
  | 'imageEntity'
  | 'apiImageItem'
  | 'apiImageFluid'
  | 'apiImageEntity';

const STATIC_ASSET_FALLBACK_ROUTE_KEYS = Object.freeze([
  'imageItem',
  'imageFluid',
  'imageEntity',
  'apiImageItem',
  'apiImageFluid',
  'apiImageEntity',
] as const satisfies readonly StaticAssetFallbackRouteKey[]);

const STATIC_ASSET_FALLBACK_ROUTE_METHODS = Object.freeze(['get'] as const);
const STATIC_ASSET_IMAGE_FAMILIES = Object.freeze(['item', 'fluid', 'entity'] as const);

export type StaticAssetFallbackRoute = Readonly<{
  key: StaticAssetFallbackRouteKey;
  method: 'get';
  path: string;
  family: ImageArtifactFamily;
}>;

export const STATIC_ASSET_FALLBACK_ROUTES: readonly StaticAssetFallbackRoute[] =
  validateAndFreezeStaticAssetFallbackRoutes([
    { key: 'imageItem', method: 'get', path: '/images/item/:modId/:fileName', family: 'item' },
    { key: 'imageFluid', method: 'get', path: '/images/fluid/:modId/:fileName', family: 'fluid' },
    { key: 'imageEntity', method: 'get', path: '/images/entity/:modId/:fileName', family: 'entity' },
    { key: 'apiImageItem', method: 'get', path: '/api/images/item/:modId/:fileName', family: 'item' },
    { key: 'apiImageFluid', method: 'get', path: '/api/images/fluid/:modId/:fileName', family: 'fluid' },
    { key: 'apiImageEntity', method: 'get', path: '/api/images/entity/:modId/:fileName', family: 'entity' },
  ]);

export type StaticAssetMountKey =
  | 'publicRoot'
  | 'contracts'
  | 'images'
  | 'apiImages'
  | 'publishPrecompressed'
  | 'publishStatic';

const STATIC_ASSET_MOUNT_KEYS = Object.freeze([
  'publicRoot',
  'contracts',
  'images',
  'apiImages',
  'publishPrecompressed',
  'publishStatic',
] as const satisfies readonly StaticAssetMountKey[]);

export type StaticAssetMountKind =
  | 'public-root'
  | 'static'
  | 'publish-precompressed'
  | 'publish-static';

const STATIC_ASSET_MOUNT_KINDS = Object.freeze([
  'public-root',
  'static',
  'publish-precompressed',
  'publish-static',
] as const satisfies readonly StaticAssetMountKind[]);

export type StaticAssetCachePolicy = Readonly<{
  maxAge?: string | number;
  immutable?: boolean;
  etag?: boolean;
}>;

export type StaticAssetMountPhase = 'before-fallback' | 'after-fallback';
const STATIC_ASSET_MOUNT_PHASES = Object.freeze([
  'before-fallback',
  'after-fallback',
] as const satisfies readonly StaticAssetMountPhase[]);

export type StaticAssetMountDescriptor = Readonly<{
  key: StaticAssetMountKey;
  kind: StaticAssetMountKind;
  phase: StaticAssetMountPhase;
  mountPath: string | null;
  rootDir: string;
  cache: StaticAssetCachePolicy;
  requireExistingDirectory?: boolean;
}>;

export const STATIC_ASSET_MOUNTS: readonly StaticAssetMountDescriptor[] =
  validateAndFreezeStaticAssetMounts([
    {
      key: 'publicRoot',
      kind: 'public-root',
      phase: 'before-fallback',
      mountPath: null,
      rootDir: PUBLIC_DIR,
      cache: Object.freeze({}),
    },
    {
      key: 'contracts',
      kind: 'static',
      phase: 'before-fallback',
      mountPath: '/contracts',
      rootDir: CONTRACTS_DIR,
      requireExistingDirectory: true,
      cache: Object.freeze({ maxAge: '1h', etag: true }),
    },
    {
      key: 'images',
      kind: 'static',
      phase: 'after-fallback',
      mountPath: '/images',
      rootDir: IMAGES_PATH,
      cache: Object.freeze({ maxAge: '7d', etag: true }),
    },
    {
      key: 'apiImages',
      kind: 'static',
      phase: 'after-fallback',
      mountPath: '/api/images',
      rootDir: IMAGES_PATH,
      cache: Object.freeze({ maxAge: '7d', etag: true }),
    },
    {
      key: 'publishPrecompressed',
      kind: 'publish-precompressed',
      phase: 'after-fallback',
      mountPath: '/publish',
      rootDir: PUBLISH_OUTPUT_DIR,
      cache: Object.freeze({ maxAge: '365d', immutable: true }),
    },
    {
      key: 'publishStatic',
      kind: 'publish-static',
      phase: 'after-fallback',
      mountPath: '/publish',
      rootDir: PUBLISH_OUTPUT_DIR,
      cache: Object.freeze({ maxAge: '365d', immutable: true, etag: true }),
    },
  ]);

export const STATIC_ASSET_PRE_FALLBACK_MOUNTS = projectStaticAssetMountPhase(
  STATIC_ASSET_MOUNTS,
  'before-fallback',
);
export const STATIC_ASSET_POST_FALLBACK_MOUNTS = projectStaticAssetMountPhase(
  STATIC_ASSET_MOUNTS,
  'after-fallback',
);

function validateAndFreezeStaticAssetFallbackRoutes(
  descriptors: readonly StaticAssetFallbackRoute[],
): readonly StaticAssetFallbackRoute[] {
  const familySet = new Set<string>(STATIC_ASSET_IMAGE_FAMILIES);
  const routeDescriptors = validateAndFreezeRouteDescriptors({
    label: 'static asset fallback route',
    expectedKeys: STATIC_ASSET_FALLBACK_ROUTE_KEYS,
    allowedMethods: STATIC_ASSET_FALLBACK_ROUTE_METHODS,
    descriptors,
  });

  for (const descriptor of routeDescriptors) {
    if (!familySet.has(descriptor.family)) {
      throw new Error(`Invalid static asset fallback family for ${descriptor.key}: ${descriptor.family}`);
    }
  }

  return Object.freeze(routeDescriptors.map((descriptor) => Object.freeze({ ...descriptor })));
}

function validateAndFreezeStaticAssetMounts(
  descriptors: readonly StaticAssetMountDescriptor[],
): readonly StaticAssetMountDescriptor[] {
  const expectedKeys = new Set<StaticAssetMountKey>(STATIC_ASSET_MOUNT_KEYS);
  const allowedKinds = new Set<StaticAssetMountKind>(STATIC_ASSET_MOUNT_KINDS);
  const allowedPhases = new Set<StaticAssetMountPhase>(STATIC_ASSET_MOUNT_PHASES);
  const seenKeys = new Set<string>();
  const seenMountKinds = new Set<string>();

  for (const descriptor of descriptors) {
    if (!descriptor) {
      throw new Error('static asset mount descriptor must not be null');
    }
    if (!expectedKeys.has(descriptor.key)) {
      throw new Error(`Unknown static asset mount descriptor: ${descriptor.key}`);
    }
    if (!seenKeys.add(descriptor.key)) {
      throw new Error(`Duplicate static asset mount descriptor: ${descriptor.key}`);
    }
    if (!allowedKinds.has(descriptor.kind)) {
      throw new Error(`Invalid static asset mount kind for ${descriptor.key}: ${descriptor.kind}`);
    }
    if (!allowedPhases.has(descriptor.phase)) {
      throw new Error(`Invalid static asset mount phase for ${descriptor.key}: ${descriptor.phase}`);
    }
    if (descriptor.kind === 'public-root') {
      if (descriptor.mountPath !== null) {
        throw new Error(`static asset public-root mount must not declare a mount path: ${descriptor.key}`);
      }
    } else if (!descriptor.mountPath || !descriptor.mountPath.startsWith('/')) {
      throw new Error(`static asset mount path must be absolute: ${descriptor.key}`);
    }
    if (!descriptor.rootDir.trim()) {
      throw new Error(`static asset mount rootDir must be non-empty: ${descriptor.key}`);
    }
    const mountKindSignature = `${descriptor.kind} ${descriptor.mountPath ?? '<root>'}`;
    if (!seenMountKinds.add(mountKindSignature)) {
      throw new Error(`Duplicate static asset mount kind/path signature: ${mountKindSignature}`);
    }
  }

  for (const key of STATIC_ASSET_MOUNT_KEYS) {
    if (!seenKeys.has(key)) {
      throw new Error(`Missing static asset mount descriptor: ${key}`);
    }
  }

  return Object.freeze(
    descriptors.map((descriptor) =>
      Object.freeze({
        ...descriptor,
        cache: Object.freeze({ ...descriptor.cache }),
      }),
    ),
  );
}

function projectStaticAssetMountPhase(
  descriptors: readonly StaticAssetMountDescriptor[],
  phase: StaticAssetMountPhase,
): readonly StaticAssetMountDescriptor[] {
  return Object.freeze(descriptors.filter((descriptor) => descriptor.phase === phase));
}
