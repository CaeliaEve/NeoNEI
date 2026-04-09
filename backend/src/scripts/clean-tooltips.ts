// @ts-nocheck
import { getDatabaseManager } from '../models/database';

// Clean up corrupted tooltips by removing U+FFFD replacement characters
function cleanTooltip(text: string | null): string | null {
  if (!text) return null;

  try {
    // Remove lines that contain mostly corrupted characters
    const lines = text.split('\n');
    const cleanedLines = lines.filter(line => {
      // Count replacement characters (U+FFFD)
      const replacementCount = (line.match(/\uFFFD/g) || []).length;
      // If more than 20% of the line is replacement characters, remove it
      const ratio = replacementCount / line.length;
      return ratio < 0.2 && line.trim().length > 0;
    });

    return cleanedLines.join('\n') || null;
  } catch (error) {
    console.error('Error cleaning tooltip:', error);
    return text; // Return original if cleanup fails
  }
}

async function cleanDatabaseTooltips() {
  console.log('[CLEAN] Cleaning corrupted tooltips...');

  const dbManager = getDatabaseManager();
  await dbManager.init();
  const db = dbManager.getDatabase();

  // Query all items
  const results = db.exec(`
    SELECT item_id, tooltip
    FROM items
    WHERE tooltip IS NOT NULL
  `);

  if (results.length === 0) {
    console.log('[ERR]No items found with tooltips');
    process.exit(1);
  }

  const items = results[0].values;
  console.log(`[INFO] Found ${items.length} items with tooltips`);

  let cleanedCount = 0;

  // Start transaction
  db.run('BEGIN TRANSACTION');

  try {
    for (const item of items) {
      const itemId = String(item[0]);
      const tooltip = item[1] ? String(item[1]) : null;

      // Clean tooltip
      const cleanedTooltip = cleanTooltip(tooltip);

      // Check if anything changed
      if (cleanedTooltip !== tooltip) {
        const params: unknown[] = [cleanedTooltip || '', itemId];

        db.run(`
          UPDATE items
          SET tooltip = ?
          WHERE item_id = ?
        `, params);

        cleanedCount++;

        if (cleanedCount % 10000 === 0) {
          console.log(`  Cleaned ${cleanedCount} tooltips...`);
        }
      }
    }

    db.run('COMMIT');

    console.log(`\n[OK]Cleaned ${cleanedCount} tooltips`);
    console.log(`鈩癸笍  Skipped ${items.length - cleanedCount} tooltips (already clean)`);

    // Save database
    dbManager.save();

    // Show examples
    console.log('\n[SAMPLE] Examples of cleaned tooltips:');
    const examples = db.exec(`
      SELECT localized_name, tooltip
      FROM items
      WHERE tooltip IS NOT NULL
      LIMIT 10
    `);

    if (examples.length > 0) {
      for (const row of examples[0].values) {
        console.log(`\n  ${row[0]}:`);
        const tooltip = row[1] as string;
        if (tooltip) {
          const lines = tooltip.split('\n');
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

cleanDatabaseTooltips();



