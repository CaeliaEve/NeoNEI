// @ts-nocheck
import { getDatabaseManager } from '../models/database';

async function fixSchema() {
  console.log('Checking database schema...');
  const dbManager = getDatabaseManager();
  await dbManager.init();
  const db = dbManager.getDatabase();

  const result = db.exec('PRAGMA table_info(recipes)');
  console.log('Current recipes table schema:');

  if (result.length > 0) {
    const columns = result[0].values;
    columns.forEach((row: unknown[]) => {
      console.log(`  ${row[1]} (${row[2]})`);
    });

    // Check for additional_data column
    const hasAdditionalData = columns.some((row: unknown[]) => row[1] === 'additional_data');
    const hasRecipeTypeData = columns.some((row: unknown[]) => row[1] === 'recipe_type_data');

    if (!hasAdditionalData) {
      console.log('Adding additional_data column...');
      db.run('ALTER TABLE recipes ADD COLUMN additional_data TEXT');
    }

    if (!hasRecipeTypeData) {
      console.log('Adding recipe_type_data column...');
      db.run('ALTER TABLE recipes ADD COLUMN recipe_type_data TEXT');
    }

    dbManager.save();
    console.log('[OK]Schema fixed!');
  } else {
    console.log('[ERR]No schema found');
  }
}

fixSchema()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error:', err);
    process.exit(1);
  });



