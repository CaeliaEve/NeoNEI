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
  const spriteTimelineSource = readSource("src/workers/nativeSurfaceSpriteTimeline.ts");
  const runtimeParserSource = readSource("src/workers/nativeSurfaceRuntimeParsers.ts");

  assert.match(runtimeParserSource, /export function parseNativeTexturePack\(payloadBuffer: ArrayBuffer\)/);
  assert.match(runtimeParserSource, /export function parseNativeAnimationPack\(payloadBuffer: ArrayBuffer\)/);
  assert.match(workerSource, /parseNativeTexturePack,/);
  assert.match(workerSource, /parseNativeAnimationPack,/);
  assert.match(workerSource, /const texturePack = message\.packs\.find\(\(pack\) => pack\.name === "textures"\)/);
  assert.match(workerSource, /const animationPack = message\.packs\.find\(\(pack\) => pack\.name === "animations"\)/);
  assert.match(spriteTimelineSource, /export function buildSpriteFrame\(/);
  assert.match(workerSource, /const spriteFrame = buildSpriteFrame\(surface, surface\.layoutCommands, message\.nowMs, (?:wasmEngine|getWasmEngine\(\))\)/);
  assert.match(workerSource, /hasAnimatedSprites: spriteFrame\.hasAnimatedSprites/);
  assert.match(workerSource, /animatedSpriteCount: spriteFrame\.animatedSpriteCount/);
  assert.match(workerSource, /nextFrameDelayMs: spriteFrame\.nextFrameDelayMs/);
  assert.match(protocolSource, /export type NativeSurfaceEngineSpriteCommand = NativeRenderSpriteCommand;/);
  assert.match(workerSource, /spriteCommands: spriteFrame\.spriteCommands/);
  assert.doesNotMatch(protocolSource, /spriteCommands: NativeSurfaceEngineSpriteCommand\[\]/);
  assert.doesNotMatch(surfaceSource, /frame\.spriteCommands/);
  assert.doesNotMatch(surfaceSource, /type: "render"/);
  assert.match(surfaceSource, /if \(frame\.hasAnimatedSprites\)/);
  assert.match(surfaceSource, /scheduleNextAnimatedNativeFrame\(frame\.nextFrameDelayMs\)/);
  assert.doesNotMatch(surfaceSource, /getGlobalBrowserAtlasSpriteDescriptorForItem/);
});


test("native browser surface only continues RAF for visible animated frames", () => {
  const surfaceSource = readSource("src/components/native-surface/NativeBrowserSurface.vue");
  const protocolSource = readSource("src/native-surface/NativeSurfaceEngineProtocol.ts");
  const workerSource = readSource("src/workers/nativeSurfaceEngine.worker.ts");
  const spriteTimelineSource = readSource("src/workers/nativeSurfaceSpriteTimeline.ts");

  assert.match(protocolSource, /hasAnimatedSprites: boolean/);
  assert.match(protocolSource, /animatedSpriteCount: number/);
  assert.match(protocolSource, /nextFrameDelayMs: number \| null/);
  assert.match(spriteTimelineSource, /function resolveNextTimelineDelayMs/);
  assert.match(
    spriteTimelineSource,
    /function selectAtlasFrameByTimelineIndex/,
    "native sprite timeline must normalize exported frame indices against resident atlas frames",
  );
  assert.match(surfaceSource, /function scheduleNextAnimatedNativeFrame/);
  assert.match(surfaceSource, /!isNativeSurfaceRenderable\(\)/);
  assert.match(surfaceSource, /IntersectionObserver/);
  assert.match(surfaceSource, /clearNativeAnimationTimer\(\)/);
  assert.doesNotMatch(
    surfaceSource,
    /if \(props\.enableAnimation && nativeRenderVisible\.value && nativeRenderInitialized\) \{\s*requestNativeFrame\(\);\s*\}/,
    "static native pages must not continuously request frames",
  );
});
