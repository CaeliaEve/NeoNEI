// @ts-nocheck
import { getDatabaseManager } from '../models/database';
import { DB_FILE } from './script-config';

async function initDatabase() {
  console.log('[START] Initializing database...');

  try {
    const dbManager = getDatabaseManager();
    await dbManager.init();

    console.log('[OK] Database initialized successfully!');
    console.log(`[INFO] Database location: ${DB_FILE}`);

    process.exit(0);
  } catch (error) {
    console.error('[ERR] Error initializing database:', error);
    process.exit(1);
  }
}

initDatabase();

