import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import test from 'node:test';
import { DatabaseManager } from '../src/models/database';
import {
  IndexedRecipesService,
  type ItemRecipeSummaryResponse,
} from '../src/services/recipes-indexed.service';

async function createTempDatabase(): Promise<{ manager: DatabaseManager; tempDir: string }> {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neonei-summary-fastpath-'));
  const dbPath = path.join(tempDir, 'acceleration.db');
  const manager = new DatabaseManager(dbPath);
  await manager.init();
  return { manager, tempDir };
}

test('IndexedRecipesService hydrates missing summary groups from materialized recipe ids + recipes_core without full recipe expansion', async () => {
  const { manager, tempDir } = await createTempDatabase();
  const db = manager.getDatabase();
  const itemId = 'i~minecraft~stick~0';

  const seedSummary: ItemRecipeSummaryResponse = {
    itemId,
    itemName: 'Stick',
    counts: {
      producedBy: 1,
      usedIn: 3,
      machineGroups: 1,
    },
    machineGroups: [
      {
        machineType: 'Crafting (Shaped)',
        category: 'crafting',
        voltageTier: null,
        voltage: null,
        recipeCount: 1,
      },
    ],
  };

  db.prepare(`
    INSERT INTO recipe_summary_compact (item_id, summary_payload, signature)
    VALUES (?, ?, ?)
  `).run(itemId, JSON.stringify(seedSummary), 'sig~summary');

  db.prepare(`
    INSERT INTO recipe_bootstrap (
      item_id, produced_by_ids, used_in_ids, produced_by_payload, used_in_payload, summary_payload, signature
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    itemId,
    JSON.stringify(['r~craft-stick']),
    JSON.stringify(['r~arcane-wand', 'r~furnace-fuel', 'r~furnace-fuel']),
    null,
    null,
    JSON.stringify({ indexedSummary: seedSummary }),
    'sig~bootstrap',
  );

  const insertCore = db.prepare(`
    INSERT INTO recipes_core (
      recipe_id, recipe_type, family, machine_type, voltage_tier, source_mod,
      input_count, output_count, bootstrap_key, payload
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertCore.run('r~craft-stick', 'crafting', 'crafting', 'Crafting (Shaped)', null, 'minecraft', 2, 1, itemId, '{}');
  insertCore.run('r~arcane-wand', 'thaumcraft', 'thaumcraft', 'Arcane Worktable', null, 'Thaumcraft', 1, 1, itemId, '{}');
  insertCore.run('r~furnace-fuel', 'minecraft:smelting', 'minecraft', 'Furnace', null, 'minecraft', 1, 1, itemId, '{}');

  const service = new IndexedRecipesService({
    databaseManager: manager,
    splitExportFallback: false,
  });

  const hydrated = await service.getItemRecipeSummary(itemId);

  assert.equal(hydrated.itemId, itemId);
  assert.equal(hydrated.producedByMachineGroups?.length, 1);
  assert.ok((hydrated.producedByCategoryGroups?.length ?? 0) > 0);
  assert.ok((hydrated.usedInMachineGroups?.length ?? 0) >= 2);
  assert.ok((hydrated.usedInCategoryGroups?.length ?? 0) >= 2);

  const furnaceMachineGroup = hydrated.usedInMachineGroups?.find((group) => group.machineType === 'Furnace');
  assert.equal(furnaceMachineGroup?.recipeCount, 2);

  const furnaceCategoryGroup = hydrated.usedInCategoryGroups?.find((group) => group.name === 'Furnace');
  assert.equal(furnaceCategoryGroup?.recipeCount, 2);

  manager.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('IndexedRecipesService returns paged machine/category packs with ordered recipe ids', async () => {
  const { manager, tempDir } = await createTempDatabase();
  const db = manager.getDatabase();
  const itemId = 'i~minecraft~stick~0';

  const recipes = ['r~1', 'r~2', 'r~3', 'r~4'].map((recipeId, index) => ({
    id: recipeId,
    recipeType: index % 2 === 0 ? 'crafting' : 'minecraft:smelting',
    outputs: [],
    inputs: [],
    fluidInputs: [],
    fluidOutputs: [],
    machineInfo: {
      machineId: `m~${recipeId}`,
      category: 'crafting',
      machineType: index % 2 === 0 ? 'Crafting (Shaped)' : 'Furnace',
      iconInfo: 'test',
      shapeless: false,
      parsedVoltageTier: null,
      parsedVoltage: null,
    },
    metadata: null,
    additionalData: null,
    recipeTypeData: undefined,
  }));

  const insertCore = db.prepare(`
    INSERT INTO recipes_core (
      recipe_id, recipe_type, family, machine_type, voltage_tier, source_mod,
      input_count, output_count, bootstrap_key, payload
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const recipe of recipes) {
    insertCore.run(
      recipe.id,
      recipe.recipeType,
      'crafting',
      recipe.machineInfo.machineType,
      null,
      'minecraft',
      1,
      1,
      itemId,
      JSON.stringify(recipe),
    );
  }

  db.prepare(`
    INSERT INTO recipe_machine_groups (
      item_id, relation_type, machine_key, family, voltage_tier, recipe_ids_blob, recipe_count
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    itemId,
    'used_in',
    'Crafting (Shaped)::',
    'crafting',
    null,
    JSON.stringify(['r~1', 'r~2', 'r~3', 'r~4']),
    4,
  );

  const service = new IndexedRecipesService({
    databaseManager: manager,
    splitExportFallback: false,
  });

  const pack = await service.getUsedInRecipePackForMachineGroup(itemId, 'Crafting (Shaped)', null, {
    offset: 1,
    limit: 2,
    includeRecipeIds: true,
  });

  assert.equal(pack.recipeCount, 4);
  assert.deepEqual(pack.recipeIds, ['r~1', 'r~2', 'r~3', 'r~4']);
  assert.deepEqual(pack.recipes.map((recipe) => recipe.id), ['r~2', 'r~3']);
  assert.equal(pack.offset, 1);
  assert.equal(pack.limit, 2);
  assert.equal(pack.hasMore, true);

  const idsOnlyPack = await service.getUsedInRecipePackForMachineGroup(itemId, 'Crafting (Shaped)', null, {
    offset: 0,
    limit: 0,
    includeRecipeIds: true,
  });
  assert.equal(idsOnlyPack.recipeCount, 4);
  assert.deepEqual(idsOnlyPack.recipeIds, ['r~1', 'r~2', 'r~3', 'r~4']);
  assert.deepEqual(idsOnlyPack.recipes, []);
  assert.equal(idsOnlyPack.hasMore, true);

  manager.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});
