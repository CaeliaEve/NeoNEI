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

test("native surface engine consumes texture and animation packs for sprite timelines", () => {
  const workerSource = readSource("src/workers/nativeSurfaceEngine.worker.ts");
  const protocolSource = readSource("src/native-surface/NativeSurfaceEngineProtocol.ts");
  const surfaceSource = readSource("src/components/native-surface/NativeBrowserSurface.vue");

  assert.match(workerSource, /function parseNativeTexturePack\(payloadBuffer: ArrayBuffer\)/);
  assert.match(workerSource, /function parseNativeAnimationPack\(payloadBuffer: ArrayBuffer\)/);
  assert.match(workerSource, /const texturePack = message\.packs\.find\(\(pack\) => pack\.name === "textures"\)/);
  assert.match(workerSource, /const animationPack = message\.packs\.find\(\(pack\) => pack\.name === "animations"\)/);
  assert.match(workerSource, /function buildSpriteCommands\(/);
  assert.match(workerSource, /spriteCommands: buildSpriteCommands\(surface, surface\.layoutCommands, message\.nowMs\)/);
  assert.match(protocolSource, /export type NativeSurfaceEngineSpriteCommand = NativeRenderSpriteCommand;/);
  assert.match(surfaceSource, /spriteCommands: frame\.spriteCommands \?\? \[\]/);
  assert.doesNotMatch(surfaceSource, /getGlobalBrowserAtlasSpriteDescriptorForItem/);
});
