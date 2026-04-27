import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import test from 'node:test';
import { DatabaseManager } from '../src/models/database';

test('database bootstrap creates stage-one acceleration tables', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neonei-accel-schema-'));
  const dbPath = path.join(tempDir, 'acceleration.db');

  const manager = new DatabaseManager(dbPath);
  await manager.init();

  const db = manager.getDatabase();
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
    .all()
    .map((row) => (row as { name: string }).name);

  const requiredTables = [
    'compiler_state',
    'items_core',
    'items_search',
    'recipes_core',
    'recipe_edges',
    'recipe_bootstrap',
    'recipe_machine_groups',
    'recipe_category_groups',
    'assets_manifest',
    'hot_items',
    'publish_payloads',
  ];

  for (const tableName of requiredTables) {
    assert.equal(tables.includes(tableName), true, `expected table ${tableName} to exist`);
  }

  manager.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});
