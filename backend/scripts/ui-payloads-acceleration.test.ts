import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import zlib from 'zlib';
import test from 'node:test';
import { DatabaseManager } from '../src/models/database';
import { NeoNeiCompilerService } from '../src/services/neonei-compiler.service';
import { UiPayloadsService } from '../src/services/ui-payloads.service';

function writeGzipJson(filePath: string, payload: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, zlib.gzipSync(Buffer.from(JSON.stringify(payload))));
}

test('compiler materializes ui payloads for supported family recipes and service can read them', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neonei-ui-payloads-'));
  const dbPath = path.join(tempDir, 'acceleration.db');
  const itemsDir = path.join(tempDir, 'items');
  const recipesDir = path.join(tempDir, 'recipes');
  const canonicalDir = path.join(tempDir, 'canonical');
  const imageRoot = path.join(tempDir, 'image');

  writeGzipJson(path.join(itemsDir, 'Botania', 'items.json.gz'), [
    {
      itemId: 'i~Botania~manaResource~4',
      modId: 'Botania',
      internalName: 'manaResource',
      localizedName: '泰拉钢锭',
      imageFileName: 'Botania/manaResource~4.png',
    },
    {
      itemId: 'i~Botania~manaResource~0',
      modId: 'Botania',
      internalName: 'manaResource',
      localizedName: '魔力钢锭',
      imageFileName: 'Botania/manaResource~0.png',
    },
  ]);

  writeGzipJson(path.join(recipesDir, 'crafting', 'Botania', 'recipes.json.gz'), [
    {
      id: 'r~botania~terra~1',
      recipeType: 'crafting',
      outputs: [
        { item: { itemId: 'i~Botania~manaResource~4' }, stackSize: 1, probability: 1 },
      ],
      inputs: [
        { slotIndex: 0, items: [{ item: { itemId: 'i~Botania~manaResource~0' }, stackSize: 1, probability: 1 }] },
      ],
      machineInfo: {
        machineId: 'rt~botania~terra_plate',
        category: 'Botania',
        machineType: 'Terra Plate',
        parsedVoltageTier: null,
        parsedVoltage: null,
      },
    },
    {
      id: 'r~botania~rune~1',
      recipeType: 'crafting',
      outputs: [
        { item: { itemId: 'i~Botania~manaResource~4' }, stackSize: 1, probability: 1 },
      ],
      inputs: [
        { slotIndex: 0, items: [{ item: { itemId: 'i~Botania~manaResource~0' }, stackSize: 1, probability: 1 }] },
      ],
      machineInfo: {
        machineId: 'rt~botania~rune_altar',
        category: 'Botania',
        machineType: 'Rune Altar',
        parsedVoltageTier: null,
        parsedVoltage: null,
      },
    },
    {
      id: 'r~botania~pool~1',
      recipeType: 'crafting',
      outputs: [
        { item: { itemId: 'i~Botania~manaResource~4' }, stackSize: 1, probability: 1 },
      ],
      inputs: [
        { slotIndex: 0, items: [{ item: { itemId: 'i~Botania~manaResource~0' }, stackSize: 1, probability: 1 }] },
      ],
      machineInfo: {
        machineId: 'rt~botania~mana_pool',
        category: 'Botania',
        machineType: 'Mana Pool',
        parsedVoltageTier: null,
        parsedVoltage: null,
      },
    },
    {
      id: 'r~thaumcraft~infusion~1',
      recipeType: 'infusion',
      outputs: [
        { item: { itemId: 'i~Botania~manaResource~4' }, stackSize: 1, probability: 1 },
      ],
      inputs: [
        { slotIndex: 1010, items: [{ item: { itemId: 'i~Botania~manaResource~0' }, stackSize: 1, probability: 1 }] },
      ],
      machineInfo: {
        machineId: 'rt~thaumcraft~infusion',
        category: 'Thaumcraft',
        machineType: 'Infusion',
        parsedVoltageTier: null,
        parsedVoltage: null,
      },
    },
  ]);

  fs.mkdirSync(canonicalDir, { recursive: true });
  fs.mkdirSync(path.join(imageRoot, 'item', 'Botania'), { recursive: true });

  const manager = new DatabaseManager(dbPath);
  await manager.init();

  const compiler = new NeoNeiCompilerService(manager, {
    itemsDir,
    recipesDir,
    canonicalDir,
    imageRoot,
  });
  await compiler.compile();

  const payloadService = new UiPayloadsService({
    databaseProvider: () => manager.getDatabase(),
  });

  const payload = await payloadService.getByRecipeId('r~botania~terra~1');
  assert.equal(payload.familyKey, 'botania_terra_plate');
  assert.equal(payload.machineType, 'Terra Plate');
  assert.deepEqual(payload.outputItemIds, ['i~Botania~manaResource~4']);

  const runePayload = await payloadService.getByRecipeId('r~botania~rune~1');
  assert.equal(runePayload.familyKey, 'botania_rune_altar');

  const poolPayload = await payloadService.getByRecipeId('r~botania~pool~1');
  assert.equal(poolPayload.familyKey, 'botania_mana_pool');

  const infusionPayload = await payloadService.getByRecipeId('r~thaumcraft~infusion~1');
  assert.equal(infusionPayload.familyKey, 'thaumcraft_infusion');

  manager.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});
