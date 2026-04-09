// @ts-nocheck
import { getDatabaseManager } from '../models/database';

async function verifySummaries() {
  const dbManager = getDatabaseManager();
  await dbManager.init();
  const db = dbManager.getDatabase();

  const totalResult = db.exec('SELECT COUNT(*) FROM recipe_summaries');
  const total = Number(totalResult[0]?.values?.[0]?.[0] ?? 0);
  console.log(`recipe_summaries rows: ${total}`);

  const sampleResult = db.exec(`
    SELECT recipe_id, recipe_type, input_item_ids, output_item_ids
    FROM recipe_summaries
    LIMIT 5
  `);

  if (!sampleResult[0]) {
    console.log('No sample rows available.');
    return;
  }

  for (const row of sampleResult[0].values) {
    const recipeId = String(row[0] ?? '');
    const recipeType = String(row[1] ?? '');
    const inputItemIds = String(row[2] ?? '');
    const outputItemIds = String(row[3] ?? '');
    console.log(
      `${recipeId} | ${recipeType} | in=${inputItemIds.slice(0, 40)} | out=${outputItemIds.slice(0, 40)}`
    );
  }
}

verifySummaries()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Verification failed:', err);
    process.exit(1);
  });
