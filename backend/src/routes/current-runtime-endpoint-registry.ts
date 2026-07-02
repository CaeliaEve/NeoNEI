import type { RequestHandler, Router } from 'express';
import { validateAndFreezeRouteDescriptors } from './route-descriptor-registry';

export type CurrentRuntimeEndpointPlane = 'controlfs' | 'datafs' | 'debugfs' | 'recipefs';
export type CurrentRuntimeEndpointMethod = 'get' | 'use';
const CURRENT_RUNTIME_ENDPOINT_PLANES = Object.freeze([
  'controlfs',
  'datafs',
  'debugfs',
  'recipefs',
] as const satisfies readonly CurrentRuntimeEndpointPlane[]);
const CURRENT_RUNTIME_ENDPOINT_METHODS = Object.freeze([
  'get',
  'use',
] as const satisfies readonly CurrentRuntimeEndpointMethod[]);
const CURRENT_RUNTIME_ENDPOINT_KEYS = Object.freeze([
  'current',
  'currentManifest',
  'currentAssetParam',
  'currentAssetMounted',
  'currentReport',
  'pinnedManifest',
  'pinnedAssetParam',
  'pinnedAssetMounted',
  'pinnedReport',
  'recipeItem',
  'recipeCurrentItem',
  'recipeUsage',
  'recipePage',
  'recipeCurrentUsage',
  'diagnosticsHealth',
  'diagnosticsRuntimeSummary',
  'healthCurrentRuntime',
  'nativeSurfaceMetrics',
  'runtimeSettings',
  'runtimeDataGTDiagramsOverview',
  'runtimeDataForestryGeneticsOverview',
  'runtimeDataMultiblockBlueprint',
] as const);

export type CurrentRuntimeEndpointKey = (typeof CURRENT_RUNTIME_ENDPOINT_KEYS)[number];
export type CurrentRuntimeEndpoint = Readonly<{
  key: CurrentRuntimeEndpointKey;
  method: CurrentRuntimeEndpointMethod;
  path: string;
  plane: CurrentRuntimeEndpointPlane;
}>;

export const CURRENT_RUNTIME_ENDPOINTS: readonly CurrentRuntimeEndpoint[] =
  validateAndFreezeRouteDescriptors({
    label: 'current runtime endpoint',
    expectedKeys: CURRENT_RUNTIME_ENDPOINT_KEYS,
    allowedMethods: CURRENT_RUNTIME_ENDPOINT_METHODS,
    allowedPlanes: CURRENT_RUNTIME_ENDPOINT_PLANES,
    descriptors: [
      { key: 'current', method: 'get', path: '/runtime/current', plane: 'controlfs' },
      { key: 'currentManifest', method: 'get', path: '/runtime/current/manifest', plane: 'controlfs' },
      { key: 'currentAssetParam', method: 'get', path: '/runtime/current/asset/:fileName(*)', plane: 'controlfs' },
      { key: 'currentAssetMounted', method: 'use', path: '/runtime/current/asset', plane: 'controlfs' },
      { key: 'currentReport', method: 'get', path: '/runtime/current/reports/:reportName', plane: 'debugfs' },
      { key: 'pinnedManifest', method: 'get', path: '/runtime/:runtimeId/manifest', plane: 'controlfs' },
      { key: 'pinnedAssetParam', method: 'get', path: '/runtime/:runtimeId/asset/:fileName(*)', plane: 'controlfs' },
      { key: 'pinnedAssetMounted', method: 'use', path: '/runtime/:runtimeId/asset', plane: 'controlfs' },
      { key: 'pinnedReport', method: 'get', path: '/runtime/:runtimeId/reports/:reportName', plane: 'debugfs' },
      { key: 'recipeItem', method: 'get', path: '/recipes/item/:itemId', plane: 'recipefs' },
      { key: 'recipeCurrentItem', method: 'get', path: '/recipes/current/item/:itemId', plane: 'recipefs' },
      { key: 'recipeUsage', method: 'get', path: '/recipes/usage/:itemId', plane: 'recipefs' },
      { key: 'recipePage', method: 'get', path: '/recipes/page/:recipePageId(*)', plane: 'recipefs' },
      { key: 'recipeCurrentUsage', method: 'get', path: '/recipes/current/usage/:itemId', plane: 'recipefs' },
      { key: 'diagnosticsHealth', method: 'get', path: '/diagnostics/health', plane: 'debugfs' },
      { key: 'diagnosticsRuntimeSummary', method: 'get', path: '/diagnostics/runtime-summary', plane: 'debugfs' },
      { key: 'healthCurrentRuntime', method: 'get', path: '/health/current/runtime', plane: 'debugfs' },
      { key: 'nativeSurfaceMetrics', method: 'get', path: '/metrics/current/native-surface', plane: 'debugfs' },
      { key: 'runtimeSettings', method: 'get', path: '/settings/runtime', plane: 'controlfs' },
      {
        key: 'runtimeDataGTDiagramsOverview',
        method: 'get',
        path: '/runtime/current/data/gt-diagrams/overview',
        plane: 'datafs',
      },
      {
        key: 'runtimeDataForestryGeneticsOverview',
        method: 'get',
        path: '/runtime/current/data/forestry-genetics/overview',
        plane: 'datafs',
      },
      {
        key: 'runtimeDataMultiblockBlueprint',
        method: 'get',
        path: '/runtime/current/data/multiblocks/:controllerItemId',
        plane: 'datafs',
      },
    ],
  });

export function getCurrentRuntimeEndpoint(key: CurrentRuntimeEndpointKey): CurrentRuntimeEndpoint {
  const endpoint = CURRENT_RUNTIME_ENDPOINTS.find((candidate) => candidate.key === key);
  if (!endpoint) {
    throw new Error(`Unknown current runtime endpoint: ${key}`);
  }
  return endpoint;
}

export function getCurrentRuntimeEndpointPaths(): readonly string[] {
  return Object.freeze(CURRENT_RUNTIME_ENDPOINTS.map((endpoint) => endpoint.path));
}

export function mountCurrentRuntimeEndpoint(
  router: Router,
  key: CurrentRuntimeEndpointKey,
  ...handlers: RequestHandler[]
): void {
  const endpoint = getCurrentRuntimeEndpoint(key);
  if (endpoint.method === 'get') {
    router.get(endpoint.path, ...handlers);
    return;
  }
  router.use(endpoint.path, ...handlers);
}
