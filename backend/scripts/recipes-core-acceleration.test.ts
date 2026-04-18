import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import test from 'node:test';
import { DatabaseManager } from '../src/models/database';
import { IndexedRecipesService, type IndexedRecipe } from '../src/services/recipes-indexed.service';

async function createTempDatabase(): Promise<{ manager: DatabaseManager; tempDir: string }> {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neonei-recipes-core-'));
  const dbPath = path.join(tempDir, 'acceleration.db');
  const manager = new DatabaseManager(dbPath);
  await manager.init();
  return { manager, tempDir };
}

test('IndexedRecipesService reads recipe by id and machine from materialized recipes_core payload', async () => {
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

  db.prepare(`
    INSERT INTO recipes_core (
      recipe_id, recipe_type, family, machine_type, voltage_tier, source_mod,
      input_count, output_count, bootstrap_key, payload
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    recipe.id,
    recipe.recipeType,
    'botania',
    '泰拉凝聚板',
    null,
    'Botania',
    0,
    0,
    'i~Botania~manaResource~4',
    JSON.stringify(recipe),
  );

  const service = new IndexedRecipesService({
    databaseManager: manager,
    splitExportFallback: false,
  });

  const byId = await service.getRecipeById(recipe.id);
  assert.equal(byId?.id, recipe.id);

  const byMachine = await service.getRecipesByMachine('泰拉凝聚板');
  assert.equal(byMachine.length, 1);
  assert.equal(byMachine[0]?.id, recipe.id);

  const byAlias = await service.getRecipesByMachine('Terra Plate');
  assert.equal(byAlias.length, 1);
  assert.equal(byAlias[0]?.id, recipe.id);

  const machineTypes = await service.getAllMachineTypes();
  assert.equal(machineTypes.includes('泰拉凝聚板'), true);

  manager.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});
