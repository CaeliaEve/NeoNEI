import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const routeSource = readFileSync(resolve(root, 'src/routes/publish-admin.routes.ts'), 'utf8');
const registrySource = readFileSync(resolve(root, 'src/routes/publish-admin-endpoint-registry.ts'), 'utf8');
const handlersSource = readFileSync(resolve(root, 'src/routes/publish-admin-endpoint-handlers.ts'), 'utf8');
const serviceSource = readFileSync(resolve(root, 'src/services/publish-admin-control.service.ts'), 'utf8');

test('publish admin routes are mounted from an explicit endpoint registry', () => {
  assert.match(registrySource, /export const PUBLISH_ADMIN_ENDPOINTS/);
  assert.match(registrySource, /PUBLISH_ADMIN_ENDPOINT_KEYS/);
  assert.match(registrySource, /PUBLISH_ADMIN_METHODS/);
  assert.match(registrySource, /validateAndFreezeRouteDescriptors/);
  assert.match(registrySource, /label: 'publish admin endpoint'/);
  assert.match(registrySource, /key: 'list-releases'/);
  assert.match(registrySource, /path: '\/releases'/);
  assert.match(registrySource, /key: 'activate-release'/);
  assert.match(registrySource, /path: '\/releases\/:sourceSignature\/activate'/);
  assert.match(routeSource, /for \(const endpoint of PUBLISH_ADMIN_ENDPOINTS\)/);
  assert.match(routeSource, /registerPublishAdminEndpoint\(router, endpoint\)/);
  assert.doesNotMatch(routeSource, /getPublishReleaseService/);
  assert.doesNotMatch(routeSource, /getPublishManifestService/);
  assert.doesNotMatch(routeSource, /setNoStoreHeaders/);
  assert.doesNotMatch(routeSource, /req\.params/);
});

test('publish admin control service owns release action policy', () => {
  assert.match(serviceSource, /class PublishAdminControlService/);
  assert.match(serviceSource, /getPublishReleaseService\(\)\.listReleases\(\)/);
  assert.match(serviceSource, /getPublishReleaseService\(\)\.activateRelease\(normalized\)/);
  assert.match(serviceSource, /getPublishManifestService\(\)\.invalidate\(\)/);
  assert.match(handlersSource, /setNoStoreHeaders\(res\)/);
  assert.match(handlersSource, /createPublishAdminControlService\(\)\.activateRelease\(req\.params\.sourceSignature\)/s);
});
