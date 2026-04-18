import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import zlib from 'zlib';
import test from 'node:test';
import { DatabaseManager } from '../src/models/database';
import { NeoNeiCompilerService } from '../src/services/neonei-compiler.service';

function writeGzipJson(filePath: string, payload: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, zlib.gzipSync(Buffer.from(JSON.stringify(payload))));
}

function writeTinyPng(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO9WkK8AAAAASUVORK5CYII=',
      'base64',
    ),
  );
}

test('compiler imports split items into acceleration tables and records source signature', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neonei-compiler-'));
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
      searchTerms: 'botania terrasteel',
      imageFileName: 'Botania/manaResource~4.png',
    },
  ]);

  fs.mkdirSync(recipesDir, { recursive: true });
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

  const result = await compiler.compile();
  assert.equal(result.itemsImported, 1);
  assert.equal(result.signature.length > 0, true);

  const db = manager.getDatabase();
  const importedItem = db
    .prepare('SELECT item_id, localized_name, internal_name FROM items_core WHERE item_id = ?')
    .get('i~Botania~manaResource~4') as { item_id: string; localized_name: string; internal_name: string } | undefined;
  assert.equal(importedItem?.localized_name, '泰拉钢锭');
  assert.equal(importedItem?.internal_name, 'manaResource');

  const importedSearch = db
    .prepare('SELECT pinyin_full, pinyin_acronym, aliases, popularity_score FROM items_search WHERE item_id = ?')
    .get('i~Botania~manaResource~4') as {
      pinyin_full: string;
      pinyin_acronym: string;
      aliases: string | null;
      popularity_score: number;
    } | undefined;
  assert.equal(importedSearch?.pinyin_full, 'tailagangding');
  assert.equal(importedSearch?.pinyin_acronym, 'tlgd');
  assert.equal(importedSearch?.aliases?.includes('tailagang'), true);
  assert.equal((importedSearch?.popularity_score ?? 0) > 0, true);

  const compilerState = db
    .prepare('SELECT state_value FROM compiler_state WHERE state_key = ?')
    .get('source_signature') as { state_value: string } | undefined;
  assert.equal(compilerState?.state_value, result.signature);

  manager.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('compiler detects whether acceleration state is fresh for current source roots', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neonei-compiler-fresh-'));
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
      searchTerms: 'botania terrasteel',
      imageFileName: 'Botania/manaResource~4.png',
    },
  ]);

  fs.mkdirSync(recipesDir, { recursive: true });
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

  assert.equal(compiler.isAccelerationStateFresh(), false);
  await compiler.compile();
  assert.equal(compiler.isAccelerationStateFresh(), true);

  writeGzipJson(path.join(itemsDir, 'Botania', 'items.json.gz'), [
    {
      itemId: 'i~Botania~manaResource~4',
      modId: 'Botania',
      internalName: 'manaResource',
      localizedName: '泰拉钢锭',
      searchTerms: 'botania terrasteel',
      imageFileName: 'Botania/manaResource~4.png',
    },
    {
      itemId: 'i~Botania~manaResource~18',
      modId: 'Botania',
      internalName: 'manaResource',
      localizedName: '泰拉钢粒',
      searchTerms: 'botania terrasteel nugget',
      imageFileName: 'Botania/manaResource~18.png',
    },
  ]);

  assert.equal(compiler.isAccelerationStateFresh(), false);

  manager.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('compiler materializes recipe edges, machine groups, and bootstrap payloads', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neonei-compiler-recipes-'));
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
      searchTerms: 'botania terrasteel',
      imageFileName: 'Botania/manaResource~4.png',
    },
    {
      itemId: 'i~Botania~manaResource~0',
      modId: 'Botania',
      internalName: 'manaResource',
      localizedName: '魔力钢锭',
      searchTerms: 'botania manasteel',
      imageFileName: 'Botania/manaResource~0.png',
    },
  ]);

  writeGzipJson(path.join(recipesDir, 'botania', 'Botania', 'recipes.json.gz'), [
    {
      id: 'r~botania~terra~1',
      recipeType: 'terra_plate',
      outputs: [
        {
          item: {
            itemId: 'i~Botania~manaResource~4',
            modId: 'Botania',
            localizedName: '泰拉钢锭',
            imageFileName: 'Botania/manaResource~4.png',
          },
          stackSize: 1,
          probability: 1.0,
        },
      ],
      inputs: [
        {
          slotIndex: 0,
          items: [
            {
              item: {
                itemId: 'i~Botania~manaResource~0',
                modId: 'Botania',
                localizedName: '魔力钢锭',
                imageFileName: 'Botania/manaResource~0.png',
              },
              stackSize: 1,
              probability: 1.0,
            },
          ],
          isOreDictionary: false,
          oreDictName: null,
        },
      ],
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
      additionalData: {},
      metadata: {},
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

  const db = manager.getDatabase();
  const recipesCoreCount = (db.prepare('SELECT COUNT(*) AS c FROM recipes_core').get() as { c: number }).c;
  assert.equal(recipesCoreCount, 1);

  const producedEdgeCount = (db.prepare("SELECT COUNT(*) AS c FROM recipe_edges WHERE item_id = ? AND relation_type = 'produced_by'").get('i~Botania~manaResource~4') as { c: number }).c;
  assert.equal(producedEdgeCount, 1);

  const usedEdgeCount = (db.prepare("SELECT COUNT(*) AS c FROM recipe_edges WHERE item_id = ? AND relation_type = 'used_in'").get('i~Botania~manaResource~0') as { c: number }).c;
  assert.equal(usedEdgeCount, 1);

  const machineGroupCount = (db.prepare('SELECT COUNT(*) AS c FROM recipe_machine_groups WHERE item_id = ?').get('i~Botania~manaResource~4') as { c: number }).c;
  assert.equal(machineGroupCount, 1);

  const bootstrapRow = db
    .prepare('SELECT summary_payload FROM recipe_bootstrap WHERE item_id = ?')
    .get('i~Botania~manaResource~4') as { summary_payload: string } | undefined;
  assert.equal(Boolean(bootstrapRow?.summary_payload), true);
  const bootstrapPayload = JSON.parse(bootstrapRow!.summary_payload) as { recipeIndex: { producedByRecipes: string[] } };
  assert.deepEqual(bootstrapPayload.recipeIndex.producedByRecipes, ['r~botania~terra~1']);

  manager.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('compiler stores compact indexed recipe payloads instead of raw split recipe blobs', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neonei-compiler-compact-'));
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
      searchTerms: 'botania terrasteel',
      imageFileName: 'Botania/manaResource~4.png',
    },
    {
      itemId: 'i~Botania~manaResource~0',
      modId: 'Botania',
      internalName: 'manaResource',
      localizedName: '魔力钢锭',
      searchTerms: 'botania manasteel',
      imageFileName: 'Botania/manaResource~0.png',
    },
  ]);

  writeGzipJson(path.join(recipesDir, 'botania', 'Botania', 'recipes.json.gz'), [
    {
      id: 'r~botania~terra~compact',
      recipeType: 'terra_plate',
      outputs: [
        {
          item: {
            itemId: 'i~Botania~manaResource~4',
          },
          stackSize: 1,
          probability: 1,
        },
      ],
      inputs: [
        {
          slotIndex: 0,
          items: [
            {
              item: {
                itemId: 'i~Botania~manaResource~0',
              },
              stackSize: 1,
              probability: 1,
            },
          ],
          isOreDictionary: false,
          oreDictName: null,
        },
      ],
      machineInfo: {
        machineId: 'm~Botania~terra_plate',
        category: 'botania',
        machineType: 'Terra Plate',
        iconInfo: 'botania',
        shapeless: true,
        parsedVoltageTier: null,
        parsedVoltage: null,
      },
      metadata: {
        instability: 3,
        debugBlob: 'x'.repeat(4096),
      },
      additionalData: {
        giantDebugBlob: 'y'.repeat(8192),
      },
      recipeTypeData: {
        itemInputDimension: { width: 1, height: 1 },
        previewJunk: 'z'.repeat(2048),
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

  const db = manager.getDatabase();
  const recipeRow = db
    .prepare('SELECT payload FROM recipes_core WHERE recipe_id = ?')
    .get('r~botania~terra~compact') as { payload: string } | undefined;
  assert.equal(Boolean(recipeRow?.payload), true);

  const compactPayload = JSON.parse(recipeRow!.payload) as {
    outputs: Array<{ item: { localizedName: string } }>;
    inputs: Array<{ items: Array<{ item: { localizedName: string } }> }>;
    metadata: Record<string, unknown> | null;
    additionalData: Record<string, unknown> | null;
    recipeTypeData: Record<string, unknown> | null;
  };
  assert.equal(compactPayload.outputs[0]?.item.localizedName, '泰拉钢锭');
  assert.equal(compactPayload.inputs[0]?.items[0]?.item.localizedName, '魔力钢锭');
  assert.equal('giantDebugBlob' in (compactPayload.additionalData ?? {}), false);
  assert.equal('debugBlob' in (compactPayload.metadata ?? {}), false);
  assert.equal('previewJunk' in (compactPayload.recipeTypeData ?? {}), false);

  const bootstrapRow = db
    .prepare('SELECT produced_by_payload, used_in_payload, summary_payload FROM recipe_bootstrap WHERE item_id = ?')
    .get('i~Botania~manaResource~4') as {
      produced_by_payload: string;
      used_in_payload: string;
      summary_payload: string;
    } | undefined;
  assert.equal(Boolean(bootstrapRow?.summary_payload), true);
  const bootstrapPayload = JSON.parse(bootstrapRow!.summary_payload) as {
    recipeIndex: { producedByRecipes: string[]; usedInRecipes: string[] };
    indexedSummary: { counts: { producedBy: number; usedIn: number } };
    seedRecipeIds?: { producedBy: string[]; usedIn: string[] };
  };
  assert.deepEqual(bootstrapPayload.recipeIndex.producedByRecipes, ['r~botania~terra~compact']);
  assert.equal(bootstrapPayload.indexedSummary.counts.producedBy, 1);
  assert.equal(Array.isArray(bootstrapPayload.seedRecipeIds?.producedBy), true);
  assert.equal(Array.isArray(JSON.parse(bootstrapRow!.produced_by_payload)), true);
  assert.equal(JSON.parse(bootstrapRow!.produced_by_payload).length <= 1, true);
  assert.equal(JSON.parse(bootstrapRow!.used_in_payload).length <= 1, true);
  assert.equal(bootstrapRow!.produced_by_payload.includes('giantDebugBlob'), false);
  assert.equal(bootstrapRow!.produced_by_payload.includes('debugBlob'), false);

  const payloadBytesState = db
    .prepare('SELECT state_value FROM compiler_state WHERE state_key = ?')
    .get('recipes_core_payload_bytes') as { state_value: string } | undefined;
  assert.equal(Number(payloadBytesState?.state_value ?? 0) > 0, true);

  manager.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('compiler pre-generates hot page atlases into assets manifest', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neonei-compiler-atlas-'));
  const dbPath = path.join(tempDir, 'acceleration.db');
  const itemsDir = path.join(tempDir, 'items');
  const recipesDir = path.join(tempDir, 'recipes');
  const canonicalDir = path.join(tempDir, 'canonical');
  const imageRoot = path.join(tempDir, 'image');
  const atlasDir = path.join(tempDir, 'page-atlas-cache');

  writeGzipJson(path.join(itemsDir, 'Botania', 'items.json.gz'), [
    {
      itemId: 'i~Botania~manaResource~4',
      modId: 'Botania',
      internalName: 'manaResource',
      localizedName: '泰拉钢锭',
      searchTerms: 'botania terrasteel',
      imageFileName: 'Botania/manaResource~4.png',
    },
    {
      itemId: 'i~Botania~manaResource~0',
      modId: 'Botania',
      internalName: 'manaResource',
      localizedName: '魔力钢锭',
      searchTerms: 'botania manasteel',
      imageFileName: 'Botania/manaResource~0.png',
    },
  ]);

  fs.mkdirSync(recipesDir, { recursive: true });
  fs.mkdirSync(canonicalDir, { recursive: true });
  writeTinyPng(path.join(imageRoot, 'item', 'Botania', 'manaResource~4.png'));
  writeTinyPng(path.join(imageRoot, 'item', 'Botania', 'manaResource~0.png'));

  const manager = new DatabaseManager(dbPath);
  await manager.init();

  const compiler = new NeoNeiCompilerService(
    manager,
    {
      itemsDir,
      recipesDir,
      canonicalDir,
      imageRoot,
    },
    {
      hotPageAtlas: {
        enabled: true,
        pages: 1,
        pageSize: 2,
        slotSizes: [32],
        atlasOutputDir: atlasDir,
      },
    },
  );

  await compiler.compile();

  const db = manager.getDatabase();
  const atlasCount = (db.prepare("SELECT COUNT(*) AS c FROM assets_manifest WHERE asset_type = 'page_atlas'").get() as { c: number }).c;
  assert.equal(atlasCount, 1);

  const atlasRow = db.prepare("SELECT path, metadata_json FROM assets_manifest WHERE asset_type = 'page_atlas' LIMIT 1").get() as {
    path: string;
    metadata_json: string;
  };
  assert.equal(Boolean(atlasRow.metadata_json), true);
  assert.equal(fs.existsSync(path.join(atlasDir, atlasRow.path)), true);

  manager.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('compiler caps bootstrap inline recipe payloads for hot items and keeps full recipe ids in summary', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neonei-compiler-bootstrap-cap-'));
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
      searchTerms: 'botania terrasteel',
      imageFileName: 'Botania/manaResource~4.png',
    },
    {
      itemId: 'i~Botania~manaResource~0',
      modId: 'Botania',
      internalName: 'manaResource',
      localizedName: '魔力钢锭',
      searchTerms: 'botania manasteel',
      imageFileName: 'Botania/manaResource~0.png',
    },
  ]);

  const recipes = Array.from({ length: 4 }, (_, index) => ({
    id: `r~botania~terra~seed~${index + 1}`,
    recipeType: 'terra_plate',
    outputs: [
      {
        item: { itemId: 'i~Botania~manaResource~4' },
        stackSize: 1,
        probability: 1,
      },
    ],
    inputs: [
      {
        slotIndex: index,
        items: [
          {
            item: { itemId: 'i~Botania~manaResource~0' },
            stackSize: 1,
            probability: 1,
          },
        ],
        isOreDictionary: false,
        oreDictName: null,
      },
    ],
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
    recipeTypeData: null,
  }));

  writeGzipJson(path.join(recipesDir, 'botania', 'Botania', 'recipes.json.gz'), recipes);

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

  const db = manager.getDatabase();
  const bootstrapRow = db
    .prepare('SELECT produced_by_payload, summary_payload FROM recipe_bootstrap WHERE item_id = ?')
    .get('i~Botania~manaResource~4') as { produced_by_payload: string; summary_payload: string } | undefined;
  assert.equal(Boolean(bootstrapRow?.summary_payload), true);

  const producedByInline = JSON.parse(bootstrapRow!.produced_by_payload) as Array<{ id: string }>;
  const summaryPayload = JSON.parse(bootstrapRow!.summary_payload) as {
    recipeIndex: { producedByRecipes: string[] };
    seedRecipeIds?: { producedBy: string[] };
  };

  assert.equal(producedByInline.length < summaryPayload.recipeIndex.producedByRecipes.length, true);
  assert.equal(summaryPayload.recipeIndex.producedByRecipes.length, 4);
  assert.equal(summaryPayload.seedRecipeIds?.producedBy.length, producedByInline.length);

  manager.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});
