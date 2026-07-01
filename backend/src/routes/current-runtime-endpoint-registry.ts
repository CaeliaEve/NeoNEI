import type { RequestHandler, Router } from 'express';

export type CurrentRuntimeEndpointPlane = 'controlfs' | 'debugfs' | 'recipefs' | 'compatfs';
export type CurrentRuntimeEndpointMethod = 'get' | 'use';

export const CURRENT_RUNTIME_ENDPOINTS = Object.freeze([
  Object.freeze({ key: 'current', method: 'get', path: '/runtime/current', plane: 'controlfs' }),
  Object.freeze({ key: 'currentManifest', method: 'get', path: '/runtime/current/manifest', plane: 'controlfs' }),
  Object.freeze({ key: 'currentAssetParam', method: 'get', path: '/runtime/current/asset/:fileName(*)', plane: 'controlfs' }),
  Object.freeze({ key: 'currentAssetMounted', method: 'use', path: '/runtime/current/asset', plane: 'controlfs' }),
  Object.freeze({ key: 'currentReport', method: 'get', path: '/runtime/current/reports/:reportName', plane: 'debugfs' }),
  Object.freeze({ key: 'pinnedManifest', method: 'get', path: '/runtime/:runtimeId/manifest', plane: 'controlfs' }),
  Object.freeze({ key: 'pinnedAssetParam', method: 'get', path: '/runtime/:runtimeId/asset/:fileName(*)', plane: 'controlfs' }),
  Object.freeze({ key: 'pinnedAssetMounted', method: 'use', path: '/runtime/:runtimeId/asset', plane: 'controlfs' }),
  Object.freeze({ key: 'pinnedReport', method: 'get', path: '/runtime/:runtimeId/reports/:reportName', plane: 'debugfs' }),
  Object.freeze({ key: 'nativeManifestCompat', method: 'get', path: '/native-runtime/current/manifest', plane: 'compatfs' }),
  Object.freeze({ key: 'nativeFileCompat', method: 'get', path: '/native-runtime/current/files/:fileName(*)', plane: 'compatfs' }),
  Object.freeze({ key: 'recipeItem', method: 'get', path: '/recipes/item/:itemId', plane: 'recipefs' }),
  Object.freeze({ key: 'recipeCurrentItem', method: 'get', path: '/recipes/current/item/:itemId', plane: 'recipefs' }),
  Object.freeze({ key: 'recipeUsage', method: 'get', path: '/recipes/usage/:itemId', plane: 'recipefs' }),
  Object.freeze({ key: 'recipePage', method: 'get', path: '/recipes/page/:recipePageId(*)', plane: 'recipefs' }),
  Object.freeze({ key: 'recipeCurrentUsage', method: 'get', path: '/recipes/current/usage/:itemId', plane: 'recipefs' }),
  Object.freeze({ key: 'diagnosticsHealth', method: 'get', path: '/diagnostics/health', plane: 'debugfs' }),
  Object.freeze({ key: 'diagnosticsRuntimeSummary', method: 'get', path: '/diagnostics/runtime-summary', plane: 'debugfs' }),
  Object.freeze({ key: 'healthCurrentRuntime', method: 'get', path: '/health/current/runtime', plane: 'debugfs' }),
  Object.freeze({ key: 'nativeSurfaceMetrics', method: 'get', path: '/metrics/current/native-surface', plane: 'debugfs' }),
  Object.freeze({ key: 'runtimeSettings', method: 'get', path: '/settings/runtime', plane: 'controlfs' }),
] as const);

export type CurrentRuntimeEndpoint = (typeof CURRENT_RUNTIME_ENDPOINTS)[number];
export type CurrentRuntimeEndpointKey = CurrentRuntimeEndpoint['key'];

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
