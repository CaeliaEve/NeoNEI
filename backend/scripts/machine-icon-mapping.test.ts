import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import path from 'path';
import { getMachineIconItem } from '../src/services/machine-icon-mapping.service';

const ACCELERATION_DB_PATH = path.resolve(__dirname, '../data/acceleration.db');

const CRITICAL_MACHINE_TYPES = [
  '\u88c5\u914d\u7ebf\u52a0\u5de5 (UMV)',
  '\u7814\u7a76\u7ad9 (UMV)',
  '\u7ec4\u88c5\u673a (ULV)',
  '\u538b\u7f29\u673a (UMV)',
  '\u7535\u89e3\u673a (MV)',
  '\u79bb\u5fc3\u673a (ULV)',
  '\u5377\u677f\u673a (UEV)',
  '\u677f\u6750\u5207\u5272\u673a (LV)',
  '\u5316\u5b66\u53cd\u5e94\u91dc (LV)',
  '\u6d41\u4f53\u704c\u88c5\u673a (ULV)',
];

test('critical machine icon mappings resolve to items that exist in acceleration db', () => {
  const db = new Database(ACCELERATION_DB_PATH, { readonly: true });

  try {
    for (const machineType of CRITICAL_MACHINE_TYPES) {
      const icon = getMachineIconItem(machineType);
      assert.ok(icon, `expected icon mapping for ${machineType}`);

      const row = db
        .prepare('SELECT item_id FROM items_core WHERE item_id = ?')
        .get(icon!.itemId) as { item_id?: string } | undefined;

      assert.ok(row?.item_id, `expected ${machineType} to map to an existing item, got ${icon!.itemId}`);
    }
  } finally {
    db.close();
  }
});

test('all mapped machine types in acceleration db resolve to existing items', () => {
  const db = new Database(ACCELERATION_DB_PATH, { readonly: true });

  try {
    const machineTypes = (
      db
        .prepare(`
          SELECT DISTINCT machine_type
          FROM recipes_core
          WHERE machine_type IS NOT NULL AND machine_type != ''
        `)
        .all() as Array<{ machine_type: string }>
    ).map((row) => row.machine_type);

    const invalid: Array<{ machineType: string; itemId: string }> = [];

    for (const machineType of machineTypes) {
      const icon = getMachineIconItem(machineType);
      if (!icon) {
        continue;
      }

      const row = db
        .prepare('SELECT item_id FROM items_core WHERE item_id = ?')
        .get(icon.itemId) as { item_id?: string } | undefined;

      if (!row?.item_id) {
        invalid.push({ machineType, itemId: icon.itemId });
      }
    }

    assert.deepEqual(invalid, []);
  } finally {
    db.close();
  }
});

test('gt machine families prefer multiblock icons over singleblock placeholders', () => {
  const expectedMappings = new Map<string, string>([
    ['装配线加工 (UMV)', 'i~gregtech~gt.blockmachines~1170'],
    ['研究站 (UXV)', 'i~gregtech~gt.blockmachines~15331'],
    ['压缩机 (ULV)', 'i~gregtech~gt.blockmachines~1001'],
    ['电解机 (MV)', 'i~gregtech~gt.blockmachines~796'],
    ['离心机 (ULV)', 'i~gregtech~gt.blockmachines~790'],
    ['高炉 (HV)', 'i~gregtech~gt.blockmachines~1000'],
    ['化学反应釜 (LV)', 'i~gregtech~gt.blockmachines~1169'],
    ['搅拌机 (MV)', 'i~gregtech~gt.blockmachines~811'],
    ['真空冷冻机 (MV)', 'i~gregtech~gt.blockmachines~12731'],
    ['洗矿机 (LV)', 'i~gregtech~gt.blockmachines~850'],
    ['粉碎机 (ULV)', 'i~gregtech~gt.blockmachines~797'],
    ['电弧炉 (LV)', 'i~gregtech~gt.blockmachines~862'],
    ['合金炉 (UHV)', 'i~gregtech~gt.blockmachines~31023'],
    ['流体固化器 (UHV)', 'i~gregtech~gt.blockmachines~10891'],
    ['流体提取机 (LV)', 'i~gregtech~gt.blockmachines~2730'],
    ['打包机 (ULV)', 'i~gregtech~gt.blockmachines~407'],
    ['解包器 (ULV)', 'i~gregtech~gt.blockmachines~418'],
    ['车床 (LV)', 'i~gregtech~gt.blockmachines~686'],
    ['卷板机 (LV)', 'i~gregtech~gt.blockmachines~10801'],
    ['压模机 (LV)', 'i~gregtech~gt.blockmachines~859'],
    ['板材切割机 (LV)', 'i~gregtech~gt.blockmachines~10821'],
    ['激光蚀刻机 (EV)', 'i~gregtech~gt.blockmachines~3004'],
    ['PCB工厂 (EV)', 'i~gregtech~gt.blockmachines~356'],
    ['太阳能板制造厂 (EV)', 'i~gregtech~gt.blockmachines~367'],
  ]);

  for (const [machineType, expectedItemId] of expectedMappings) {
    const icon = getMachineIconItem(machineType);
    assert.ok(icon, `expected icon mapping for ${machineType}`);
    assert.equal(icon!.itemId, expectedItemId, `expected ${machineType} to use multiblock icon ${expectedItemId}`);
  }
});
