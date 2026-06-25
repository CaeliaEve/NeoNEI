import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { UiFamilyCensusService } from '../src/services/ui-family-census.service';

test('ui family census service reads the exported census and resolves families', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neonei-ui-family-census-'));
  const censusFilePath = path.join(tempDir, 'dist-data', 'rust', 'ui-pack', 'ui_family_census.json');
  fs.mkdirSync(path.dirname(censusFilePath), { recursive: true });
  fs.writeFileSync(
    censusFilePath,
    JSON.stringify({
      schemaVersion: 'neonei/ui-family-census/current',
      generatedAt: '1710000000000',
      source: {
        kind: 'compiled-ui-template-catalog',
        resource: 'rust/ui-pack/ui_template_catalog.json',
        entryCount: 2,
        classifier: 'elysium-compiler',
      },
      summary: {
        handlerCount: 2,
        familyCount: 1,
        modCount: 1,
        layoutKindCount: 1,
        nativeFamilyCount: 0,
        craftingFamilyCount: 1,
        machineFamilyCount: 0,
      },
      families: [
        {
          familyKey: 'botania_terra_plate|crafting-grid|176x65@0#1|',
          canonicalMachineFamily: 'crafting-table',
          layoutKind: 'crafting-grid',
          width: 176,
          height: 65,
          yShift: 0,
          maxRecipesPerPage: 1,
          imageResource: '',
          members: [
            {
              handler: 'vazkii.botania.common.handler.ManaInfusionRecipeHandler',
              modId: 'Botania',
              modName: 'Botania',
              itemName: 'Botania:terraPlate:0',
              itemNotes: '',
              modRequired: true,
              excludedModId: '',
              imageResource: '',
              handlerWidth: 176,
              handlerHeight: 65,
              yShift: 0,
              maxRecipesPerPage: 1,
            },
          ],
        },
      ],
    }),
    'utf8',
  );

  const service = new UiFamilyCensusService({ censusFilePath });
  const report = service.getReport();
  assert.equal(report.summary.handlerCount, 2);
  assert.equal(report.summary.familyCount, 1);
  assert.equal(report.families.length, 1);
  assert.equal(service.getFamilyByKey('botania_terra_plate|crafting-grid|176x65@0#1|')?.members.length, 1);
  assert.equal(service.getReportOrNull() !== null, true);

  const missing = new UiFamilyCensusService({ censusFilePath: path.join(tempDir, 'missing.json') });
  assert.equal(missing.getReportOrNull(), null);
  assert.throws(() => missing.getReport(), /ui family census/i);

  fs.rmSync(tempDir, { recursive: true, force: true });
});
