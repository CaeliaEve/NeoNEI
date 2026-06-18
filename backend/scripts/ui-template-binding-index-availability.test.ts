import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { UiTemplateBindingIndexService } from '../src/services/ui-template-binding-index.service';

test('ui template binding index service joins payload indices with the template catalog', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neonei-ui-template-binding-index-'));
  const recipeIndexFilePath = path.join(tempDir, 'dist-data', 'recipes', 'ui-payload-index.json');
  const catalogFilePath = path.join(tempDir, 'raw-export', 'validation', 'ui-template-catalog.json');
  fs.mkdirSync(path.dirname(recipeIndexFilePath), { recursive: true });
  fs.mkdirSync(path.dirname(catalogFilePath), { recursive: true });

  fs.writeFileSync(
    recipeIndexFilePath,
    JSON.stringify({
      schemaVersion: 'neonei/recipe-ui-payload-index/v1',
      recipes: [
        {
          recipeId: 'recipe.alpha',
          path: 'recipes/ui-payload-shards/alpha.json',
          payloadKey: 'recipe.alpha',
          familyKey: 'botania_terra_plate|crafting-grid|176x65@0#1|',
          recipeType: 'botania.mana_infusion',
          machineType: 'crafting-table',
        },
        {
          recipeId: 'recipe.beta',
          path: 'recipes/ui-payload-shards/beta.json',
          payloadKey: 'recipe.beta',
          familyKey: 'missing-family',
          recipeType: 'gt5u.machine',
          machineType: 'assembler',
        },
      ],
    }),
    'utf8',
  );

  fs.writeFileSync(
    catalogFilePath,
    JSON.stringify({
      schemaVersion: 'nesqlpp/raw-export/alpha1/ui-template-catalog',
      generatedAt: '1710000000000',
      source: {
        kind: 'ui-family-census',
        resource: 'raw-export/validation/ui-family-census.json',
        censusSchemaVersion: 'nesqlpp/raw-export/alpha1/ui-family-census',
        censusFamilyCount: 1,
        censusHandlerCount: 2,
        layoutSpecProvider: 'NeiUiTemplateLayoutSpecs',
      },
      summary: {
        handlerCount: 2,
        templateCount: 1,
        familyCount: 1,
        layoutKindCount: 1,
        slotCount: 2,
        overlayCount: 0,
      },
      templates: [
        {
          templateKey: 'ui-template/1234567890abcdef',
          templateSignature: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
          familyKey: 'botania_terra_plate|crafting-grid|176x65@0#1|',
          canonicalMachineFamily: 'crafting-table',
          layoutKind: 'crafting-grid',
          width: 176,
          height: 65,
          yShift: 0,
          maxRecipesPerPage: 1,
          imageResource: '',
          handlerCount: 2,
          slotCount: 2,
          handlerIds: ['handler.alpha'],
          handlerClasses: ['handler.alpha'],
          modIds: ['Botania'],
          slots: [
            { role: 'item-input', startIndex: 0, columns: 3, rows: 3, x: 30, y: 12 },
            { role: 'item-output', startIndex: 9, columns: 1, rows: 1, x: 124, y: 30 },
          ],
          textOverlays: [],
        },
      ],
    }),
    'utf8',
  );

  const service = new UiTemplateBindingIndexService({
    recipeUiPayloadIndexFilePath: recipeIndexFilePath,
    templateCatalogFilePath: catalogFilePath,
  });
  const report = service.getReport();
  assert.equal(report.summary.recipeCount, 2);
  assert.equal(report.summary.boundRecipeCount, 1);
  assert.equal(report.summary.unboundRecipeCount, 1);
  assert.equal(report.bindings.length, 2);
  assert.equal(service.getBindingByRecipeId('recipe.alpha')?.templateKey, 'ui-template/1234567890abcdef');
  assert.equal(service.getBindingByRecipeId('recipe.beta')?.templateKey, null);
  assert.equal(service.getReportOrNull() !== null, true);

  const missing = new UiTemplateBindingIndexService({
    recipeUiPayloadIndexFilePath: path.join(tempDir, 'missing.json'),
    templateCatalogFilePath: catalogFilePath,
  });
  assert.equal(missing.getReportOrNull(), null);
  assert.throws(() => missing.getReport(), /ui template binding index/i);

  fs.rmSync(tempDir, { recursive: true, force: true });
});
