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

  for (const eventName of ["viewport", "page", "search", "modFilter", "expandedGroups", "historyItems", "compatEntries", "itemSize"]) {
    assert.match(source, new RegExp(`this\\.queueMutation\\(\\{ type: "${eventName}"`));
  }
});

test("native surface worker applies one layout rebuild for a mutation batch", () => {
  const source = readSource("src/workers/nativeSurfaceEngine.worker.ts");
  assert.match(source, /function applyMutation/);
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

test("native surface controller stops sending compat entries once native runtime is ready", () => {
  const source = readSource("src/native-surface/NativeSurfaceController.ts");

  assert.match(source, /shouldSendCompatEntriesToWorker\(\)/);
  assert.match(source, /return !this\.nativeRuntimeReady \|\| this\.nativeRuntimePacks <= 0/);
  assert.match(
    source,
    /if \(this\.shouldSendCompatEntriesToWorker\(\)\) \{\s*this\.queueMutation\(\{ type: "compatEntries"/,
    "compat entries should only be sent while native packs are unavailable",
  );
  assert.match(
    source,
    /setCompatEntries:native-runtime-suppressed/,
    "native runtime path should make compat entry suppression visible in metrics",
  );
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


test("native surface metrics expose layout rebuilds separately from frame requests", () => {
  const protocol = readSource("src/native-surface/NativeSurfaceEngineProtocol.ts");
  const worker = readSource("src/workers/nativeSurfaceEngine.worker.ts");
  assert.match(protocol, /layoutRebuilds: number/);
  assert.match(protocol, /frameRequests: number/);
  assert.match(worker, /surface\.layoutRebuilds \+= 1/);
  assert.match(worker, /case "frame":\s*surface\.frameRequests \+= 1;\s*return \{/);
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
