import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(__dirname, "..");

function readSource(relativePath) {
  return readFileSync(resolve(frontendRoot, relativePath), "utf8");
}

test("NativeSurfaceController batches high-frequency surface mutations", () => {
  const source = readSource("src/native-surface/NativeSurfaceController.ts");
  assert.match(source, /pendingMutations\s*=\s*new Map/);
  assert.match(source, /requestAnimationFrame/);
  assert.match(source, /type:\s*"mutationBatch"/);
  assert.match(source, /await this\.flushMutationsNow\(\);\s*[\s\S]*type:\s*"frame"/);
  assert.match(source, /await this\.flushMutationsNow\(\);\s*[\s\S]*type:\s*"hitTest"/);

  for (const eventName of ["viewport", "page", "search", "modFilter", "expandedGroups", "historyItems", "itemSize"]) {
    assert.match(source, new RegExp(`this\\.queueMutation\\(\\{ type: "${eventName}"`));
  }
});

test("native surface worker applies one layout rebuild for a mutation batch", () => {
  const source = readSource("src/workers/nativeSurfaceEngine.worker.ts");
  const mutations = readSource("src/workers/nativeSurfaceWorkerMutations.ts");
  assert.match(mutations, /function applyNativeSurfaceMutation/);
  assert.match(source, /case "mutationBatch"/);
  assert.match(source, /for \(const mutation of message\.mutations\)/);
  assert.match(source, /if \(needsLayout\) rebuildLayout\(surface\)/);
});

test("native surface protocol exposes explicit mutation batch contract", () => {
  const source = readSource("src/native-surface/NativeSurfaceEngineProtocol.ts");
  assert.match(source, /type:\s*"mutationBatch"/);
  assert.match(source, /export type NativeSurfaceEngineMutation/);
  assert.match(source, /mutations:\s*NativeSurfaceEngineMutation\[\]/);
});

test("native surface runtime path removes compat entry projection input", () => {
  const controller = readSource("src/native-surface/NativeSurfaceController.ts");
  const controlPlane = readSource("src/native-surface/NativeRuntimeControlPlane.ts");
  const protocol = readSource("src/native-surface/NativeSurfaceEngineProtocol.ts");
  const worker = readSource("src/workers/nativeSurfaceEngine.worker.ts");
  const mutations = readSource("src/workers/nativeSurfaceWorkerMutations.ts");

  for (const source of [controller, controlPlane, protocol, worker, mutations]) {
    assert.doesNotMatch(source, /compatEntries/);
    assert.doesNotMatch(source, /compat-entries/);
    assert.doesNotMatch(source, /setCompatEntries/);
    assert.doesNotMatch(source, /shouldSendCompatEntriesToWorker/);
  }
  assert.match(worker, /return \{ source: "empty", entries: \[\] \}/);
});


test("native surface worker does not rebuild layout on every frame", () => {
  const source = readSource("src/workers/nativeSurfaceEngine.worker.ts");
  assert.doesNotMatch(
    source,
    /case "frame":\s*rebuildLayout\(surface\)/,
    "frame requests must reuse the latest mutation-built layout instead of rebuilding every animation frame",
  );
  assert.match(source, /case "mutationBatch"/);
  assert.match(source, /if \(needsLayout\) rebuildLayout\(surface\)/);
});

test("native runtime page projection only materializes the current page window", () => {
  const source = readSource("src/workers/nativeSurfaceEngine.worker.ts");
  assert.match(source, /const start = Math\.min\(projectionIndices\.length, \(page - 1\) \* pageSize\)/);
  assert.match(source, /const end = Math\.min\(projectionIndices\.length, start \+ pageSize\)/);
  assert.match(source, /for \(let projectionIndex = start; projectionIndex < end; projectionIndex \+= 1\)/);
  assert.doesNotMatch(
    source,
    /const projected: NativeSurfaceEngineEntry\[\] = \[\];[\s\S]*projectionIndices\.length[\s\S]*projected\.slice/,
    "page flips must not rebuild all projected entries before slicing the active page",
  );
});

test("homepage native browser surface receives search and mod filters for immediate worker projection", () => {
  const homeColumn = readSource("src/components/home/HomeBrowserColumn.vue");
  const nativeSurface = readSource("src/components/native-surface/NativeBrowserSurface.vue");
  const homePage = readSource("src/views/HomePage.vue");
  const browserComposable = readSource("src/composables/useItemBrowser.ts");

  assert.match(homePage, /:search-query="searchQuery"/);
  assert.match(homePage, /:selected-mod="selectedMod"/);
  assert.match(homeColumn, /searchQuery: string/);
  assert.match(homeColumn, /selectedMod: string/);
  assert.match(homeColumn, /:search-query="searchQuery"/);
  assert.match(homeColumn, /:mod-id="selectedMod"/);
  assert.match(nativeSurface, /controller\.setSearch\(props\.searchQuery \?\? ""\)/);
  assert.match(nativeSurface, /controller\.setModFilter\(props\.modId === "all" \? null : props\.modId \?\? null\)/);
  assert.match(browserComposable, /const onSearch = \(\) => \{\s*currentPage\.value = 1;\s*interactionScheduler\.scheduleSearchCommit/);
});


test("native surface metrics expose layout rebuilds separately from frame requests", () => {
  const protocol = readSource("src/native-surface/NativeSurfaceEngineProtocol.ts");
  const worker = readSource("src/workers/nativeSurfaceEngine.worker.ts");
  assert.match(protocol, /layoutRebuilds: number/);
  assert.match(protocol, /frameRequests: number/);
  assert.match(worker, /surface\.layoutRebuilds \+= 1/);
  assert.match(worker, /case "frame":\s*surface\.frameRequests \+= 1;[\s\S]*return \{/);
  assert.doesNotMatch(
    worker,
    /case "frame":(?:(?!case ).)*surface\.layoutRebuilds \+= 1;/s,
    "frame requests must never increment layout rebuild metrics",
  );
});


test("native surface baseline gates excessive layout rebuilds", () => {
  const source = readSource("../scripts/native-surface-baseline.mjs");
  assert.match(source, /maxLayoutRebuilds/);
  assert.match(source, /max-layout-rebuilds/);
  assert.match(source, /nativeLayoutRebuilds/);
  assert.match(source, /nativeFrameRequests/);
  assert.match(source, /rebuilt layout/);
});

test("native surface baseline measures in-browser click latency instead of Playwright actionability overhead", () => {
  const source = readSource("../scripts/native-surface-baseline.mjs");
  assert.match(source, /async function clickButtonByLabel/);
  assert.match(source, /return await page\.evaluate\(\(candidates\) =>/);
  assert.match(source, /button\.click\(\)/);
  assert.doesNotMatch(source, /await element\.click\(\)/);
});

test("native surface baseline waits for the final native frame before evaluating render metrics", () => {
  const source = readSource("../scripts/native-surface-baseline.mjs");
  assert.match(source, /__NEONEI_NATIVE_RENDER_METRICS__/);
  assert.match(source, /\(render\?\.frames \?\? 0\) > 0/);
  assert.match(source, /\(render\?\.drawCalls \?\? 0\) > 0/);
  assert.match(source, /\(render\?\.textureLoaded \?\? 0\) >= minimumTextures/);
  assert.match(source, /timeout: 1_200/);
});

test("native surface baseline forbids page-pack and scattered image hot paths", () => {
  const source = readSource("../scripts/native-surface-baseline.mjs");

  assert.match(source, /pagePackHotPathPattern/);
  assert.match(source, /scatteredImageHotPathPattern/);
  assert.match(source, /nativeAtlasAssetPattern/);
  assert.match(source, /images\\\/\(\?:item\|fluid\|aspect\)/);
  assert.match(source, /browser page-pack or scattered image hot-path request/);
  assert.match(source, /!nativeAtlasAssetPattern\.test\(requestUrl\)/);
});

test("browser page application does not trigger legacy catalog or group HTTP warmups", () => {
  const source = readSource("src/composables/useItemBrowser.ts");
  const applyStart = source.indexOf("const applyBrowserResponse = (");
  assert.notEqual(applyStart, -1);
  const applyEnd = source.indexOf("const markInitialHomeBootstrapDone", applyStart);
  assert.notEqual(applyEnd, -1);
  const applyBody = source.slice(applyStart, applyEnd);

  assert.doesNotMatch(applyBody, /getBrowserDefaultCatalog/);
  assert.doesNotMatch(applyBody, /getBrowserSearchCatalog/);
  assert.doesNotMatch(applyBody, /getBrowserGroupItems/);
  assert.doesNotMatch(applyBody, /prewarmBrowserDefaultCatalog/);
  assert.doesNotMatch(applyBody, /prewarmVisibleBrowserGroups/);
  assert.match(applyBody, /nativeBrowserRuntimeWarm\.scheduleWarm\(\)/);

  const warmSource = readSource("src/composables/browser/nativeBrowserRuntimeWarm.ts");
  const warmStart = warmSource.indexOf("export function createNativeBrowserRuntimeWarmManager");
  const warmEnd = warmSource.length;
  assert.notEqual(warmStart, -1);
  assert.notEqual(warmEnd, -1);
  const warmBody = warmSource.slice(warmStart, warmEnd);
  assert.doesNotMatch(warmBody, /getBrowserDefaultCatalog/);
  assert.doesNotMatch(warmBody, /getBrowserSearchCatalog/);
  assert.match(warmBody, /ensureGlobalBrowserAtlasIndex/);
  assert.match(warmBody, /ensureGlobalBrowserAtlasIndex\(\)/);
});

test("native surface baseline measures actual native search projection latency", () => {
  const baseline = readSource("../scripts/native-surface-baseline.mjs");
  const protocol = readSource("src/native-surface/NativeSurfaceEngineProtocol.ts");
  const worker = readSource("src/workers/nativeSurfaceEngine.worker.ts");

  assert.match(baseline, /const maxSearchMs = Number\(args\.get\("max-search-ms"\)/);
  assert.match(baseline, /const searchProbe = await page\.evaluate\(async \(\) =>/);
  assert.match(baseline, /metrics\.currentQuery === query/);
  assert.match(baseline, /metrics\.lastProjectionQuery === query/);
  assert.match(baseline, /metrics\.lastProjectionSource === "search"/);
  assert.match(baseline, /native search response/);
  assert.doesNotMatch(baseline, /setTimeout\(resolve, 350\)/);

  assert.match(protocol, /currentQuery: string/);
  assert.match(protocol, /lastProjectionMs: number/);
  assert.match(protocol, /lastProjectionSource: "browser" \| "search" \| "empty"/);
  assert.match(worker, /lastProjectionMs = performance\.now\(\) - projectionStartedAt/);
  assert.match(worker, /lastProjectionSource = surface\.lastProjectionQuery\.trim\(\)\.length > 0 \? "search" : "browser"/);
});

test("native surface worker keeps search on the WASM visible-entry hot path", () => {
  const worker = readSource("src/workers/nativeSurfaceEngine.worker.ts");
  const wasmRuntime = readSource("src/workers/nativeSurfaceWasmRuntime.ts");
  const state = readSource("src/workers/nativeSurfaceWorkerState.ts");

  assert.match(state, /runtimeVisibleCacheKey: string \| null/);
  assert.match(state, /runtimeVisibleEntries: Uint32Array \| null/);
  assert.match(worker, /computeWasmRuntimeVisibleEntries\(surface, browserPack\.itemCount\)/);
  assert.match(worker, /"wasm-visible-v2-no-ts-fallback"/);
  assert.match(wasmRuntime, /neonei_engine_compact_search_project_visible_indices/);
  assert.match(wasmRuntime, /const canUseSearchPack = normalizedQuery\.length > 0/);
  assert.match(wasmRuntime, /projectSearchVisibleWithGroups/);
  assert.doesNotMatch(worker, /runtimeSearchExactIndex|getRuntimeSearchPrefixCandidates|runtimeSearchPrefixCache/);
});
