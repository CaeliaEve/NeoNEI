import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import test from 'node:test';
import {
  buildSearchIndexEntry,
  matchesIndexedItem,
  normalizeSearchKeyword,
  queryAccelerationSearch,
  ItemsSearchService,
} from '../src/services/items-search.service';

test('buildSearchIndexEntry includes full pinyin and acronym for localized Chinese names', () => {
  const entry = buildSearchIndexEntry({
    itemId: 'item~Thaumcraft~ItemThaumonomicon~0',
    localizedName: '神秘时代',
    modId: 'Thaumcraft',
    internalName: 'ItemThaumonomicon',
    searchTerms: 'thaumcraft thaumonomicon',
  });

  assert.equal(entry.pinyinFull, 'shenmishidai');
  assert.equal(entry.pinyinAcronym, 'smsd');
});

test('matchesIndexedItem supports localized text, full pinyin, and acronym queries', () => {
  const entry = buildSearchIndexEntry({
    itemId: 'item~Thaumcraft~ItemThaumonomicon~0',
    localizedName: '神秘时代',
    modId: 'Thaumcraft',
    internalName: 'ItemThaumonomicon',
    searchTerms: 'thaumcraft thaumonomicon',
  });

  assert.equal(matchesIndexedItem(entry, normalizeSearchKeyword('神秘')), true);
  assert.equal(matchesIndexedItem(entry, normalizeSearchKeyword('shenmi')), true);
  assert.equal(matchesIndexedItem(entry, normalizeSearchKeyword('smsd')), true);
  assert.equal(matchesIndexedItem(entry, normalizeSearchKeyword('thaumonomicon')), true);
});

test('matchesIndexedItem keeps english-name search working', () => {
  const entry = buildSearchIndexEntry({
    itemId: 'item~minecraft~iron_ingot~0',
    localizedName: 'Iron Ingot',
    modId: 'minecraft',
    internalName: 'iron_ingot',
    searchTerms: 'iron ingot metal',
  });

  assert.equal(matchesIndexedItem(entry, normalizeSearchKeyword('iron')), true);
  assert.equal(matchesIndexedItem(entry, normalizeSearchKeyword('ii')), false);
});

test('queryAccelerationSearch matches by pinyin and acronym from acceleration tables', () => {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE items_search (
      item_id TEXT PRIMARY KEY,
      localized_name_norm TEXT,
      internal_name_norm TEXT,
      item_id_norm TEXT,
      search_terms_norm TEXT,
      pinyin_full TEXT,
      pinyin_acronym TEXT,
      aliases TEXT,
      popularity_score REAL DEFAULT 0,
      family_score REAL DEFAULT 0
    );
    CREATE TABLE items_core (
      item_id TEXT PRIMARY KEY,
      localized_name TEXT,
      mod_id TEXT,
      internal_name TEXT
    );
    CREATE TABLE hot_items (
      item_id TEXT PRIMARY KEY,
      popularity_score REAL DEFAULT 0,
      home_rank INTEGER,
      search_rank INTEGER,
      recipe_rank INTEGER
    );
  `);

  db.prepare(`
    INSERT INTO items_core (item_id, localized_name, mod_id, internal_name)
    VALUES (?, ?, ?, ?)
  `).run('i~Botania~manaResource~4', '泰拉钢锭', 'Botania', 'manaResource');

  const insertSearch = db.prepare(`
    INSERT INTO items_search (
      item_id, localized_name_norm, internal_name_norm, item_id_norm, search_terms_norm,
      pinyin_full, pinyin_acronym, aliases, popularity_score, family_score
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertSearch.run(
    'i~Botania~manaResource~4',
    '泰拉钢锭',
    'manaresource',
    'i~botania~manaresource~4',
    'botania terrasteel',
    'tailagangding',
    'tlgd',
    '泰拉钢 tailagang tlg',
    120,
    0,
  );

  db.prepare(`
    INSERT INTO hot_items (item_id, popularity_score, home_rank, search_rank, recipe_rank)
    VALUES (?, ?, ?, ?, ?)
  `).run('i~Botania~manaResource~4', 999, 1, 1, 20);

  db.prepare(`
    INSERT INTO items_core (item_id, localized_name, mod_id, internal_name)
    VALUES (?, ?, ?, ?)
  `).run('i~gregtech~gt.metaitem.01~17202', '泰拉钢板', 'gregtech', 'gt.metaitem.01');

  insertSearch.run(
    'i~gregtech~gt.metaitem.01~17202',
    '泰拉钢板',
    'gt.metaitem.01',
    'i~gregtech~gt.metaitem.01~17202',
    'gregtech terrasteel plate',
    'tailagangban',
    'tlgb',
    null,
    0,
    0,
  );

  const byPinyin = queryAccelerationSearch(db, 'tailagang', 10);
  assert.equal(byPinyin[0]?.itemId, 'i~Botania~manaResource~4');

  const byAcronym = queryAccelerationSearch(db, 'tlgd', 10);
  assert.equal(byAcronym[0]?.itemId, 'i~Botania~manaResource~4');

  db.close();
});

test('ItemsSearchService reads all-items and paginated items from acceleration tables when available', async () => {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE items_search (
      item_id TEXT PRIMARY KEY,
      localized_name_norm TEXT,
      internal_name_norm TEXT,
      item_id_norm TEXT,
      search_terms_norm TEXT,
      pinyin_full TEXT,
      pinyin_acronym TEXT,
      aliases TEXT,
      popularity_score REAL DEFAULT 0,
      family_score REAL DEFAULT 0
    );
    CREATE TABLE items_core (
      item_id TEXT PRIMARY KEY,
      localized_name TEXT,
      mod_id TEXT,
      internal_name TEXT
    );
  `);

  db.prepare(`INSERT INTO items_core (item_id, localized_name, mod_id, internal_name) VALUES (?, ?, ?, ?)`)
    .run('i~Botania~manaResource~4', '泰拉钢锭', 'Botania', 'manaResource');
  db.prepare(`INSERT INTO items_core (item_id, localized_name, mod_id, internal_name) VALUES (?, ?, ?, ?)`)
    .run('i~gregtech~gt.metaitem.01~17202', '泰拉钢板', 'gregtech', 'gt.metaitem.01');

  const service = new ItemsSearchService({
    databaseProvider: () => db,
    splitExportFallback: false,
  });

  const all = await service.getAllItemsBasic();
  assert.equal(all.length, 2);
  assert.equal(all[0]?.localizedName, '泰拉钢板');

  const page = await service.getItemsPaginated(1, 10, 'Botania');
  assert.equal(page.total, 1);
  assert.equal(page.items[0]?.itemId, 'i~Botania~manaResource~4');

  db.close();
});
