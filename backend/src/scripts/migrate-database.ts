// @ts-nocheck
import { getDatabaseManager } from '../models/database';

async function migrateDatabase() {
  console.log('[MIGRATE] Starting database migration...');

  const dbManager = getDatabaseManager();
  await dbManager.init();
  const db = dbManager.getDatabase();

  try {
    // Check if crafting column exists
    const craftingCheck = db.exec(`
      PRAGMA table_info(patterns)
    `);

    const hasCrafting = craftingCheck[0]?.values.some((row: unknown[]) => row[1] === 'crafting');

    if (!hasCrafting) {
      console.log('[MIGRATE] Adding crafting column...');
      db.run(`ALTER TABLE patterns ADD COLUMN crafting INTEGER DEFAULT 1`);
    }

    // Check if substitute column exists
    const substituteCheck = db.exec(`
      PRAGMA table_info(patterns)
    `);

    const hasSubstitute = substituteCheck[0]?.values.some((row: unknown[]) => row[1] === 'substitute');

    if (!hasSubstitute) {
      console.log('[MIGRATE] Adding substitute column...');
      db.run(`ALTER TABLE patterns ADD COLUMN substitute INTEGER DEFAULT 0`);
    }

    const beSubstituteCheck = db.exec(`
      PRAGMA table_info(patterns)
    `);

    const hasBeSubstitute = beSubstituteCheck[0]?.values.some((row: unknown[]) => row[1] === 'be_substitute');

    if (!hasBeSubstitute) {
      console.log('[MIGRATE] Adding be_substitute column...');
      db.run(`ALTER TABLE patterns ADD COLUMN be_substitute INTEGER DEFAULT 0`);
    }

    // Save changes
    dbManager.save();
    console.log('[OK] Database migration completed.');
  } catch (error) {
    console.error('[ERR] Migration failed:', error);
    process.exit(1);
  }
}

migrateDatabase()
  .then(() => {
    console.log('[OK] Migration finished successfully.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('[ERR] Migration failed:', error);
    process.exit(1);
  });

