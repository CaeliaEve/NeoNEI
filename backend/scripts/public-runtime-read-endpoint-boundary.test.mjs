import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const runtimeRouteSource = readFileSync(resolve(root, 'src/routes/runtime.routes.ts'), 'utf8');
const runtimeRegistrySource = readFileSync(resolve(root, 'src/routes/runtime-public-endpoint-registry.ts'), 'utf8');
const runtimeHandlersSource = readFileSync(resolve(root, 'src/routes/runtime-public-endpoint-handlers.ts'), 'utf8');
const v1RouteSource = readFileSync(resolve(root, 'src/routes/v1.routes.ts'), 'utf8');
const v1RegistrySource = readFileSync(resolve(root, 'src/routes/v1-endpoint-registry.ts'), 'utf8');
const v1HandlersSource = readFileSync(resolve(root, 'src/routes/v1-endpoint-handlers.ts'), 'utf8');
const publishRouteSource = readFileSync(resolve(root, 'src/routes/publish.routes.ts'), 'utf8');
const publishRegistrySource = readFileSync(resolve(root, 'src/routes/publish-public-endpoint-registry.ts'), 'utf8');
const publishHandlersSource = readFileSync(resolve(root, 'src/routes/publish-public-endpoint-handlers.ts'), 'utf8');

test('public runtime read routes are table-driven and route files are mount-only', () => {
  assert.match(runtimeRegistrySource, /export const RUNTIME_PUBLIC_ENDPOINTS/);
  assert.match(runtimeRegistrySource, /RUNTIME_PUBLIC_ENDPOINT_KEYS/);
  assert.match(runtimeRegistrySource, /RUNTIME_PUBLIC_ENDPOINT_METHODS/);
  assert.match(runtimeRegistrySource, /validateAndFreezeRouteDescriptors/);
  assert.match(runtimeRegistrySource, /label: 'runtime public endpoint'/);
  assert.match(runtimeRegistrySource, /path: '\/health'/);
  assert.match(runtimeRegistrySource, /path: '\/manifest'/);
  assert.match(runtimeRegistrySource, /path: '\/contracts'/);
  assert.match(runtimeRegistrySource, /path: '\/diagnostics'/);
  assert.match(runtimeRouteSource, /for \(const endpoint of RUNTIME_PUBLIC_ENDPOINTS\)/);
  assert.match(runtimeHandlersSource, /getCurrentRuntimeManifestDelivery\(\)/);

  assert.match(v1RegistrySource, /export const API_V1_ENDPOINTS/);
  assert.match(v1RegistrySource, /API_V1_ENDPOINT_KEYS/);
  assert.match(v1RegistrySource, /API_V1_ENDPOINT_METHODS/);
  assert.match(v1RegistrySource, /validateAndFreezeRouteDescriptors/);
  assert.match(v1RegistrySource, /label: 'api v1 endpoint'/);
  assert.match(v1RegistrySource, /path: '\/health'/);
  assert.match(v1RegistrySource, /path: '\/runtime\/manifest'/);
  assert.match(v1RegistrySource, /path: '\/runtime\/contracts'/);
  assert.match(v1RouteSource, /for \(const endpoint of API_V1_ENDPOINTS\)/);
  assert.match(v1HandlersSource, /getApiV1RuntimeManifestDelivery\(\)/);

  assert.match(publishRegistrySource, /export const PUBLISH_PUBLIC_ENDPOINTS/);
  assert.match(publishRegistrySource, /PUBLISH_PUBLIC_ENDPOINT_KEYS/);
  assert.match(publishRegistrySource, /PUBLISH_PUBLIC_ENDPOINT_METHODS/);
  assert.match(publishRegistrySource, /validateAndFreezeRouteDescriptors/);
  assert.match(publishRegistrySource, /label: 'publish public endpoint'/);
  assert.match(publishRegistrySource, /path: '\/manifest'/);
  assert.match(publishRegistrySource, /path: '\/home-bootstrap'/);
  assert.match(publishRouteSource, /for \(const endpoint of PUBLISH_PUBLIC_ENDPOINTS\)/);
  assert.match(publishHandlersSource, /createPublishHomeBootstrapDelivery\(req\.query\)/);

  for (const routeSource of [runtimeRouteSource, v1RouteSource, publishRouteSource]) {
    for (const routeLocalPolicy of [
      /getCurrentRuntime/,
      /getApiV1Runtime/,
      /getPublishManifestDelivery/,
      /createPublishHomeBootstrapDelivery/,
      /sendNotModifiedIfEtagMatches/,
      /setNoStoreHeaders/,
      /setPublicCacheHeaders/,
      /res\.json/,
      /req\.query/,
    ]) {
      assert.doesNotMatch(routeSource, routeLocalPolicy);
    }
  }
});
