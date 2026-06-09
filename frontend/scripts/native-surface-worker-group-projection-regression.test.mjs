import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workerSource = fs.readFileSync('src/workers/nativeSurfaceEngine.worker.ts', 'utf8');
const wasmRuntimeSource = fs.readFileSync('src/workers/nativeSurfaceWasmRuntime.ts', 'utf8');
const nativeProjectionSource = `${workerSource}
${wasmRuntimeSource}`;
const nativeSurfaceSource = fs.readFileSync('src/components/native-surface/NativeBrowserSurface.vue', 'utf8');
const homeBrowserColumnSource = fs.readFileSync('src/components/home/HomeBrowserColumn.vue', 'utf8');
const homePageSource = fs.readFileSync('src/views/HomePage.vue', 'utf8');

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
    nativeProjectionSource.includes('neonei_engine_compact_browser_project_visible_indices'),
    true,
    'group-aware projection should be delegated through the WASM runtime when available',
  );
  assert.equal(
    nativeProjectionSource.includes('runtimeVisibleCacheKey'),
    true,
    'query/mod/group projection should be cached on the native runtime path',
  );
});

test('homepage passes expanded group state into the native browser surface', () => {
  assert.match(
    homePageSource,
    /expandedGroupKeys,/,
    'HomePage should expose the active expanded group keys from useItemBrowser',
  );
  assert.match(
    homeBrowserColumnSource,
    /expandedGroupKeys: string\[\]/,
    'HomeBrowserColumn should accept expanded group keys as a first-class prop',
  );
  assert.match(
    homeBrowserColumnSource,
    /:expanded-groups="expandedGroupKeys"/,
    'HomeBrowserColumn should pass expanded groups into the native surface',
  );
  assert.match(
    nativeSurfaceSource,
    /expandedGroups\?: string\[\]/,
    'NativeBrowserSurface should expose expanded groups to the GPU/native path',
  );
  assert.match(
    nativeSurfaceSource,
    /controller\.setExpandedGroups\(props\.expandedGroups\)/,
    'NativeBrowserSurface should synchronize expanded groups into the native worker controller',
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
