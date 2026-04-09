// @ts-nocheck
import { getDatabaseManager } from '../models/database';

// Clean up corrupted text by removing U+FFFD replacement characters
function cleanText(text: string | null): string | null {
  if (!text) return null;

  try {
    // If the text has replacement characters, try to extract the readable parts
    const replacementChar = '\uFFFD';

    if (!text.includes(replacementChar)) {
      return text; // No corruption
    }

    // Remove the replacement characters
    let cleaned = text.replace(new RegExp(replacementChar, 'g'), '');

    // Clean up extra whitespace
    cleaned = cleaned.replace(/\s+/g, ' ').trim();

    // If the result is empty or too short, return null
    if (!cleaned || cleaned.length < 2) {
      return null;
    }

    return cleaned;
  } catch (error) {
    console.error('Error cleaning text:', error);
    return text; // Return original if cleanup fails
  }
}

async function cleanDatabaseNames() {
  console.log('[CLEAN] Cleaning corrupted localized names...');

  const dbManager = getDatabaseManager();
  await dbManager.init();
  const db = dbManager.getDatabase();

  // Query all items
  const results = db.exec(`
    SELECT item_id, localized_name
    FROM items
  `);

  if (results.length === 0) {
    console.log('[ERR]No items found');
    process.exit(1);
  }

  const items = results[0].values;
  console.log(`[INFO] Found ${items.length} items`);

  let cleanedCount = 0;

  // Start transaction
  db.run('BEGIN TRANSACTION');

  try {
    for (const item of items) {
      const itemId = String(item[0]);
      const localizedName = String(item[1]);

      // Clean name
      const cleanedName = cleanText(localizedName);

      // Check if anything changed
      if (cleanedName !== localizedName) {
        const params: unknown[] = [cleanedName || localizedName, itemId];

        db.run(`
          UPDATE items
          SET localized_name = ?
          WHERE item_id = ?
        `, params);

        cleanedCount++;

        if (cleanedCount % 10000 === 0) {
          console.log(`  Cleaned ${cleanedCount} names...`);
        }
      }
    }

    db.run('COMMIT');

    console.log(`\n[OK]Cleaned ${cleanedCount} item names`);
    console.log(`鈩癸笍  Skipped ${items.length - cleanedCount} names (already clean)`);

    // Save database
    dbManager.save();

    process.exit(0);
  } catch (error) {
    db.run('ROLLBACK');
    console.error('[ERR]Error:', error);
    process.exit(1);
  }
}

cleanDatabaseNames();



