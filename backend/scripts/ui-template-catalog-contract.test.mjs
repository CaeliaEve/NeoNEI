import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const endpointRegistrySource = fs.readFileSync('src/routes/render-contract-endpoint-registry.ts', 'utf8');
const serviceSource = fs.readFileSync('src/services/render-contract.service.ts', 'utf8');
const catalogSource = fs.readFileSync('src/services/ui-template-catalog.service.ts', 'utf8');

test('render contract exposes the UI template catalog contract surface', () => {
  assert.equal(endpointRegistrySource.includes("path: '/ui-template-catalog'"), true);
  assert.equal(endpointRegistrySource.includes("path: '/ui-template-catalog/:templateKey'"), true);
  assert.equal(serviceSource.includes('uiTemplateCatalog'), true);
  assert.equal(serviceSource.includes('CURRENT_RUNTIME_ARTIFACT_PATHS.uiTemplateCatalog'), true);
  assert.equal(serviceSource.includes('getUiTemplateCatalogService().getReportOrNull(uiTemplateCatalogFilePath)'), true);
  assert.equal(catalogSource.includes('getTemplateByKey(templateKey: string)'), true);
  assert.equal(catalogSource.includes('getTemplateByFamilyKey(familyKey: string)'), true);
  assert.equal(catalogSource.includes('resolveDistDataRuntimeFile(CURRENT_RUNTIME_ARTIFACT_PATHS.uiTemplateCatalog)'), true);
  assert.equal(catalogSource.includes('getReportOrNull(catalogFilePath = this.resolveCatalogFilePath())'), true);
});
