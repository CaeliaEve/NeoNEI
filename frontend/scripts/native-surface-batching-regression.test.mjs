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
