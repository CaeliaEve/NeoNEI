import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const routeSource = fs.readFileSync('src/routes/render-contract.routes.ts', 'utf8');
const serviceSource = fs.readFileSync('src/services/render-contract.service.ts', 'utf8');
const catalogSource = fs.readFileSync('src/services/ui-template-catalog.service.ts', 'utf8');

test('render contract exposes the UI template catalog contract surface', () => {
  assert.equal(routeSource.includes("'/ui-template-catalog'"), true);
  assert.equal(routeSource.includes("'/ui-template-catalog/:templateKey'"), true);
  assert.equal(serviceSource.includes('uiTemplateCatalog'), true);
  assert.equal(serviceSource.includes('NESQL_UI_TEMPLATE_CATALOG_FILE'), true);
  assert.equal(serviceSource.includes('getUiTemplateCatalogService().getReportOrNull()'), true);
  assert.equal(catalogSource.includes('getTemplateByKey(templateKey: string)'), true);
  assert.equal(catalogSource.includes('getTemplateByFamilyKey(familyKey: string)'), true);
  assert.equal(catalogSource.includes('getReportOrNull()'), true);
});
