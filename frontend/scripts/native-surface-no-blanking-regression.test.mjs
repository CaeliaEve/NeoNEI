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

test("native browser surface keeps the previous GPU frame visible while atlas textures stream", () => {
  const source = readSource("src/components/native-surface/NativeBrowserSurface.vue");

  assert.match(source, /function updateNativeRenderVisibility\(\)/);
  assert.match(source, /nativeRenderVisible\.value = nativeRenderInitialized && nativeFirstFrameReady/);
  assert.doesNotMatch(
    source,
    /nativeRenderVisible\.value = nativeRenderInitialized && nativeTexturesReady && nativeFirstFrameReady/,
    "rapid page flips must not hide the canvas while the next atlas batch is loading",
  );
  assert.match(source, /Keep the last committed GPU frame visible while the next atlas batch is[\s\S]*streaming/);
});
