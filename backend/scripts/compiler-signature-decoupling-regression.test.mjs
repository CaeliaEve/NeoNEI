import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

const compilerSource = fs.readFileSync(
  'E:/codex/ae2/NeoNEI/backend/src/services/neonei-compiler.service.ts',
  'utf8',
).replace(/\r\n/g, '\n');

test('acceleration source signature ignores publish-only and atlas-only tuning knobs so UI hot-path tweaks do not force full db recompiles', () => {
  assert.equal(
    compilerSource.includes('bootstrap: this.options.bootstrap,'),
    true,
    'core bootstrap state should remain part of the acceleration signature',
  );
  assert.equal(
    compilerSource.includes('hotPageAtlas: this.options.hotPageAtlas,'),
    false,
    'hot atlas warmup options should not invalidate the acceleration database signature',
  );
  assert.equal(
    compilerSource.includes('publishHotPayloads: this.options.publishHotPayloads,'),
    false,
    'publish hot-payload options should not invalidate the acceleration database signature',
  );
});
