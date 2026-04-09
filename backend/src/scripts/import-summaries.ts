// @ts-nocheck
import { getDatabaseManager } from '../models/database';
import * as fs from 'fs';
import * as readline from 'readline';
import { RECIPE_SUMMARIES_FILE } from './script-config';

async function importSummaries() {
  console.log('Importing recipe summaries from CSV...\n');

  const dbManager = getDatabaseManager();
  await dbManager.init();
  const db = dbManager.getDatabase();

  const csvPath = RECIPE_SUMMARIES_FILE;
  const fileStream = fs.createReadStream(csvPath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let lineNumber = 0;
  let count = 0;
  const batchSize = 5000;
  const summaries: unknown[] = [];

  const escape = (str: unknown): string => {
    if (str === null || str === undefined) return '';
    const stringVal = String(str);
    return stringVal.replace(/'/g, "''").replace(/\\/g, '\\\\');
  };

  for await (const line of rl) {
    lineNumber++;

    if (lineNumber === 1) {
      // Skip header
      continue;
    }

    // Parse CSV line (handling quoted fields with commas)
    const matches = line.match(/(".*?"|[^,]+)/g);
    if (!matches || matches.length < 4) continue;

    const recipeId = matches[0].replace(/^"|"$/g, '').replace(/""/g, '"');
    const recipeType = matches[1].replace(/^"|"$/g, '').replace(/""/g, '"');
    const inputIds = matches[2].replace(/^"|"$/g, '').replace(/""/g, '"');
    const outputIds = matches[3].replace(/^"|"$/g, '').replace(/""/g, '"');

    summaries.push({
      id: recipeId,
      type: recipeType,
      inputItemIds: inputIds,
      outputItemIds: outputIds
    });

    count++;

    if (summaries.length >= batchSize) {
      db.run('BEGIN TRANSACTION');
      for (const summary of summaries) {
        const sql = `
          INSERT OR REPLACE INTO recipe_summaries (
            recipe_id, recipe_type, input_item_ids, output_item_ids
          ) VALUES (
            '${escape(summary.id)}',
            '${escape(summary.type)}',
            '${escape(summary.inputItemIds)}',
            '${escape(summary.outputItemIds)}'
          )
        `;
        db.run(sql);
      }
      db.run('COMMIT');

      console.log(`  Processed ${count} summaries...`);
      summaries.length = 0;
    }
  }

  // Insert remaining
  if (summaries.length > 0) {
    db.run('BEGIN TRANSACTION');
    for (const summary of summaries) {
      const sql = `
        INSERT OR REPLACE INTO recipe_summaries (
          recipe_id, recipe_type, input_item_ids, output_item_ids
        ) VALUES (
          '${escape(summary.id)}',
          '${escape(summary.type)}',
          '${escape(summary.inputItemIds)}',
          '${escape(summary.outputItemIds)}'
        )
      `;
      db.run(sql);
    }
    db.run('COMMIT');
  }

  dbManager.save();

  console.log(`\n[OK]Imported ${count} recipe summaries to database`);
  process.exit(0);
}

importSummaries().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});


