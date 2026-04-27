import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import test from 'node:test';
import { DatabaseManager } from '../src/models/database';
import { RecipeBootstrapService, type RecipeBootstrapPayload } from '../src/services/recipe-bootstrap.service';

async function createTempDatabase(): Promise<{ manager: DatabaseManager; tempDir: string }> {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neonei-bootstrap-'));
  const dbPath = path.join(tempDir, 'acceleration.db');
  const manager = new DatabaseManager(dbPath);
  await manager.init();
  return { manager, tempDir };
}

test('RecipeBootstrapService returns materialized bootstrap payload from acceleration table when present', async () => {
  const { manager, tempDir } = await createTempDatabase();
  const db = manager.getDatabase();

  db.prepare(`
    INSERT INTO items_core (
      item_id, mod_id, internal_name, localized_name, unlocalized_name, damage,
      image_file_name, render_asset_ref, preferred_image_url, tooltip, search_terms
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'i~Botania~manaResource~4',
    'Botania',
    'manaResource',
    '泰拉钢锭',
    'item.botania.manaResource',
    0,
    'Botania/manaResource~4.png',
    null,
    '/images/item/Botania/manaResource~4.png',
    null,
    'botania terrasteel',
  );

  const payload: RecipeBootstrapPayload = {
    item: {
      itemId: 'i~Botania~manaResource~4',
      modId: 'Botania',
      internalName: 'manaResource',
      localizedName: '泰拉钢锭',
      renderAssetRef: null,
      preferredImageUrl: '/images/item/Botania/manaResource~4.png',
      unlocalizedName: 'item.botania.manaResource',
      damage: 0,
      maxStackSize: 64,
      maxDamage: 0,
      imageFileName: 'Botania/manaResource~4.png',
      tooltip: null,
      searchTerms: 'botania terrasteel',
      toolClasses: null,
    },
    recipeIndex: {
      usedInRecipes: ['used~1'],
      producedByRecipes: ['prod~1'],
    },
    indexedCrafting: [],
    indexedUsage: [],
    indexedSummary: {
      itemId: 'i~Botania~manaResource~4',
      itemName: '泰拉钢锭',
      counts: {
        producedBy: 1,
        usedIn: 1,
        machineGroups: 0,
      },
      machineGroups: [],
    },
  };

  db.prepare(`
    INSERT INTO recipe_bootstrap (
      item_id, produced_by_payload, used_in_payload, summary_payload, signature
    ) VALUES (?, ?, ?, ?, ?)
  `).run(
    'i~Botania~manaResource~4',
    JSON.stringify(payload.indexedCrafting),
    JSON.stringify(payload.indexedUsage),
    JSON.stringify(payload),
    'sig~1',
  );

  const service = new RecipeBootstrapService({
    databaseManager: manager,
    splitExportFallback: false,
  });

  const result = await service.getBootstrap('i~Botania~manaResource~4');
  assert.equal(result?.item.localizedName, '泰拉钢锭');
  assert.deepEqual(result?.recipeIndex, payload.recipeIndex);
  assert.equal(result?.indexedSummary?.itemName, '泰拉钢锭');

  manager.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('RecipeBootstrapService builds bootstrap from indexed services when materialized bootstrap is missing', async () => {
  const { manager, tempDir } = await createTempDatabase();
  const requestedRecipeIds: string[][] = [];

  const service = new RecipeBootstrapService({
    databaseManager: manager,
    splitExportFallback: false,
    itemsService: {
      getItemById: async (itemId: string) => ({
        itemId,
        modId: 'gregtech',
        internalName: 'gt.blockmachines',
        localizedName: '??????',
        renderAssetRef: null,
        preferredImageUrl: '/images/item/gregtech/test.png',
        unlocalizedName: 'gregtech.test',
        damage: 0,
        maxStackSize: 64,
        maxDamage: 0,
        imageFileName: 'gregtech/test.png',
        tooltip: null,
        searchTerms: null,
        toolClasses: null,
      }),
    } as never,
    indexedRecipesService: {
      getCraftingRecipeIdsForItem: async () => ['r~test~crafting'],
      getUsageRecipeIdsForItem: async () => ['r~test~usage'],
      getRecipesByIds: async (recipeIds: string[]) => {
        requestedRecipeIds.push([...recipeIds]);
        return recipeIds.map((recipeId) => ({
          id: recipeId,
          recipeType: 'crafting',
          outputs: [],
          inputs: [],
          fluidInputs: [],
          fluidOutputs: [],
          machineInfo: null,
          metadata: null,
        }));
      },
      getItemRecipeSummary: async (itemId: string) => ({
        itemId,
        itemName: '??????',
        counts: {
          producedBy: 1,
          usedIn: 1,
          machineGroups: 0,
        },
        machineGroups: [],
      }),
    } as never,
  });

  const result = await service.getBootstrap('i~gregtech~gt.blockmachines~16027');
  assert.equal(result?.item.localizedName, '??????');
  assert.deepEqual(result?.recipeIndex.producedByRecipes, ['r~test~crafting']);
  assert.deepEqual(result?.recipeIndex.usedInRecipes, ['r~test~usage']);
  assert.deepEqual(requestedRecipeIds, [['r~test~crafting', 'r~test~usage']]);
  assert.deepEqual(result?.indexedCrafting.map((recipe) => recipe.id), ['r~test~crafting']);
  assert.deepEqual(result?.indexedUsage.map((recipe) => recipe.id), ['r~test~usage']);

  manager.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('RecipeBootstrapService tops up materialized bootstrap with eager missing recipes in bootstrap order', async () => {
  const { manager, tempDir } = await createTempDatabase();
  const db = manager.getDatabase();

  const itemId = 'i~Thaumcraft~itemResource~0';
  const requestedRecipeIds: string[][] = [];

  const compactPayload: RecipeBootstrapPayload = {
    item: {
      itemId,
      modId: 'Thaumcraft',
      internalName: 'itemResource',
      localizedName: '测试物品',
      renderAssetRef: null,
      preferredImageUrl: '/images/item/Thaumcraft/itemResource~0.png',
      unlocalizedName: 'item.thaumcraft.itemResource',
      damage: 0,
      maxStackSize: 64,
      maxDamage: 0,
      imageFileName: 'Thaumcraft/itemResource~0.png',
      tooltip: null,
      searchTerms: 'thaumcraft test',
      toolClasses: null,
    },
    recipeIndex: {
      producedByRecipes: ['prod~seed', 'prod~2', 'shared~3', 'prod~4'],
      usedInRecipes: ['shared~3', 'used~5', 'used~6', 'used~7', 'used~8'],
    },
    indexedCrafting: [
      {
        id: 'prod~seed',
        recipeType: 'crafting',
        outputs: [],
        inputs: [],
        fluidInputs: [],
        fluidOutputs: [],
        machineInfo: null,
        metadata: null,
      },
    ],
    indexedUsage: [],
    indexedSummary: {
      itemId,
      itemName: '测试物品',
      counts: {
        producedBy: 4,
        usedIn: 5,
        machineGroups: 0,
      },
      machineGroups: [],
    },
  };

  db.prepare(`
    INSERT INTO recipe_bootstrap (
      item_id, produced_by_ids, used_in_ids, produced_by_payload, used_in_payload, summary_payload, signature
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    itemId,
    JSON.stringify(compactPayload.recipeIndex.producedByRecipes),
    JSON.stringify(compactPayload.recipeIndex.usedInRecipes),
    JSON.stringify(compactPayload.indexedCrafting),
    JSON.stringify(compactPayload.indexedUsage),
    JSON.stringify(compactPayload),
    'sig~topup',
  );

  const service = new RecipeBootstrapService({
    databaseManager: manager,
    splitExportFallback: false,
    indexedRecipesService: {
      getRecipesByIds: async (recipeIds: string[]) => {
        requestedRecipeIds.push([...recipeIds]);
        return recipeIds.map((recipeId) => ({
          id: recipeId,
          recipeType: 'crafting',
          outputs: [],
          inputs: [],
          fluidInputs: [],
          fluidOutputs: [],
          machineInfo: null,
          metadata: null,
        }));
      },
    } as never,
  });

  const result = await service.getBootstrap(itemId);
  assert.deepEqual(requestedRecipeIds, [[
    'prod~2',
    'shared~3',
    'prod~4',
    'used~5',
    'used~6',
    'used~7',
  ]]);
  assert.deepEqual(
    result?.indexedCrafting.map((recipe) => recipe.id),
    ['prod~seed', 'prod~2', 'shared~3', 'prod~4'],
  );
  assert.deepEqual(
    result?.indexedUsage.map((recipe) => recipe.id),
    ['shared~3', 'used~5', 'used~6', 'used~7'],
  );

  manager.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('RecipeBootstrapService enriches bootstrap recipes with inline ui payloads from acceleration table', async () => {
  const { manager, tempDir } = await createTempDatabase();
  const db = manager.getDatabase();

  const itemId = 'i~Botania~manaResource~4';
  const recipeId = 'r~botania~pool';

  const payload: RecipeBootstrapPayload = {
    item: {
      itemId,
      modId: 'Botania',
      internalName: 'manaResource',
      localizedName: '泰拉钢锭',
      renderAssetRef: null,
      preferredImageUrl: '/images/item/Botania/manaResource~4.png',
      unlocalizedName: 'item.botania.manaResource',
      damage: 0,
      maxStackSize: 64,
      maxDamage: 0,
      imageFileName: 'Botania/manaResource~4.png',
      tooltip: null,
      searchTerms: 'botania terrasteel',
      toolClasses: null,
    },
    recipeIndex: {
      usedInRecipes: [],
      producedByRecipes: [recipeId],
    },
    indexedCrafting: [
      {
        id: recipeId,
        recipeType: 'crafting',
        outputs: [],
        inputs: [],
        fluidInputs: [],
        fluidOutputs: [],
        machineInfo: {
          machineId: 'mana_pool',
          category: 'botania',
          machineType: 'Mana Pool',
          iconInfo: '',
          shapeless: false,
          parsedVoltageTier: null,
          parsedVoltage: null,
        },
        metadata: null,
        additionalData: {},
      },
    ],
    indexedUsage: [],
    indexedSummary: {
      itemId,
      itemName: '泰拉钢锭',
      counts: {
        producedBy: 1,
        usedIn: 0,
        machineGroups: 1,
      },
      machineGroups: [],
    },
  };

  db.prepare(`
    INSERT INTO recipe_bootstrap (
      item_id, produced_by_ids, used_in_ids, produced_by_payload, used_in_payload, summary_payload, signature
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    itemId,
    JSON.stringify(payload.recipeIndex.producedByRecipes),
    JSON.stringify(payload.recipeIndex.usedInRecipes),
    JSON.stringify(payload.indexedCrafting),
    JSON.stringify(payload.indexedUsage),
    JSON.stringify(payload),
    'sig~ui',
  );

  db.prepare(`
    INSERT INTO ui_payloads (
      payload_id, recipe_id, family_key, payload_json, signature
    ) VALUES (?, ?, ?, ?, ?)
  `).run(
    'ui~botania-pool',
    recipeId,
    'botania_mana_pool',
    JSON.stringify({
      recipeId,
      familyKey: 'botania_mana_pool',
      presentation: {
        surface: 'nature_ritual',
        density: 'default',
      },
    }),
    'sig~ui',
  );

  const service = new RecipeBootstrapService({
    databaseManager: manager,
    splitExportFallback: false,
  });

  const result = await service.getBootstrap(itemId);
  const additionalData = result?.indexedCrafting[0]?.additionalData as Record<string, unknown> | undefined;
  assert.equal((additionalData?.uiFamilyKey as string | undefined) ?? null, 'botania_mana_pool');
  assert.equal(
    ((additionalData?.uiPayload as Record<string, unknown> | undefined)?.familyKey as string | undefined) ?? null,
    'botania_mana_pool',
  );

  manager.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});
