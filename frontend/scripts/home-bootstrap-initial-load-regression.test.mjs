import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

const source = fs.readFileSync(
  'E:/codex/ae2/NeoNEI/frontend/src/composables/useItemBrowser.ts',
  'utf8',
);

test('initial homepage load can use a single home-bootstrap payload for first-page cold starts', () => {
  assert.equal(
    source.includes('const measuredCapacity = allowMeasuredPageCapacity'),
    true,
    'initial page-size calculation should stay on the heuristic path until the first home bootstrap finishes',
  );
  assert.equal(
    source.includes('api.getHomeBootstrap({'),
    true,
    'item browser should use the home bootstrap endpoint on eligible cold-start first-page loads',
  );
  assert.equal(
    source.includes('applyHomeBootstrapResponse'),
    true,
    'home bootstrap responses should be normalized into the same page cache path as regular browser page packs',
  );
  assert.equal(
    source.includes('isHomeBootstrapEligible'),
    true,
    'home bootstrap should remain constrained to the simple first-page no-search state to avoid incorrect expanded/search hydration',
  );
  assert.equal(
    source.includes('await loadInitialHomeState();\n    allowMeasuredPageCapacity = true;'),
    true,
    'measured grid capacity should only be enabled after the initial homepage payload has settled',
  );
});
