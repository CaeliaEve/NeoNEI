// @ts-nocheck
import { getDatabaseManager } from '../models/database';

async function testInsert() {
  const dbManager = getDatabaseManager();
  await dbManager.init();
  const db = dbManager.getDatabase();

  console.log('=== Test Insert Data ===\n');

  // Clear test table if it exists.
  db.run('DROP TABLE IF EXISTS test_insert');

  // Create test table.
  db.run(`
    CREATE TABLE test_insert (
      id TEXT PRIMARY KEY,
      test_field TEXT
    )
  `);

  // Insert test rows.
  const testData = [
    { id: '1', value: '[]' },
    { id: '2', value: JSON.stringify([]) },
    { id: '3', value: JSON.stringify(['i~test~item~0']) },
    { id: '4', value: JSON.stringify(['i~test~item~0', 'i~test~item~1']) }
  ];

  const escape = (str: unknown): string => {
    if (str === null || str === undefined) return '';
    return String(str).replace(/'/g, "''").replace(/\\/g, '\\\\');
  };

  db.run('BEGIN TRANSACTION');
  try {
    for (const test of testData) {
      const sql = `
        INSERT INTO test_insert (id, test_field)
        VALUES ('${test.id}', '${escape(test.value)}')
      `;
      console.log(`SQL: ${sql}`);
      db.run(sql);
    }
    db.run('COMMIT');
  } catch (error) {
    db.run('ROLLBACK');
    console.error('Insert failed:', error);
    process.exit(1);
  }

  // Validate inserted rows.
  const result = db.exec('SELECT * FROM test_insert');
  if (result[0]) {
    console.log('\n=== Inserted Data ===\n');
    result[0].values.forEach((row: unknown[]) => {
      console.log(`ID: ${row[0]}, Value: "${row[1]}", Length: ${row[1].length}`);
    });
  }

  console.log('\n[OK] Test complete');
}

testInsert().then(() => process.exit(0));


