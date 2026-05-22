import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (relativePath) => readFileSync(resolve(root, relativePath), 'utf8');

const database = read('src/models/database.ts');
const compiler = read('src/services/neonei-compiler.service.ts');
const search = read('src/services/items-search.service.ts');

const checks = [
  {
    name: 'database declares FTS5 item search table',
    pass: database.includes('CREATE VIRTUAL TABLE IF NOT EXISTS items_search_fts USING fts5')
      && database.includes('mod_id,')
      && database.includes("DROP TABLE items_search_fts"),
  },
  {
    name: 'compiler resets and populates FTS search rows',
    pass: compiler.includes("DELETE FROM items_search_fts")
      && compiler.includes('const insertItemSearchFts = db.prepare')
      && compiler.includes('insertItemSearchFts.run')
      && compiler.includes('search_terms: normalizeLooseText(record.searchTerms'),
  },
  {
    name: 'search service prefers FTS and keeps LIKE fallback',
    pass: search.includes('items_search_fts MATCH @ftsQuery')
      && search.includes('bm25(items_search_fts)')
      && search.includes('function toFtsPrefixQuery')
      && search.includes('s.localized_name_norm LIKE @contains'),
  },
];

const failed = checks.filter((check) => !check.pass);
if (failed.length > 0) {
  for (const check of failed) {
    console.error(`FAIL ${check.name}`);
  }
  process.exit(1);
}

for (const check of checks) {
  console.log(`PASS ${check.name}`);
}