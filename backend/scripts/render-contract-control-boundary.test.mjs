import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const routeSource = readFileSync(resolve(root, 'src/routes/render-contract.routes.ts'), 'utf8');
const registrySource = readFileSync(resolve(root, 'src/routes/render-contract-endpoint-registry.ts'), 'utf8');
const handlersSource = readFileSync(resolve(root, 'src/routes/render-contract-endpoint-handlers.ts'), 'utf8');
const serviceSource = readFileSync(resolve(root, 'src/services/render-contract-control.service.ts'), 'utf8');

test('render contract routes are mounted from an explicit endpoint registry', () => {
  assert.match(registrySource, /export const RENDER_CONTRACT_ENDPOINTS/);
  assert.match(registrySource, /RENDER_CONTRACT_ENDPOINT_KEYS/);
  assert.match(registrySource, /RENDER_CONTRACT_METHODS/);
  assert.match(registrySource, /validateAndFreezeRouteDescriptors/);
  assert.match(registrySource, /label: 'render contract endpoint'/);
  for (const endpointKey of [
    'overview',
    'browser-atlas-index',
    'browser-atlas-entries',
    'browser-layout-index',
    'ui-family-census',
    'ui-family-census-entry',
    'ui-template-catalog',
    'ui-template-catalog-entry',
    'ui-template-binding-index',
    'ui-template-binding-entry',
    'animated-atlas',
    'asset',
    'ui-payload',
  ]) {
    assert.match(registrySource, new RegExp(`key: '${endpointKey}'`));
    assert.match(handlersSource, new RegExp(`'${endpointKey}'|${endpointKey}: async`));
  }

  assert.match(routeSource, /for \(const endpoint of RENDER_CONTRACT_ENDPOINTS\)/);
  assert.match(routeSource, /registerRenderContractEndpoint\(router, endpoint\)/);
  for (const routeLocalPolicy of [
    /getRenderContractService/,
    /getUiPayloadsService/,
    /getBrowserAtlasIndexService/,
    /getBrowserLayoutIndexService/,
    /getUiFamilyCensusService/,
    /getUiTemplateCatalogService/,
    /getUiTemplateBindingIndexService/,
    /notFound/,
    /req\.query/,
    /req\.body/,
    /req\.params/,
  ]) {
    assert.doesNotMatch(routeSource, routeLocalPolicy);
  }
});

test('render contract control service owns diagnostics query policy', () => {
  assert.match(serviceSource, /class RenderContractControlService/);
  assert.match(serviceSource, /getBrowserAtlasEntries\(body: unknown\)/);
  assert.match(serviceSource, /getUiFamily\(familyKey: unknown\)/);
  assert.match(serviceSource, /getUiTemplate\(templateKey: unknown\)/);
  assert.match(serviceSource, /getUiTemplateBinding\(recipeId: unknown\)/);
  assert.match(serviceSource, /getUiPayload\(recipeId: unknown\)/);
  assert.match(serviceSource, /throw notFound/);
  assert.match(handlersSource, /createRenderContractControlService\(\)\.getUiPayload\(req\.query\.recipeId\)/);
});
