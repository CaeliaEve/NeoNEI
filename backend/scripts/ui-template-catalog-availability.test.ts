import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { UiTemplateCatalogService } from '../src/services/ui-template-catalog.service';

test('ui template catalog service reads the exported catalog and resolves templates', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neonei-ui-template-catalog-'));
  const catalogFilePath = path.join(tempDir, 'raw-export', 'validation', 'ui-template-catalog.json');
  fs.mkdirSync(path.dirname(catalogFilePath), { recursive: true });
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
        overlayCount: 1,
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
          handlerIds: ['handler.alpha', 'handler.beta'],
          handlerClasses: ['handler.alpha', 'handler.beta'],
          modIds: ['Botania'],
          slots: [
            { role: 'item-input', startIndex: 0, columns: 3, rows: 3, x: 30, y: 12 },
            { role: 'item-output', startIndex: 9, columns: 1, rows: 1, x: 124, y: 30 },
          ],
          textOverlays: [
            { text: 'x', x: 10, y: 10, width: 8, height: 8 },
          ],
        },
      ],
    }),
    'utf8',
  );

  const service = new UiTemplateCatalogService({ catalogFilePath });
  const report = service.getReport();
  assert.equal(report.summary.handlerCount, 2);
  assert.equal(report.summary.templateCount, 1);
  assert.equal(report.templates.length, 1);
  assert.equal(service.getTemplateByKey('ui-template/1234567890abcdef')?.slotCount, 2);
  assert.equal(
    service.getTemplateByFamilyKey('botania_terra_plate|crafting-grid|176x65@0#1|')?.templateKey,
    'ui-template/1234567890abcdef',
  );
  assert.equal(service.getReportOrNull() !== null, true);

  const missing = new UiTemplateCatalogService({ catalogFilePath: path.join(tempDir, 'missing.json') });
  assert.equal(missing.getReportOrNull(), null);
  assert.throws(() => missing.getReport(), /ui template catalog/i);

  fs.rmSync(tempDir, { recursive: true, force: true });
});
