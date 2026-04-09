// @ts-nocheck
import { getDatabaseManager } from '../models/database';

async function optimizeIndexes() {
  console.log('=== Optimizing Database Indexes ===\n');

  const dbManager = getDatabaseManager();
  await dbManager.init();
  const db = dbManager.getDatabase();

  const optimizations: { name: string; sql: string; description: string }[] = [
    {
      name: 'idx_items_search_terms',
      sql: "CREATE INDEX IF NOT EXISTS idx_items_search_terms ON items(searchTerms)",
      description: 'Index for faster item search by search terms'
    },
    {
      name: 'idx_items_tooltip',
      sql: "CREATE INDEX IF NOT EXISTS idx_items_tooltip ON items(tooltip)",
      description: 'Index for faster item search by tooltip'
    },
    {
      name: 'idx_recipes_id',
      sql: "CREATE INDEX IF NOT EXISTS idx_recipes_id ON recipes(recipe_id)",
      description: 'Index for fast recipe lookup by ID'
    },
    {
      name: 'idx_recipes_type_id',
      sql: "CREATE INDEX IF NOT EXISTS idx_recipes_type_id ON recipes(recipe_type, recipe_id)",
      description: 'Composite index for recipe type + ID queries'
    },
    {
      name: 'idx_recipe_summaries_id',
      sql: "CREATE INDEX IF NOT EXISTS idx_recipe_summaries_id ON recipe_summaries(recipe_id)",
      description: 'Index for fast recipe summary lookup'
    },
    {
      name: 'idx_recipe_summaries_type',
      sql: "CREATE INDEX IF NOT EXISTS idx_recipe_summaries_type ON recipe_summaries(recipe_type)",
      description: 'Index for filtering summaries by type'
    },
    {
      name: 'idx_recipe_summaries_output_items',
      sql: "CREATE INDEX IF NOT EXISTS idx_recipe_summaries_output_items ON recipe_summaries(output_item_ids)",
      description: 'Index for finding recipes by output items'
    },
    {
      name: 'idx_item_recipe_index_used',
      sql: "CREATE INDEX IF NOT EXISTS idx_item_recipe_index_used ON item_recipe_index(used_in_recipes)",
      description: 'Index for finding what items are used in recipes'
    },
    {
      name: 'idx_item_recipe_index_produced',
      sql: "CREATE INDEX IF NOT EXISTS idx_item_recipe_index_produced ON item_recipe_index(produced_by_recipes)",
      description: 'Index for finding what items are produced by recipes'
    },
    {
      name: 'idx_patterns_output_item',
      sql: "CREATE INDEX IF NOT EXISTS idx_patterns_output_item ON patterns(output_item_id)",
      description: 'Index for finding patterns by output item'
    },
    {
      name: 'idx_patterns_enabled',
      sql: "CREATE INDEX IF NOT EXISTS idx_patterns_enabled ON patterns(enabled)",
      description: 'Index for filtering enabled patterns'
    },
    {
      name: 'idx_patterns_priority',
      sql: "CREATE INDEX IF NOT EXISTS idx_patterns_priority ON patterns(priority DESC)",
      description: 'Index for sorting patterns by priority'
    }
  ];

  console.log(`Planning to add ${optimizations.length} indexes...\n`);

  let created = 0;
  let skipped = 0;
  let failed = 0;

  optimizations.forEach((opt, index) => {
    console.log(`${index + 1}. ${opt.name}`);
    console.log(`   ${opt.description}`);

    try {
      db.run(opt.sql);
      console.log(`   [OK] Created or already exists\n`);
      created++;
    } catch (error: unknown) {
      console.log(`   [SKIPPED] ${error.message}\n`);
      skipped++;
    }
  });

  // Also optimize the database (ANALYZE)
  console.log('Running ANALYZE to update query planner statistics...');
  try {
    db.run('ANALYZE');
    console.log('[OK] Database analyzed\n');
  } catch (error: unknown) {
    console.log(`[WARN] Analyze failed: ${error.message}\n`);
  }

  // Save changes
  console.log('Saving database...');
  dbManager.save();
  console.log('[OK] Database saved\n');

  // Summary
  console.log('=== Summary ===');
  console.log(`Created/Verified: ${created}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Failed: ${failed}`);
  console.log('\n=== Optimization Complete ===');
}

optimizeIndexes().catch(console.error);

