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
      machineType: 'Terra Plate',
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
    itemName: 'Terrasteel Ingot',
    counts: {
      producedBy: 1,
      usedIn: 1,
      machineGroups: 1,
    },
    machineGroups: [
      {
        machineType: 'Terra Plate',
        category: 'botania',
        voltageTier: null,
        voltage: null,
        recipeCount: 1,
      },
    ],
  };

  db.prepare(`
    INSERT INTO recipe_bootstrap (
      item_id, produced_by_ids, used_in_ids, produced_by_payload, used_in_payload, summary_payload, signature
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    'i~Botania~manaResource~4',
    JSON.stringify([recipe.id]),
    JSON.stringify([recipe.id]),
    JSON.stringify([recipe]),
    JSON.stringify([recipe]),
    JSON.stringify({
      item: {
        itemId: 'i~Botania~manaResource~4',
        localizedName: 'Terrasteel Ingot',
      },
      recipeIndex: {
        usedInRecipes: [recipe.id],
        producedByRecipes: [recipe.id],
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
  assert.ok(crafting.some((entry) => entry.id === recipe.id));

  const usage = await service.getUsageRecipesForItem('i~Botania~manaResource~4');
  assert.equal(usage.length, 1);
  assert.equal(usage[0]?.id, recipe.id);

  const itemSummary = await service.getItemRecipeSummary('i~Botania~manaResource~4');
  assert.equal(itemSummary.itemName, 'Terrasteel Ingot');
  assert.equal(itemSummary.counts.producedBy, 1);
  assert.equal(itemSummary.machineGroups[0]?.machineType, 'Terra Plate');

  manager.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('IndexedRecipesService reads produced-by machine-group packs from materialized recipe_machine_groups', async () => {
  const { manager, tempDir } = await createTempDatabase();
  const db = manager.getDatabase();

  const recipeA: IndexedRecipe = {
    id: 'r~gregtech~assembly-line~1',
    recipeType: 'assembly_line',
    outputs: [],
    inputs: [],
    fluidInputs: [],
    fluidOutputs: [],
    machineInfo: {
      machineId: 'm~gregtech~assembly_line',
      category: 'gregtech',
      machineType: 'Assembly Line',
      iconInfo: 'uv',
      shapeless: true,
      parsedVoltageTier: 'UV',
      parsedVoltage: 524288,
    },
    metadata: null,
    additionalData: null,
    recipeTypeData: undefined,
  };

  const recipeB: IndexedRecipe = {
    ...recipeA,
    id: 'r~gregtech~assembly-line~2',
  };

  for (const recipe of [recipeA, recipeB]) {
    db.prepare(`
      INSERT INTO recipes_core (
        recipe_id, recipe_type, family, machine_type, voltage_tier, source_mod,
        input_count, output_count, bootstrap_key, payload
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      recipe.id,
      recipe.recipeType,
      'gregtech',
      'Assembly Line',
      'UV',
      'gregtech',
      0,
      1,
      'i~gregtech~test~0',
      JSON.stringify(recipe),
    );
  }

  db.prepare(`
    INSERT INTO recipe_machine_groups (
      item_id, machine_key, family, voltage_tier, recipe_ids_blob, recipe_count
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    'i~gregtech~test~0',
    'Assembly Line::UV',
    'gregtech',
    'UV',
    JSON.stringify([recipeA.id, recipeB.id]),
    2,
  );

  const service = new IndexedRecipesService({
    databaseManager: manager,
    splitExportFallback: false,
  });

  const recipes = await service.getProducedByRecipesForMachineGroup('i~gregtech~test~0', 'Assembly Line', 'UV');
  assert.deepEqual(recipes.map((entry) => entry.id), [recipeA.id, recipeB.id]);

  manager.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('IndexedRecipesService reads used-in machine-group packs from materialized recipe_machine_groups', async () => {
  const { manager, tempDir } = await createTempDatabase();
  const db = manager.getDatabase();

  const recipeA: IndexedRecipe = {
    id: 'r~gregtech~research~1',
    recipeType: 'research_station',
    outputs: [],
    inputs: [],
    fluidInputs: [],
    fluidOutputs: [],
    machineInfo: {
      machineId: 'm~gregtech~research_station',
      category: 'gregtech',
      machineType: 'Research Station',
      iconInfo: 'zpm',
      shapeless: true,
      parsedVoltageTier: 'ZPM',
      parsedVoltage: 33554432,
    },
    metadata: null,
    additionalData: null,
    recipeTypeData: undefined,
  };

  const recipeB: IndexedRecipe = {
    ...recipeA,
    id: 'r~gregtech~research~2',
  };

  for (const recipe of [recipeA, recipeB]) {
    db.prepare(`
      INSERT INTO recipes_core (
        recipe_id, recipe_type, family, machine_type, voltage_tier, source_mod,
        input_count, output_count, bootstrap_key, payload
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      recipe.id,
      recipe.recipeType,
      'gregtech',
      'Research Station',
      'ZPM',
      'gregtech',
      1,
      0,
      'i~gregtech~research_item~0',
      JSON.stringify(recipe),
    );
  }

  db.prepare(`
    INSERT INTO recipe_machine_groups (
      item_id, relation_type, machine_key, family, voltage_tier, recipe_ids_blob, recipe_count
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    'i~gregtech~research_item~0',
    'used_in',
    'Research Station::ZPM',
    'gregtech',
    'ZPM',
    JSON.stringify([recipeA.id, recipeB.id]),
    2,
  );

  const service = new IndexedRecipesService({
    databaseManager: manager,
    splitExportFallback: false,
  });

  const recipes = await service.getUsedInRecipesForMachineGroup('i~gregtech~research_item~0', 'Research Station', 'ZPM');
  assert.deepEqual(recipes.map((entry) => entry.id), [recipeA.id, recipeB.id]);

  manager.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('IndexedRecipesService falls back to recipe_edges and recipes_core for non-hot items', async () => {
  const { manager, tempDir } = await createTempDatabase();
  const db = manager.getDatabase();

  const recipe: IndexedRecipe = {
    id: 'r~gregtech~wireless~1',
    recipeType: 'assembly_line',
    outputs: [],
    inputs: [],
    fluidInputs: [],
    fluidOutputs: [],
    machineInfo: {
      machineId: 'm~gregtech~assembly_line',
      category: 'gregtech',
      machineType: 'Assembly Line (UMV)',
      iconInfo: 'UMV',
      shapeless: true,
      parsedVoltageTier: null,
      parsedVoltage: null,
    },
    metadata: null,
    additionalData: null,
    recipeTypeData: undefined,
  };

  db.prepare(`
    INSERT INTO recipes_core (
      recipe_id, recipe_type, family, machine_type, voltage_tier, source_mod,
      input_count, output_count, bootstrap_key, payload
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    recipe.id,
    recipe.recipeType,
    'gregtech',
    'Assembly Line (UMV)',
    null,
    'gregtech',
    0,
    1,
    'i~gregtech~gt.blockmachines~16027',
    JSON.stringify(recipe),
  );

  db.prepare(`
    INSERT INTO recipe_edges (
      item_id, relation_type, recipe_id, slot_index, weight
    ) VALUES (?, ?, ?, ?, ?)
  `).run(
    'i~gregtech~gt.blockmachines~16027',
    'produced_by',
    recipe.id,
    0,
    0,
  );

  const service = new IndexedRecipesService({
    databaseManager: manager,
    splitExportFallback: false,
  });

  const crafting = await service.getCraftingRecipesForItem('i~gregtech~gt.blockmachines~16027');
  assert.equal(crafting.length, 1);
  assert.equal(crafting[0]?.id, recipe.id);

  manager.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('IndexedRecipesService filters category packs for non-machine crafting categories', async () => {
  const { manager, tempDir } = await createTempDatabase();
  const db = manager.getDatabase();

  const craftingRecipe: IndexedRecipe = {
    id: 'r~minecraft~crafting~1',
    recipeType: 'minecraft:crafting',
    outputs: [],
    inputs: [],
    fluidInputs: [],
    fluidOutputs: [],
    machineInfo: {
      machineId: 'm~minecraft~crafting',
      category: 'minecraft',
      machineType: 'Crafting (Shaped)',
      iconInfo: '',
      shapeless: false,
      parsedVoltageTier: null,
      parsedVoltage: null,
    },
    metadata: null,
    additionalData: null,
    recipeTypeData: undefined,
  };

  const machineRecipe: IndexedRecipe = {
    id: 'r~gregtech~assembler~1',
    recipeType: 'gregtech - assembler (lv)',
    outputs: [],
    inputs: [],
    fluidInputs: [],
    fluidOutputs: [],
    machineInfo: {
      machineId: 'm~gregtech~assembler',
      category: 'gregtech',
      machineType: '组装机',
      iconInfo: 'lv',
      shapeless: false,
      parsedVoltageTier: null,
      parsedVoltage: null,
    },
    metadata: null,
    additionalData: null,
    recipeTypeData: undefined,
  };

  for (const recipe of [craftingRecipe, machineRecipe]) {
    db.prepare(`
      INSERT INTO recipes_core (
        recipe_id, recipe_type, family, machine_type, voltage_tier, source_mod,
        input_count, output_count, bootstrap_key, payload
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      recipe.id,
      recipe.recipeType,
      'test',
      recipe.machineInfo?.machineType ?? null,
      null,
      'test',
      1,
      1,
      'i~test~target~0',
      JSON.stringify(recipe),
    );
    db.prepare(`
      INSERT INTO recipe_edges (
        item_id, relation_type, recipe_id, slot_index, weight
      ) VALUES (?, ?, ?, ?, ?)
    `).run(
      'i~test~target~0',
      'produced_by',
      recipe.id,
      0,
      0,
    );
  }

  const service = new IndexedRecipesService({
    databaseManager: manager,
    splitExportFallback: false,
  });

  const recipes = await service.getRecipesForCategoryGroup('i~test~target~0', 'produced_by', 'crafting:有序合成');
  assert.deepEqual(recipes.map((entry) => entry.id), [craftingRecipe.id]);

  manager.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('IndexedRecipesService searches recipe ids for a single item tab without hydrating the full shard', async () => {
  const { manager, tempDir } = await createTempDatabase();
  const db = manager.getDatabase();

  const recipeA: IndexedRecipe = {
    id: 'r~test~assembler~1',
    recipeType: 'gregtech - assembler (lv)',
    outputs: [],
    inputs: [],
    fluidInputs: [],
    fluidOutputs: [],
    machineInfo: {
      machineId: 'm~gregtech~assembler',
      category: 'gregtech',
      machineType: 'Assembler (LV)',
      iconInfo: 'lv',
      shapeless: false,
      parsedVoltageTier: 'LV',
      parsedVoltage: 32,
    },
    metadata: null,
    additionalData: null,
    recipeTypeData: undefined,
  };

  const recipeB: IndexedRecipe = {
    ...recipeA,
    id: 'r~test~compressor~1',
    recipeType: 'gregtech - compressor (lv)',
    machineInfo: {
      ...recipeA.machineInfo!,
      machineId: 'm~gregtech~compressor',
      machineType: 'Compressor (LV)',
    },
  };

  for (const recipe of [recipeA, recipeB]) {
    db.prepare(`
      INSERT INTO recipes_core (
        recipe_id, recipe_type, family, machine_type, voltage_tier, source_mod,
        input_count, output_count, bootstrap_key, payload
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      recipe.id,
      recipe.recipeType,
      'gregtech',
      recipe.machineInfo?.machineType ?? null,
      recipe.machineInfo?.parsedVoltageTier ?? null,
      'gregtech',
      1,
      1,
      'i~test~target~0',
      JSON.stringify(recipe),
    );
  }

  db.prepare(`
    INSERT INTO recipe_edges (
      item_id, relation_type, recipe_id, slot_index, weight
    ) VALUES (?, ?, ?, ?, ?)
  `).run('i~test~target~0', 'produced_by', recipeA.id, 0, 0);
  db.prepare(`
    INSERT INTO recipe_edges (
      item_id, relation_type, recipe_id, slot_index, weight
    ) VALUES (?, ?, ?, ?, ?)
  `).run('i~test~target~0', 'produced_by', recipeB.id, 1, 0);
  db.prepare(`
    INSERT INTO recipe_edges (
      item_id, relation_type, recipe_id, slot_index, weight
    ) VALUES (?, ?, ?, ?, ?)
  `).run('i~test~copperWire~0', 'used_in', recipeA.id, 0, 0);

  const service = new IndexedRecipesService({
    databaseManager: manager,
    splitExportFallback: false,
    itemsSearchService: {
      searchItems: async (keyword: string) => keyword === 'copper'
        ? [{ itemId: 'i~test~copperWire~0', localizedName: 'Copper Wire', modId: 'test' }]
        : [],
    },
  });

  const itemSearchResult = await service.searchRecipesForItem('i~test~target~0', 'produced_by', 'copper');
  assert.deepEqual(itemSearchResult.recipeIds, [recipeA.id]);
  assert.deepEqual(itemSearchResult.itemMatches.map((entry) => entry.itemId), ['i~test~copperWire~0']);

  const typeSearchResult = await service.searchRecipesForItem('i~test~target~0', 'produced_by', 'type:compressor');
  assert.deepEqual(typeSearchResult.recipeIds, [recipeB.id]);

  manager.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});
