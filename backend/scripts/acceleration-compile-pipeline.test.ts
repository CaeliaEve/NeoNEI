import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import zlib from 'zlib';
import test from 'node:test';
import { DatabaseManager } from '../src/models/database';
import { compileAccelerationDatabase } from '../src/services/acceleration-db-pipeline.service';

function writeGzipJson(filePath: string, payload: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, zlib.gzipSync(Buffer.from(JSON.stringify(payload))));
}

test('compileAccelerationDatabase rebuilds into a fresh file and swaps target database in place', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neonei-accel-pipeline-'));
  const targetDbPath = path.join(tempDir, 'acceleration.db');
  const itemsDir = path.join(tempDir, 'items');
  const recipesDir = path.join(tempDir, 'recipes');
  const canonicalDir = path.join(tempDir, 'canonical');
  const imageRoot = path.join(tempDir, 'image');

  const oldManager = new DatabaseManager(targetDbPath);
  await oldManager.init();
  const oldDb = oldManager.getDatabase();
  oldDb.prepare(`
    INSERT INTO compiler_state (state_key, state_value)
    VALUES (?, ?)
  `).run('source_signature', 'stale-signature');
  oldDb.prepare(`
    INSERT INTO items_core (
      item_id, mod_id, internal_name, localized_name, unlocalized_name, damage,
      image_file_name, render_asset_ref, preferred_image_url, tooltip, search_terms
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'i~Old~stale~0',
    'Old',
    'stale',
    '过期物品',
    'item.old.stale',
    0,
    null,
    null,
    null,
    null,
    null,
  );
  oldManager.close();

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

  writeGzipJson(path.join(recipesDir, 'botania', 'Botania', 'recipes.json.gz'), []);
  fs.mkdirSync(canonicalDir, { recursive: true });
  fs.mkdirSync(path.join(imageRoot, 'item', 'Botania'), { recursive: true });

  await compileAccelerationDatabase({
    targetDbPath,
    sourceRoots: {
      itemsDir,
      recipesDir,
      canonicalDir,
      imageRoot,
    },
  });

  const manager = new DatabaseManager(targetDbPath);
  await manager.init();
  const db = manager.getDatabase();
  const itemIds = (db.prepare('SELECT item_id FROM items_core ORDER BY item_id').all() as Array<{ item_id: string }>)
    .map((row) => row.item_id);
  assert.deepEqual(itemIds, ['i~Botania~manaResource~4']);
  assert.equal(fs.existsSync(`${targetDbPath}.wal`), false);
  assert.equal(fs.existsSync(`${targetDbPath}.shm`), false);

  manager.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});
