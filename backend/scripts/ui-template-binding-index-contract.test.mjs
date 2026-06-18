import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const routeSource = fs.readFileSync('src/routes/render-contract.routes.ts', 'utf8');
const serviceSource = fs.readFileSync('src/services/render-contract.service.ts', 'utf8');
const bindingSource = fs.readFileSync('src/services/ui-template-binding-index.service.ts', 'utf8');

test('render contract exposes the UI template binding index contract surface', () => {
  assert.equal(routeSource.includes("'/ui-template-binding-index'"), true);
  assert.equal(routeSource.includes("'/ui-template-binding-index/:recipeId'"), true);
  assert.equal(serviceSource.includes('uiTemplateBindingIndex'), true);
  assert.equal(serviceSource.includes('NESQL_UI_PAYLOAD_INDEX_FILE'), true);
  assert.equal(serviceSource.includes('getUiTemplateBindingIndexService().getReportOrNull()'), true);
  assert.equal(bindingSource.includes('getBindingByRecipeId(recipeId: string)'), true);
  assert.equal(bindingSource.includes('getReportOrNull()'), true);
  assert.equal(bindingSource.includes('getBindings()'), true);
});
