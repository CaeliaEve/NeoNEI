import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const endpointRegistrySource = fs.readFileSync('src/routes/render-contract-endpoint-registry.ts', 'utf8');
const serviceSource = fs.readFileSync('src/services/render-contract.service.ts', 'utf8');
const bindingSource = fs.readFileSync('src/services/ui-template-binding-index.service.ts', 'utf8');

test('render contract exposes the UI template binding index contract surface', () => {
  assert.equal(endpointRegistrySource.includes("path: '/ui-template-binding-index'"), true);
  assert.equal(endpointRegistrySource.includes("path: '/ui-template-binding-index/:recipeId'"), true);
  assert.equal(serviceSource.includes('uiTemplateBindingIndex'), true);
  assert.equal(serviceSource.includes('CURRENT_RUNTIME_ARTIFACT_PATHS.uiTemplateBindingIndex'), true);
  assert.equal(serviceSource.includes('recipeUiPayloadIndexFilePath: uiPayloadIndexFilePath'), true);
  assert.equal(serviceSource.includes('getUiTemplateBindingIndexService().getReportOrNull({'), true);
  assert.equal(bindingSource.includes('getBindingByRecipeId(recipeId: string)'), true);
  assert.equal(bindingSource.includes('resolveCurrentRuntimeDistDataDir()'), true);
  assert.equal(bindingSource.includes('CURRENT_RUNTIME_ARTIFACT_PATHS.uiTemplateBindingIndex'), true);
  assert.equal(bindingSource.includes('getReportOrNull(paths = this.resolvePaths())'), true);
  assert.equal(bindingSource.includes('getBindings()'), true);
});
