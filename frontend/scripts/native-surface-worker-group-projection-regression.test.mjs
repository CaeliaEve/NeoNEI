import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workerSource = fs.readFileSync('src/workers/nativeSurfaceEngine.worker.ts', 'utf8');
const wasmRuntimeSource = fs.readFileSync('src/workers/nativeSurfaceWasmRuntime.ts', 'utf8');
const nativeProjectionSource = `${workerSource}
${wasmRuntimeSource}`;
const rustBrowserSource = fs.readFileSync('../tools/neonei-wasm-engine/src/compact_browser.rs', 'utf8');
const rustLibSource = fs.readFileSync('../tools/neonei-wasm-engine/src/lib.rs', 'utf8');
const nativeSurfaceSource = fs.readFileSync('src/components/native-surface/NativeBrowserSurface.vue', 'utf8');
const homeBrowserColumnSource = fs.readFileSync('src/components/home/HomeBrowserColumn.vue', 'utf8');
const homePageSource = fs.readFileSync('src/views/HomePage.vue', 'utf8');
const itemBrowserSource = fs.readFileSync('src/composables/useItemBrowser.ts', 'utf8');

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
  assert.match(
    wasmRuntimeSource,
    /neonei_engine_compact_browser_project_visible_indices_with_groups/,
    'browser projection should use the Native/WASM group-pack ABI when groups.bin is loaded',
  );
  assert.match(
    wasmRuntimeSource,
    /neonei_engine_compact_search_project_visible_indices_with_groups/,
    'search projection should also use the Native/WASM group-pack ABI when groups.bin is loaded',
  );
  assert.equal(
    workerSource.includes('computeIndexedRuntimeVisibleEntries'),
    false,
    'search must not bypass the Native/WASM group-pack projection through the old TypeScript index path',
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

test('WASM browser projection expands group members in-place from groups.bin', () => {
  assert.match(
    rustLibSource,
    /neonei_engine_compact_browser_project_visible_indices_with_groups/,
    'WASM ABI should expose the browser+groups projection entrypoint',
  );
  assert.match(
    rustLibSource,
    /neonei_engine_compact_search_project_visible_indices_with_groups/,
    'WASM ABI should expose the search+groups projection entrypoint',
  );
  assert.match(
    rustBrowserSource,
    /compact_browser_project_visible_indices_with_groups/,
    'Rust projection should have a groups.bin-aware projection function',
  );
  assert.match(
    rustBrowserSource,
    /emit_group_members_at_anchor/,
    'expanded group members should be emitted at the clicked anchor position',
  );
  assert.match(
    rustBrowserSource,
    /build_browser_index_by_item_id/,
    'group member itemIds should be mapped back to browser rows natively',
  );
  assert.match(
    rustBrowserSource,
    /if !emitted_groups\.insert\(group_key\.to_owned\(\)\) \{[\s\S]*continue;/,
    'later raw rows for an already emitted group should not duplicate expanded members far away',
  );
});

test('homepage pagination uses native runtime projected totals as the browser source of truth', () => {
  assert.match(
    nativeSurfaceSource,
    /runtimeProjectionUpdate: \[metrics: NativeSurfaceFrameProjectionMetrics\]/,
    'NativeBrowserSurface should emit native projection metrics from frame results',
  );
  assert.match(
    nativeSurfaceSource,
    /emit\("runtimeProjectionUpdate", frame\.runtimeProjection\)/,
    'native frame metrics should be surfaced to Vue instead of leaving pagination on raw totals',
  );
  assert.match(
    homeBrowserColumnSource,
    /@runtime-projection-update="emit\('runtimeProjectionUpdate', \$event\)"/,
    'HomeBrowserColumn should forward native projected totals upward',
  );
  assert.match(
    homePageSource,
    /@runtime-projection-update="applyNativeProjectionPageMetrics"/,
    'HomePage should apply native projected page metrics to the visible paginator',
  );
  assert.match(
    itemBrowserSource,
    /const applyNativeProjectionPageMetrics = \(metrics: NativeSurfaceFrameProjectionMetrics\)/,
    'useItemBrowser should expose a native projection metrics sink',
  );
  assert.match(
    itemBrowserSource,
    /totalPages\.value = projectedTotalPages/,
    'visible total pages must be derived from the native collapsed-group projection',
  );
});
