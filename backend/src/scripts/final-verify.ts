// @ts-nocheck
import { getDatabaseManager } from '../models/database';

async function finalVerify() {
  const dbManager = getDatabaseManager();
  await dbManager.init();
  const db = dbManager.getDatabase();

  console.log('=== 最终验证 ===\n');

  const sample = db.exec(`
    SELECT recipe_id, input_item_ids, output_item_ids
    FROM recipe_summaries
    LIMIT 5
  `);

  if (sample[0]) {
    sample[0].values.forEach((row: unknown[], i: number) => {
      console.log(`配方 ${i + 1}: ${row[0]}`);
      console.log(`  输入(完整): "${row[1]}"`);
      console.log(`  输入长度: ${row[1] ? row[1].length : 0}`);
      console.log(`  输出(完整): "${row[2]}"`);
      console.log(`  输出长度: ${row[2] ? row[2].length : 0}`);

      if (row[1]) {
        try {
          const parsed = JSON.parse(row[1]);
          console.log(`  输入解析: 成功 (${parsed.length} 个条目)`);
        } catch (e) {
          console.log(`  输入解析: 失败 ${(e as Error).message}`);
        }
      }
      console.log('');
    });
  }

  console.log('=== 输入长度分布 ===\n');
  const stats = db.exec(`
    SELECT length(input_item_ids) as len, COUNT(*) as count
    FROM recipe_summaries
    GROUP BY length(input_item_ids)
    ORDER BY len DESC
    LIMIT 10
  `);

  if (stats[0]) {
    stats[0].values.forEach((row: unknown[]) => {
      console.log(`  长度 ${row[0]}: ${row[1]} 个配方`);
    });
  }

  console.log('\n=== 有实际输入数据的配方 ===\n');
  const withData = db.exec(`
    SELECT COUNT(*) FROM recipe_summaries
    WHERE length(input_item_ids) > 10
  `);

  if (withData[0]) {
    console.log(`  结果: ${withData[0].values[0][0]} 个`);
  }
}

finalVerify().then(() => process.exit(0));
