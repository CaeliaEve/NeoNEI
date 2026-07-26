import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(__dirname, "..");

function readSource(relativePath) {
  return readFileSync(resolve(frontendRoot, relativePath), "utf8");
}

test("history strip renders through the native browser surface", () => {
  const source = readSource("src/components/home/HomeHistoryStrip.vue");

  assert.match(source, /import NativeBrowserSurface from "\.\.\/native-surface\/NativeBrowserSurface\.vue"/);
  assert.match(source, /<NativeBrowserSurface/);
  assert.match(source, /surface-id="history"/);
  assert.match(source, /viewport-role="history"/);
  assert.match(source, /:history-item-ids="historyItemIds"/);
  assert.match(source, /:manifest-url="nativeRuntimeManifestUrl"/);
  assert.doesNotMatch(source, /<img\b/);
});

test("native browser surface keeps history rendering on the atlas path without DOM grid fallback", () => {
  const source = readSource("src/components/native-surface/NativeBrowserSurface.vue");
  const workerSource = readSource("src/workers/nativeSurfaceEngine.worker.ts");

  assert.match(source, /getGlobalBrowserAtlasTextureDescriptorsForKeys/);
  assert.match(source, /queueResidentAtlasBackgroundUpload/);
  assert.match(workerSource, /spriteCommands: spriteFrame\.spriteCommands/);
  assert.doesNotMatch(source, /frame\.spriteCommands/);
  assert.doesNotMatch(source, /type: "render"/);
  assert.match(source, /controller\.setHistoryItems\(props\.historyItemIds\)/);
  assert.doesNotMatch(source, /<HomeCanvasGrid/);
  assert.doesNotMatch(source, /suspend-rendering/);
  assert.doesNotMatch(source, /new Image\(/);
});

test("history surface projects entries from native runtime packs", () => {
  const workerSource = readSource("src/workers/nativeSurfaceEngine.worker.ts");
  const protocolSource = readSource("src/native-surface/NativeSurfaceEngineProtocol.ts");
  const layoutSource = readSource("src/workers/nativeSurfaceLayout.ts");

  assert.match(protocolSource, /"runtime-history-pack"/);
  assert.match(workerSource, /buildRuntimeHistoryEntries/);
  assert.match(workerSource, /runtimeBrowserIndexByItemId/);
  assert.match(workerSource, /source: "runtime-history-pack"/);
  assert.match(
    workerSource,
    /case "historyItems":[\s\S]*applyNativeSurfaceMutation\(surface, \{ type: "historyItems"[\s\S]*rebuildLayout\(surface\)/,
    "history item updates must rebuild native layout so newly clicked items appear in the strip",
  );
  assert.match(
    layoutSource,
    /!command\.key\.startsWith\("native-history:"\)[\s\S]*\? 16/,
    "history entries must not be flagged as expanded group members just because their item belongs to a group",
  );
  assert.doesNotMatch(workerSource, /&& !surface\.enableHistoryViewport/);
});


