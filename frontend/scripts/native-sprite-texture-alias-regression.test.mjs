import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..", "..");

function readRepoSource(relativePath) {
  return readFileSync(resolve(repoRoot, relativePath), "utf8");
}

test("native sprite timeline resolves NBT/base texture aliases without DOM image fallback", () => {
  const source = readRepoSource("frontend/src/workers/nativeSurfaceSpriteTimeline.ts");

  assert.match(source, /function getItemIdAliases\(itemId: string\)/);
  assert.match(source, /parts\.slice\(0, 4\)\.join\("~"\)/);
  assert.match(source, /\[parts\[0\], parts\[1\], parts\[2\], "0"\]\.join\("~"\)/);
  assert.match(source, /function resolveTextureItem\(/);
  assert.match(source, /resolveTextureItem\(surface\.textureByItemId, command\.itemId\)/);
  assert.doesNotMatch(source, /getImageUrl|HTMLImageElement|document\.createElement/);
});

test("native diagnostics expose sprite coverage instead of silently blanking pages", () => {
  const protocol = readRepoSource("frontend/src/native-surface/NativeSurfaceEngineProtocol.ts");
  const metricsCatalog = readRepoSource("frontend/src/workers/nativeSurfaceWorkerMetricsCatalog.ts");
  const engine = readRepoSource("frontend/src/workers/nativeSurfaceEngine.worker.ts");

  assert.match(protocol, /spriteCommandCount: number/);
  assert.match(protocol, /missingSpriteCount: number/);
  assert.match(protocol, /missingSpriteItemIds: string\[\]/);
  assert.match(metricsCatalog, /key: "spriteCommandCount"/);
  assert.match(metricsCatalog, /source: "surface\.spriteCommandCount"/);
  assert.match(metricsCatalog, /context\.lastSurface\?\.spriteCommandCount \?\? 0/);
  assert.match(metricsCatalog, /key: "missingSpriteCount"/);
  assert.match(metricsCatalog, /source: "surface\.missingSpriteCount"/);
  assert.match(metricsCatalog, /context\.lastSurface\?\.missingSpriteCount \?\? 0/);
  assert.match(engine, /surface\.spriteCommandCount = spriteFrame\.spriteCommands\.length/);
  assert.match(engine, /surface\.missingSpriteCount = spriteFrame\.missingSpriteCount/);
  assert.match(engine, /surface\.missingSpriteItemIds = spriteFrame\.missingSpriteItemIds/);
});
