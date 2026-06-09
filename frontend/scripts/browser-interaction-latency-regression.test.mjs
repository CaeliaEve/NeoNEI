import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(__dirname, '..');
const source = readFileSync(resolve(frontendRoot, 'src/composables/useItemBrowser.ts'), 'utf8').replace(/\r\n/g, '\n');
const schedulerSource = readFileSync(resolve(frontendRoot, 'src/composables/browser/browserInteractionScheduler.ts'), 'utf8').replace(/\r\n/g, '\n');

test('homepage search and paging commits within one frame instead of legacy debounce delay', () => {
  assert.match(schedulerSource, /export const INTERACTION_COMMIT_DELAY_MS = 16/);
  assert.match(source, /interactionScheduler\.scheduleSearchCommit\(\(\) => \{\n\s+void loadItems\(\);\n\s+\}\)/);
  assert.match(source, /interactionScheduler\.schedulePageHydration\(\(\) => \{\n\s+void loadItems\(\);\n\s+\}\)/);
  assert.match(source, /interactionScheduler\.clear\(\)/);
  assert.doesNotMatch(source, /\}, 120\);/);
});
