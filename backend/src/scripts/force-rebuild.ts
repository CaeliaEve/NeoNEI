// @ts-nocheck
import * as fs from 'fs';
import { getDatabaseManager } from '../models/database';
import { DB_FILE } from './script-config';

async function forceRebuild() {
  console.log('=== 强制重建 recipe_summaries 表 ===\n');

  const dbManager = getDatabaseManager();
  await dbManager.init();
  const db = dbManager.getDatabase();

  console.log('1. 先保存当前数据库...');
  const data = db.export();
  fs.writeFileSync(DB_FILE, data, 'binary');
  console.log('   已保存。\n');

  console.log('2. 删除并重建 recipe_summaries ...');
  db.run('DROP TABLE IF EXISTS recipe_summaries');
  db.run(`
    CREATE TABLE recipe_summaries (
      recipe_id TEXT PRIMARY KEY,
      recipe_type TEXT NOT NULL,
      input_item_ids TEXT NOT NULL,
      output_item_ids TEXT NOT NULL
    )
  `);
  console.log('   已重建。\n');

  const data2 = db.export();
  fs.writeFileSync(DB_FILE, data2, 'binary');
  console.log('3. 重建结果已写回数据库文件。\n');

  const count = db.exec('SELECT COUNT(*) FROM recipe_summaries');
  if (count[0]) {
    console.log(`当前记录数: ${count[0].values[0][0]}`);
  }

  console.log('\n下一步执行: npm run rebuild-summaries');
}

forceRebuild().then(() => process.exit(0));
