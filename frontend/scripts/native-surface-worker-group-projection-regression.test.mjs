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
  assert.equal(
    workerSource.includes('neonei_engine_compact_browser_project_visible_indices'),
    true,
    'group-aware projection should be delegated to the WASM engine when available',
  );
  assert.equal(
    workerSource.includes('runtimeVisibleCacheKey'),
    true,
    'query/mod/group projection should be cached on the native runtime path',
  );
});

test('native surface worker paginates projection indices without rebuilding all entries', () => {
  const buildRuntimeEntries = workerSource.match(
    /function buildRuntimeEntries\(surface: SurfaceState\): NativeSurfaceEngineEntry\[\] \{[\s\S]*?\n\}/,
  )?.[0] ?? '';

  assert.equal(
    buildRuntimeEntries.includes('const projectionIndices = getRuntimeVisibleEntries(surface, browserPack)'),
    true,
    'runtime entries should consume native projection indices',
  );
  assert.equal(
    buildRuntimeEntries.includes('const start = Math.min(projectionIndices.length, (page - 1) * pageSize)'),
    true,
    'pagination should compute the active projection window before materializing entries',
  );
  assert.equal(
    buildRuntimeEntries.includes('for (let projectionIndex = start; projectionIndex < end; projectionIndex += 1)'),
    true,
    'runtime entries should only materialize the active page window',
  );
  assert.equal(
    buildRuntimeEntries.includes('projected.slice(start, start + pageSize)'),
    false,
    'runtime entries must not build a full entry array and slice it after the fact',
  );
});
