import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

const source = fs.readFileSync(
  'E:/codex/ae2/NeoNEI/backend/src/services/recipe-bootstrap.service.ts',
  'utf8',
).replace(/\r\n/g, '\n');

test('recipe bootstrap payloads attach render hints before serving materialized seed recipes', () => {
  assert.equal(
    source.includes('private attachRenderHints(payload: RecipeBootstrapPayload): RecipeBootstrapPayload'),
    true,
    'bootstrap service should expose a render-hint enrichment pass for materialized seed payloads',
  );
  assert.equal(
    source.includes('this.attachRenderHints(this.attachUiPayloads(toppedUp))'),
    true,
    'materialized bootstrap top-up path should enrich render hints before caching',
  );
  assert.equal(
    source.includes('this.attachRenderHints(this.attachUiPayloads(materialized))'),
    true,
    'seed-only bootstrap fallback should still enrich render hints before response',
  );
});
