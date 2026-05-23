import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const backendAtlasSource = fs.readFileSync('backend/src/services/browser-atlas-index.service.ts', 'utf8');
const frontendApiSource = fs.readFileSync('frontend/src/services/api.ts', 'utf8');

test('browser atlas index reports layout coverage against the exported NEI layout', () => {
  assert.match(
    backendAtlasSource,
    /NESQL_BROWSER_LAYOUT_INDEX_FILE/,
    'backend atlas index should read the exported browser layout index',
  );
  assert.match(
    backendAtlasSource,
    /interface BrowserAtlasLayoutCoverage/,
    'backend atlas index should expose a typed layout coverage summary',
  );
  assert.match(
    backendAtlasSource,
    /computeLayoutCoverage\(itemMap:\s*Map<string,\s*BrowserAtlasItemEntry>\)/,
    'backend should compute atlas coverage from the full item map including aliases and auxiliary entries',
  );
  assert.match(
    backendAtlasSource,
    /missingLayoutItemCount:\s*layoutItemIds\.size - coveredLayoutItemCount/,
    'coverage should count layout-visible items that still lack a drawable atlas entry',
  );
  assert.match(
    backendAtlasSource,
    /missingLayoutItemIds\.length < 100/,
    'coverage should include a bounded sample of missing item ids for export repair',
  );
});

test('frontend atlas manifest type accepts layout coverage counters', () => {
  assert.match(
    frontendApiSource,
    /layoutCoverage\?:\s*\{/,
    'frontend should accept browser atlas layout coverage in the atlas index response',
  );
  assert.match(
    frontendApiSource,
    /missingLayoutItemCount:\s*number/,
    'frontend should understand the missing layout item count',
  );
});
