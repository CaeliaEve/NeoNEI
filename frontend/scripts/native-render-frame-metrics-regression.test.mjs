import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(__dirname, "..");
const repoRoot = resolve(frontendRoot, "..");

function readFrontend(relativePath) {
  return readFileSync(resolve(frontendRoot, relativePath), "utf8");
}

function readRepo(relativePath) {
  return readFileSync(resolve(repoRoot, relativePath), "utf8");
}

test("native render protocol exposes segmented frame timing metrics", () => {
  const source = readFrontend("src/native-surface/NativeSurfaceRenderProtocol.ts");
  for (const field of ["lastParseMs", "lastSpriteNormalizeMs", "lastDrawMs", "frameAvgMs", "frameP95Ms", "frameMaxMs", "textureUploadConcurrency", "textureUploadBatches", "lastTextureUploadMs"]) {
    assert.match(source, new RegExp(`${field}: number`));
  }
});

test("native render worker records parse normalize draw and rolling frame timings", () => {
  const source = readFrontend("src/workers/nativeRender.worker.ts");
  assert.match(source, /const FRAME_SAMPLE_LIMIT = 120/);
  assert.match(source, /function rememberFrameSample/);
  assert.match(source, /lastParseMs = performance\.now\(\) - parseStartedAt/);
  assert.match(source, /lastSpriteNormalizeMs = performance\.now\(\) - normalizeStartedAt/);
  assert.match(source, /lastDrawMs = performance\.now\(\) - drawStartedAt/);
  assert.match(source, /frameP95Ms: percentile\(frameSamples, 95\)/);
});

test("native render worker batches atlas texture uploads instead of decoding all textures at once", () => {
  const source = readFrontend("src/workers/nativeRender.worker.ts");
  assert.match(source, /const TEXTURE_UPLOAD_CONCURRENCY = 4/);
  assert.match(source, /async function uploadTexturesInBatches/);
  assert.match(source, /pending\.slice\(offset, offset \+ TEXTURE_UPLOAD_CONCURRENCY\)/);
  assert.doesNotMatch(source, /Promise\.all\(uniqueTextures\.map/);
  assert.match(source, /textureUploadBatches/);
  assert.match(source, /lastTextureUploadMs/);
});

test("native surface benchmark gates segmented render metrics", () => {
  const source = readRepo("scripts/native-surface-baseline.mjs");
  assert.match(source, /lastParseMs/);
  assert.match(source, /lastSpriteNormalizeMs/);
  assert.match(source, /lastDrawMs/);
  assert.match(source, /frameP95Ms/);
  assert.match(source, /native render metric \$\{metricName\} is missing or non-finite/);
});
