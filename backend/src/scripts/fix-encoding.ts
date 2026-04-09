// @ts-nocheck
import { getDatabaseManager } from '../models/database';

// Fix encoding issue: Latin-1/Windows-1252 to UTF-8
// The text was corrupted when exported from NESQL
function fixEncoding(text: string | null): string | null {
  if (!text) return null;

  try {
    // Convert the corrupted text back to proper UTF-8
    // The issue: UTF-8 bytes were interpreted as Latin-1
    // Solution: Re-interpret as Latin-1, then decode as UTF-8
    const buffer = Buffer.from(text, 'latin1');
    return buffer.toString('utf8');
  } catch (error) {
    console.error('Error fixing encoding:', error);
    return text; // Return original if fix fails
  }
}

async function fixDatabaseEncoding() {
  console.log('[FIX] Fixing character encoding in database...');

  const dbManager = getDatabaseManager();
  await dbManager.init();
  const db = dbManager.getDatabase();

  // Query all items that need fixing
  const results = db.exec(`
    SELECT item_id, localized_name, tooltip
    FROM items
  `);

  if (results.length === 0) {
    console.log('[ERR]No items found');
    process.exit(1);
  }

  const items = results[0].values;
  console.log(`[INFO] Found ${items.length} items to check`);

  let fixedCount = 0;

  // Start transaction
  db.run('BEGIN TRANSACTION');

  try {
    for (const item of items) {
      const itemId = String(item[0]);
      const localizedName = String(item[1]);
      const tooltip = item[2] ? String(item[2]) : null;

      // Fix encoding
      const fixedLocalizedName = fixEncoding(localizedName);
      const fixedTooltip = fixEncoding(tooltip);

      // Check if anything changed
      const needsUpdate = fixedLocalizedName !== localizedName || fixedTooltip !== tooltip;

      if (needsUpdate) {
        // Use parameterized query to handle special characters
        const params: unknown[] = [];
        let sql = 'UPDATE items SET localized_name = ?';

        params.push(fixedLocalizedName || '');

        if (fixedTooltip) {
          sql += ', tooltip = ?';
          params.push(fixedTooltip);
        } else {
          sql += ', tooltip = NULL';
        }

        sql += ' WHERE item_id = ?';
        params.push(itemId);

        db.run(sql, params);

        fixedCount++;

        if (fixedCount % 10000 === 0) {
          console.log(`  Fixed ${fixedCount} items...`);
        }
      }
    }

    db.run('COMMIT');

    console.log(`\n[OK]Fixed encoding for ${fixedCount} items`);
    console.log(`鈩癸笍  Skipped ${items.length - fixedCount} items (no changes needed)`);

    // Save database
    dbManager.save();

    // Show examples
    console.log('\n[SAMPLE] Examples of fixed text:');
    const examples = db.exec(`
      SELECT localized_name, tooltip
      FROM items
      WHERE tooltip IS NOT NULL
      LIMIT 5
    `);

    if (examples.length > 0) {
      for (const row of examples[0].values) {
        console.log(`  - ${row[0]}`);
        const tooltip = row[1] as string;
        if (tooltip) {
          const lines = tooltip.split('\n').slice(0, 2);
          for (const line of lines) {
            console.log(`    ${line}`);
          }
        }
      }
    }

    process.exit(0);
  } catch (error) {
    db.run('ROLLBACK');
    console.error('[ERR]Error:', error);
    process.exit(1);
  }
}

fixDatabaseEncoding();



