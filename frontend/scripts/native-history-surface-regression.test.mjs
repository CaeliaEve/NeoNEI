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

  assert.match(source, /getAllGlobalBrowserAtlasTextureDescriptors/);
  assert.match(source, /spriteCommands: frame\.spriteCommands \?\? \[\]/);
  assert.match(source, /controller\.setHistoryItems\(props\.historyItemIds\)/);
  assert.doesNotMatch(source, /<HomeCanvasGrid/);
  assert.doesNotMatch(source, /suspend-rendering/);
  assert.doesNotMatch(source, /new Image\(/);
});

test("history surface projects entries from native runtime packs", () => {
  const workerSource = readSource("src/workers/nativeSurfaceEngine.worker.ts");
  const protocolSource = readSource("src/native-surface/NativeSurfaceEngineProtocol.ts");

  assert.match(protocolSource, /"runtime-history-pack"/);
  assert.match(workerSource, /buildRuntimeHistoryEntries/);
  assert.match(workerSource, /runtimeBrowserIndexByItemId/);
  assert.match(workerSource, /source: "runtime-history-pack"/);
  assert.doesNotMatch(workerSource, /&& !surface\.enableHistoryViewport/);
});


