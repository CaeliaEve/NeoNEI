import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import test from 'node:test';
import { DatabaseManager } from '../src/models/database';
import {
  IndexedRecipesService,
  type IndexedRecipe,
  type ItemRecipeSummaryResponse,
} from '../src/services/recipes-indexed.service';

async function createTempDatabase(): Promise<{ manager: DatabaseManager; tempDir: string }> {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neonei-indexed-recipes-'));
  const dbPath = path.join(tempDir, 'acceleration.db');
  const manager = new DatabaseManager(dbPath);
  await manager.init();
  return { manager, tempDir };
}

test('IndexedRecipesService reads materialized crafting, usage, and summary payloads from acceleration tables', async () => {
  const { manager, tempDir } = await createTempDatabase();
  const db = manager.getDatabase();

  const recipe: IndexedRecipe = {
    id: 'r~botania~terra~1',
    recipeType: 'terra_plate',
    outputs: [],
    inputs: [],
    fluidInputs: [],
    fluidOutputs: [],
    machineInfo: {
      machineId: 'm~Botania~terra_plate',
      category: 'botania',
      machineType: '泰拉凝聚板',
      iconInfo: 'botania',
      shapeless: true,
      parsedVoltageTier: null,
      parsedVoltage: null,
    },
    metadata: null,
    additionalData: null,
    recipeTypeData: undefined,
  };

  const summary: ItemRecipeSummaryResponse = {
    itemId: 'i~Botania~manaResource~4',
    itemName: '泰拉钢锭',
    counts: {
      producedBy: 1,
      usedIn: 1,
      machineGroups: 1,
    },
    machineGroups: [
      {
        machineType: '泰拉凝聚板',
        category: 'botania',
        voltageTier: null,
        voltage: null,
        recipeCount: 1,
      },
    ],
  };

  db.prepare(`
    INSERT INTO recipe_bootstrap (
      item_id, produced_by_payload, used_in_payload, summary_payload, signature
    ) VALUES (?, ?, ?, ?, ?)
  `).run(
    'i~Botania~manaResource~4',
    JSON.stringify([recipe]),
    JSON.stringify([recipe]),
    JSON.stringify({
      item: {
        itemId: 'i~Botania~manaResource~4',
        localizedName: '泰拉钢锭',
      },
      recipeIndex: {
        usedInRecipes: ['r~botania~terra~1'],
        producedByRecipes: ['r~botania~terra~1'],
      },
      indexedCrafting: [recipe],
      indexedUsage: [recipe],
      indexedSummary: summary,
    }),
    'sig~1',
  );

  const service = new IndexedRecipesService({
    databaseManager: manager,
    splitExportFallback: false,
  });

  const crafting = await service.getCraftingRecipesForItem('i~Botania~manaResource~4');
  assert.equal(crafting.length, 1);
  assert.equal(crafting[0]?.id, 'r~botania~terra~1');

  const usage = await service.getUsageRecipesForItem('i~Botania~manaResource~4');
  assert.equal(usage.length, 1);
  assert.equal(usage[0]?.id, 'r~botania~terra~1');

  const itemSummary = await service.getItemRecipeSummary('i~Botania~manaResource~4');
  assert.equal(itemSummary.itemName, '泰拉钢锭');
  assert.equal(itemSummary.counts.producedBy, 1);

  manager.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});
