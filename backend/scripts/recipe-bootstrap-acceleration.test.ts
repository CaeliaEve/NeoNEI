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

  const service = new RecipeBootstrapService({
    databaseManager: manager,
    splitExportFallback: false,
    itemsService: {
      getItemById: async (itemId: string) => ({
        itemId,
        modId: 'gregtech',
        internalName: 'gt.blockmachines',
        localizedName: '测试机器',
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
      getCraftingRecipesForItem: async () => ([
        {
          id: 'r~test~crafting',
          recipeType: 'crafting',
          outputs: [],
          inputs: [],
          fluidInputs: [],
          fluidOutputs: [],
          machineInfo: null,
          metadata: null,
        },
      ]),
      getUsageRecipesForItem: async () => ([
        {
          id: 'r~test~usage',
          recipeType: 'crafting',
          outputs: [],
          inputs: [],
          fluidInputs: [],
          fluidOutputs: [],
          machineInfo: null,
          metadata: null,
        },
      ]),
    } as never,
  });

  const result = await service.getBootstrap('i~gregtech~gt.blockmachines~16027');
  assert.equal(result?.item.localizedName, '测试机器');
  assert.deepEqual(result?.recipeIndex.producedByRecipes, ['r~test~crafting']);
  assert.deepEqual(result?.recipeIndex.usedInRecipes, ['r~test~usage']);

  manager.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});
