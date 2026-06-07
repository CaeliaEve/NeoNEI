import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workerSource = fs.readFileSync('src/workers/nativeSurfaceEngine.worker.ts', 'utf8');

test('native surface worker keeps expanded groups on the runtime projection path', () => {
  assert.equal(
    workerSource.includes('&& surface.expandedGroups.length === 0'),
    false,
    'expanded groups must not force the native browser surface back to compat entries',
  );
  assert.equal(
    workerSource.includes('parseNativeGroupPack'),
    true,
    'worker should parse groups.bin instead of relying on Vue/compat group projection',
  );
  assert.equal(
    workerSource.includes('emittedCollapsedGroups'),
    true,
    'collapsed groups should be deduplicated before page layout',
  );
});

test('native surface worker projects before paginating collapsed groups', () => {
  const buildRuntimeEntries = workerSource.match(
    /function buildRuntimeEntries\(surface: SurfaceState\): NativeSurfaceEngineEntry\[\] \{[\s\S]*?\n\}/,
  )?.[0] ?? '';

  assert.equal(
    buildRuntimeEntries.includes('const projected: NativeSurfaceEngineEntry[] = []'),
    true,
    'runtime entries should first build a full projected group-aware list',
  );
  assert.equal(
    buildRuntimeEntries.includes('projected.slice(start, start + pageSize)'),
    true,
    'pagination should run after native group collapse/expand projection',
  );
});
