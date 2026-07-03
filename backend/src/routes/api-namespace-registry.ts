import type { Application, RequestHandler, Router } from 'express';
import { publicPublishRoutes } from './publish.routes';
import runtimeRoutes from './runtime.routes';
import v1Routes from './v1.routes';
import currentApiRoutes from './current-api.routes';

export type ApiNamespaceKey = 'runtimeRoot' | 'currentApi' | 'publicPublish' | 'v1Runtime';
const API_NAMESPACE_KEYS = Object.freeze([
  'runtimeRoot',
  'currentApi',
  'publicPublish',
  'v1Runtime',
] as const satisfies readonly ApiNamespaceKey[]);

export type ApiNamespaceTier = 'public-runtime';
const API_NAMESPACE_TIERS = Object.freeze([
  'public-runtime',
] as const satisfies readonly ApiNamespaceTier[]);

export type ApiNamespaceHandler = RequestHandler | Router;

export type ApiNamespaceDefinition = Readonly<{
  key: ApiNamespaceKey;
  mountPath: string;
  tier: ApiNamespaceTier;
  handler: ApiNamespaceHandler;
}>;

export type ApiNamespacePlanInput = Readonly<{
  publicRuntimeOnly: boolean;
}>;

export type ApiTierTagger = (tier: ApiNamespaceTier) => RequestHandler;

export const API_NAMESPACE_DESCRIPTORS: readonly ApiNamespaceDefinition[] =
  validateAndFreezeApiNamespaceDescriptors([
    { key: 'runtimeRoot', mountPath: '/runtime', tier: 'public-runtime', handler: runtimeRoutes },
    { key: 'currentApi', mountPath: '/api', tier: 'public-runtime', handler: currentApiRoutes },
    { key: 'publicPublish', mountPath: '/api/publish', tier: 'public-runtime', handler: publicPublishRoutes },
    { key: 'v1Runtime', mountPath: '/api/v1', tier: 'public-runtime', handler: v1Routes },
  ]);

export function getApiNamespacePlan(input: ApiNamespacePlanInput): readonly ApiNamespaceDefinition[] {
  const allowedTiers = input.publicRuntimeOnly
    ? new Set<ApiNamespaceTier>(['public-runtime'])
    : new Set<ApiNamespaceTier>(API_NAMESPACE_TIERS);
  return Object.freeze(API_NAMESPACE_DESCRIPTORS.filter((namespace) => allowedTiers.has(namespace.tier)));
}

export function mountApiNamespace(
  app: Application,
  namespace: ApiNamespaceDefinition,
  tagApiTier: ApiTierTagger,
): void {
  const tag = tagApiTier(namespace.tier);
  app.use(namespace.mountPath, tag, namespace.handler);
}

export function mountApiNamespaces(
  app: Application,
  namespaces: readonly ApiNamespaceDefinition[],
  tagApiTier: ApiTierTagger,
): void {
  for (const namespace of namespaces) {
    mountApiNamespace(app, namespace, tagApiTier);
  }
}

function validateAndFreezeApiNamespaceDescriptors(
  descriptors: readonly ApiNamespaceDefinition[],
): readonly ApiNamespaceDefinition[] {
  const expectedKeys = new Set<ApiNamespaceKey>(API_NAMESPACE_KEYS);
  const allowedTiers = new Set<ApiNamespaceTier>(API_NAMESPACE_TIERS);
  const seenKeys = new Set<string>();
  const seenMountPaths = new Set<string>();

  for (const descriptor of descriptors) {
    if (!descriptor) {
      throw new Error('API namespace descriptor must not be null');
    }
    if (!expectedKeys.has(descriptor.key)) {
      throw new Error(`Unknown API namespace descriptor: ${descriptor.key}`);
    }
    if (!seenKeys.add(descriptor.key)) {
      throw new Error(`Duplicate API namespace descriptor: ${descriptor.key}`);
    }
    if (!descriptor.mountPath || !descriptor.mountPath.startsWith('/')) {
      throw new Error(`API namespace mount path must be absolute: ${descriptor.key}`);
    }
    if (!seenMountPaths.add(descriptor.mountPath)) {
      throw new Error(`Duplicate API namespace mount path: ${descriptor.mountPath}`);
    }
    if (!allowedTiers.has(descriptor.tier)) {
      throw new Error(`Invalid API namespace tier for ${descriptor.key}: ${descriptor.tier}`);
    }
    if (typeof descriptor.handler !== 'function') {
      throw new Error(`API namespace handler must be a function: ${descriptor.key}`);
    }
  }

  for (const key of API_NAMESPACE_KEYS) {
    if (!seenKeys.has(key)) {
      throw new Error(`Missing API namespace descriptor: ${key}`);
    }
  }

  return Object.freeze(descriptors.map((descriptor) => Object.freeze({ ...descriptor })));
}
