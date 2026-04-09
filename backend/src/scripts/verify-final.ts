// @ts-nocheck
import { getDatabaseManager } from '../models/database';

async function verifyFinal() {
  const dbManager = getDatabaseManager();
  await dbManager.init();
  const db = dbManager.getDatabase();

  console.log('=== 验证 recipe_summaries 数据 ===\n');

  const countResult = db.exec('SELECT COUNT(*) FROM recipe_summaries');
  if (countResult[0]) {
    console.log(`总记录数: ${countResult[0].values[0][0]}\n`);
  }

  const inputResult = db.exec(`
    SELECT COUNT(*) FROM recipe_summaries
    WHERE input_item_ids IS NOT NULL
      AND input_item_ids != '[]'
      AND input_item_ids != ''
  `);
  if (inputResult[0]) {
    console.log(`有输入数据的配方: ${inputResult[0].values[0][0]}\n`);
  }

  console.log('=== 抽样检查前10个配方 ===\n');
  const sample = db.exec(`
    SELECT recipe_id, recipe_type,
           substr(input_item_ids, 1, 80) as input_preview,
           substr(output_item_ids, 1, 80) as output_preview
    FROM recipe_summaries
    LIMIT 10
  `);

  if (sample[0]) {
    sample[0].values.forEach((row: unknown[], i: number) => {
      console.log(`配方 ${i + 1}`);
      console.log(`  ID: ${row[0]}`);
      console.log(`  类型: ${row[1]}`);
      console.log(`  输入预览: ${row[2]}...`);
      console.log(`  输出预览: ${row[3]}...`);
      console.log('');
    });
  }

  console.log('=== 抽查化学浸洗机(ULV) ===\n');
  const specific = db.exec(`
    SELECT recipe_id, recipe_type, input_item_ids, output_item_ids
    FROM recipe_summaries
    WHERE recipe_type = 'gregtech - 化学浸洗机 (ULV)'
    LIMIT 3
  `);

  if (specific[0]) {
    specific[0].values.forEach((row: unknown[], i: number) => {
      console.log(`配方 ${i + 1}`);
      console.log(`  ID: ${row[0]}`);
      console.log(`  类型: ${row[1]}`);
      console.log(`  输入: ${row[2]}`);
      console.log(`  输出: ${row[3]}`);
      console.log('');
    });
  }

  console.log('验证完成。');
}

verifyFinal().then(() => process.exit(0));
