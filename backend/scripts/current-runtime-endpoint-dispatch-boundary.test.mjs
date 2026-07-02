import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const routeSource = readFileSync(resolve(root, 'src/routes/current-api.routes.ts'), 'utf8');
const handlerSource = readFileSync(resolve(root, 'src/routes/current-runtime-endpoint-handlers.ts'), 'utf8');
const endpointRegistrySource = readFileSync(resolve(root, 'src/routes/current-runtime-endpoint-registry.ts'), 'utf8');
const readServiceSource = readFileSync(resolve(root, 'src/services/current-runtime-read.service.ts'), 'utf8');

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
  assert.match(handlerSource, /export function getCurrentRuntimeEndpointHandler/);
  assert.match(handlerSource, /withCurrentRuntimeApiContext/);
  assert.match(handlerSource, /withCurrentRuntimeApiContextAsync/);
  assert.match(handlerSource, /assertCurrentRuntimeId/);
  assert.match(handlerSource, /sendCurrentRuntimeManifest/);
  assert.match(handlerSource, /sendCurrentRuntimeAsset/);
  assert.match(handlerSource, /sendCurrentRuntimeReport/);
  assert.match(handlerSource, /current-runtime-read\.service/);
  assert.match(handlerSource, /getCurrentRuntimeRecipeProducedByPayload/);
  assert.match(handlerSource, /getCurrentRuntimeMultiblockBlueprintPayload/);
  assert.doesNotMatch(handlerSource, /current-runtime-recipe-api\.service/);
  assert.doesNotMatch(handlerSource, /current-runtime-special-data\.service/);
  assert.doesNotMatch(handlerSource, /current-runtime-settings\.service/);
  assert.doesNotMatch(handlerSource, /current-runtime-observability\.service/);
  assert.match(readServiceSource, /getCurrentRecipeItemProducedBy/);
  assert.match(readServiceSource, /getCurrentRuntimeMultiblockBlueprint/);
  assert.match(endpointRegistrySource, /CURRENT_RUNTIME_ENDPOINT_KEYS/);
  assert.match(endpointRegistrySource, /CURRENT_RUNTIME_ENDPOINT_METHODS/);
  assert.match(endpointRegistrySource, /CURRENT_RUNTIME_ENDPOINT_PLANES/);
  assert.match(endpointRegistrySource, /validateAndFreezeCurrentRuntimeEndpoints/);
  assert.match(endpointRegistrySource, /Duplicate current runtime endpoint descriptor/);
  assert.match(endpointRegistrySource, /Missing current runtime endpoint descriptor/);
  assert.match(endpointRegistrySource, /Invalid current runtime endpoint plane/);
  assert.match(endpointRegistrySource, /Current runtime endpoint path must be absolute/);

  const endpointKeys = Array.from(endpointRegistrySource.matchAll(/key: '([^']+)'/g), (match) => match[1]);
  assert.ok(endpointKeys.length > 0, 'endpoint registry must expose endpoint keys');
  for (const key of endpointKeys) {
    assert.match(handlerSource, new RegExp(`\\b${key}:`), `${key} must have a handler`);
  }
});
