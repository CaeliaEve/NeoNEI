import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const routeSource = readFileSync(resolve(root, 'src/routes/current-api.routes.ts'), 'utf8');
const handlerSource = readFileSync(resolve(root, 'src/routes/current-runtime-endpoint-handlers.ts'), 'utf8');
const handlerAbiSource = readFileSync(resolve(root, 'src/routes/current-runtime-endpoint-handler-abi.ts'), 'utf8');
const endpointRegistrySource = readFileSync(resolve(root, 'src/routes/current-runtime-endpoint-registry.ts'), 'utf8');
const routeDescriptorRegistrySource = readFileSync(resolve(root, 'src/routes/route-descriptor-registry.ts'), 'utf8');
const readServiceSource = readFileSync(resolve(root, 'src/services/current-runtime-read.service.ts'), 'utf8');
const readCatalogSource = readFileSync(resolve(root, 'src/services/current-runtime-read-catalog.ts'), 'utf8');

test('current runtime API route is only an endpoint mount table consumer', () => {
  assert.match(routeSource, /for \(const endpoint of CURRENT_RUNTIME_ENDPOINTS\)/);
  assert.match(routeSource, /mountCurrentRuntimeEndpoint\(router, endpoint\.key, getCurrentRuntimeEndpointHandler\(endpoint\.key\)\)/);
  assert.match(routeSource, /export default router/);

  for (const routeLocalPolicy of [
    /from '\.\.\/services\//,
    /withCurrentRuntimeApiContext/,
    /getCurrentRecipe/,
    /getCurrentRuntimeDiagnostics/,
    /getCurrentRuntimeSettings/,
    /getCurrentRuntimeGTDiagramsOverview/,
    /sendCurrentRuntime/,
    /assertCurrentRuntimeId/,
    /asyncHandler/,
    /req\.params/,
  ]) {
    assert.doesNotMatch(routeSource, routeLocalPolicy);
  }
});

test('current runtime endpoint handlers are explicitly keyed and exhaustive', () => {
  assert.match(handlerSource, /Readonly<Record<CurrentRuntimeEndpointKey, RequestHandler>>/);
  assert.match(handlerSource, /export const CURRENT_RUNTIME_ENDPOINT_HANDLERS/);
  assert.match(handlerSource, /validateAndFreezeRouteHandlers/);
  assert.match(handlerSource, /descriptors: CURRENT_RUNTIME_ENDPOINTS/);
  assert.match(handlerSource, /label: 'current runtime endpoint'/);
  assert.match(handlerSource, /export function getCurrentRuntimeEndpointHandler/);
  assert.match(handlerSource, /CURRENT_RUNTIME_ENDPOINT_HANDLER_DESCRIPTORS/);
  assert.match(handlerSource, /createCurrentRuntimeEndpointHandler\(descriptor\)/);
  assert.match(handlerSource, /withCurrentRuntimeApiContext/);
  assert.match(handlerSource, /withCurrentRuntimeApiContextAsync/);
  assert.match(handlerSource, /assertCurrentRuntimeId/);
  assert.match(handlerSource, /sendCurrentRuntimeManifest/);
  assert.match(handlerSource, /sendCurrentRuntimeAsset/);
  assert.match(handlerSource, /sendCurrentRuntimeReport/);
  assert.match(handlerSource, /current-runtime-read\.service/);
  assert.match(handlerSource, /readCurrentRuntimeAsyncParamPayload/);
  assert.match(handlerSource, /readCurrentRuntimeSyncParamPayload/);
  assert.match(handlerAbiSource, /CURRENT_RUNTIME_ENDPOINT_HANDLER_DESCRIPTORS/);
  assert.match(handlerAbiSource, /CURRENT_RUNTIME_ENDPOINT_HANDLER_BY_KEY/);
  assert.match(handlerAbiSource, /validateAndFreezeCurrentRuntimeEndpointHandlerDescriptors/);
  assert.match(handlerAbiSource, /key: 'recipeItem'[\s\S]*read: 'recipeProducedBy'/);
  assert.match(handlerAbiSource, /key: 'runtimeDataMultiblockBlueprint'[\s\S]*read: 'multiblockBlueprint'/);
  assert.doesNotMatch(handlerSource, /current-runtime-recipe-api\.service/);
  assert.doesNotMatch(handlerSource, /current-runtime-special-data\.service/);
  assert.doesNotMatch(handlerSource, /current-runtime-settings\.service/);
  assert.doesNotMatch(handlerSource, /current-runtime-observability\.service/);
  assert.match(readServiceSource, /current-runtime-read-catalog/);
  assert.match(readCatalogSource, /getCurrentRecipeItemProducedBy/);
  assert.match(readCatalogSource, /getCurrentRuntimeMultiblockBlueprint/);
  assert.match(endpointRegistrySource, /CURRENT_RUNTIME_ENDPOINT_KEYS/);
  assert.match(endpointRegistrySource, /CURRENT_RUNTIME_ENDPOINT_METHODS/);
  assert.match(endpointRegistrySource, /CURRENT_RUNTIME_ENDPOINT_PLANES/);
  assert.match(endpointRegistrySource, /validateAndFreezeRouteDescriptors/);
  assert.match(endpointRegistrySource, /label: 'current runtime endpoint'/);
  assert.match(endpointRegistrySource, /allowedPlanes: CURRENT_RUNTIME_ENDPOINT_PLANES/);
  assert.match(routeDescriptorRegistrySource, /export function validateAndFreezeRouteHandlers/);
  assert.match(routeDescriptorRegistrySource, /Unknown \$\{options\.label\} route handler/);
  assert.match(routeDescriptorRegistrySource, /Missing \$\{options\.label\} route handler/);

  const endpointKeys = Array.from(endpointRegistrySource.matchAll(/key: '([^']+)'/g), (match) => match[1]);
  assert.ok(endpointKeys.length > 0, 'endpoint registry must expose endpoint keys');
  for (const key of endpointKeys) {
    assert.match(handlerAbiSource, new RegExp(`key: '${key}'`), `${key} must have a handler descriptor`);
  }
});
