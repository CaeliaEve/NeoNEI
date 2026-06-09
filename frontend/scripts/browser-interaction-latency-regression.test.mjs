import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(__dirname, '..');
const source = readFileSync(resolve(frontendRoot, 'src/composables/useItemBrowser.ts'), 'utf8').replace(/\r\n/g, '\n');

test('homepage search and paging commits within one frame instead of legacy debounce delay', () => {
  assert.match(source, /const INTERACTION_COMMIT_DELAY_MS = 16/);
  assert.match(source, /searchTimeout = setTimeout\(\(\) => \{\n\s+void loadItems\(\);\n\s+\}, INTERACTION_COMMIT_DELAY_MS\)/);
  assert.match(source, /deferredPageHydrationTimer = window\.setTimeout\(\(\) => \{\n\s+deferredPageHydrationTimer = null;\n\s+void loadItems\(\);\n\s+\}, INTERACTION_COMMIT_DELAY_MS\)/);
  assert.doesNotMatch(source, /\}, 120\);/);
});
