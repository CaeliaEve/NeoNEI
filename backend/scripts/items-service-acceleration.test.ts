import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import test from 'node:test';
import { DatabaseManager } from '../src/models/database';
import { ItemsService } from '../src/services/items.service';

async function createTempDatabase(): Promise<{ manager: DatabaseManager; tempDir: string }> {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neonei-items-service-'));
  const dbPath = path.join(tempDir, 'acceleration.db');
  const manager = new DatabaseManager(dbPath);
  await manager.init();
  return { manager, tempDir };
}

test('ItemsService reads paginated items and mods from acceleration tables', async () => {
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

  db.prepare(`
    INSERT INTO items_core (
      item_id, mod_id, internal_name, localized_name, unlocalized_name, damage,
      image_file_name, render_asset_ref, preferred_image_url, tooltip, search_terms
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'i~gregtech~gt.metaitem.01~17202',
    'gregtech',
    'gt.metaitem.01',
    '泰拉钢板',
    'item.gregtech.plate',
    0,
    'gregtech/gt.metaitem.01~17202.png',
    null,
    '/images/item/gregtech/gt.metaitem.01~17202.png',
    null,
    'gregtech terrasteel plate',
  );

  const service = new ItemsService({ databaseManager: manager, splitExportFallback: false });
  const page = await service.getItems({ page: 1, pageSize: 10 });
  assert.equal(page.total, 2);
  assert.equal(page.data[0]?.localizedName, '泰拉钢板');
  assert.equal(page.data[1]?.localizedName, '泰拉钢锭');

  const filtered = await service.getItems({ page: 1, pageSize: 10, modId: 'Botania' });
  assert.equal(filtered.total, 1);
  assert.equal(filtered.data[0]?.itemId, 'i~Botania~manaResource~4');

  const searched = await service.getItems({ page: 1, pageSize: 10, search: '泰拉钢锭' });
  assert.equal(searched.total, 1);
  assert.equal(searched.data[0]?.itemId, 'i~Botania~manaResource~4');

  const mods = await service.getMods();
  assert.deepEqual(mods, [
    { modId: 'Botania', modName: 'Botania', itemCount: 1 },
    { modId: 'gregtech', modName: 'gregtech', itemCount: 1 },
  ]);

  const single = await service.getItemById('i~Botania~manaResource~4');
  assert.equal(single?.localizedName, '泰拉钢锭');

  const batch = await service.getItemsByIds(['i~gregtech~gt.metaitem.01~17202', 'i~Botania~manaResource~4']);
  assert.equal(batch.length, 2);
  assert.equal(batch[0]?.localizedName, '泰拉钢板');
  assert.equal(batch[1]?.localizedName, '泰拉钢锭');

  manager.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});
