// @ts-nocheck
import { getDatabaseManager } from '../models/database';

async function analyzeIndexes() {
  console.log('=== Analyzing Database Indexes ===\n');

  const dbManager = getDatabaseManager();
  await dbManager.init();
  const db = dbManager.getDatabase();

  // Get all indexes
  console.log('1. Current indexes in database:');
  const result = db.exec("SELECT name, tbl_name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%' ORDER BY tbl_name, name");

  if (result.length > 0) {
    console.log('Table | Index Name');
    console.log('------|----------');
    result[0].values.forEach((row: unknown) => {
      console.log(`${row[1]} | ${row[0]}`);
    });
  } else {
    console.log('   No custom indexes found');
  }

  // Check table sizes
  console.log('\n2. Table record counts:');
  const tables = ['items', 'recipes', 'recipe_summaries', 'item_recipe_index', 'mods', 'patterns', 'pattern_groups'];

  tables.forEach(table => {
    try {
      const countResult = db.exec(`SELECT COUNT(*) FROM ${table}`);
      if (countResult.length > 0) {
        const count = countResult[0].values[0][0];
        console.log(`   ${table}: ${count}`);
      }
    } catch (e) {
      console.log(`   ${table}: (table doesn't exist)`);
    }
  });

  // Analyze query patterns (check most common queries)
  console.log('\n3. Query analysis:');
  console.log('   Most queries are likely on:');
  console.log('   - items.item_id (primary lookups)');
  console.log('   - items.localized_name (search)');
  console.log('   - item_recipe_index.item_id (recipe lookups)');
  console.log('   - recipes.recipe_id (recipe details)');

  console.log('\n=== Analysis Complete ===');
}

analyzeIndexes().catch(console.error);

