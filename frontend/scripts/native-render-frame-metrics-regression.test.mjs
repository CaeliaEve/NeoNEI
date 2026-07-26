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
  for (const field of ["lastParseMs", "lastSpriteNormalizeMs", "lastDrawMs", "frameAvgMs", "frameP95Ms", "frameMaxMs", "latestFrameToken", "droppedStaleFrames", "textureUploadConcurrency", "textureUploadBatches", "latestTextureUploadToken", "cancelledTextureUploads", "lastTextureUploadMs", "lastTextureReadyDelayMs"]) {
    assert.match(source, new RegExp(`${field}: number`));
  }
  assert.match(source, /contextLost: boolean/);
  assert.match(source, /contextLostReason: string \| null/);
});

test("native render worker records parse normalize draw and rolling frame timings", () => {
  const source = readFrontend("src/workers/nativeRender.worker.ts");
  const metricsCatalog = readFrontend("src/workers/nativeRenderFrameMetricsCatalog.ts");
  assert.match(source, /const FRAME_SAMPLE_LIMIT = 120/);
  assert.match(source, /function rememberFrameSample/);
  assert.match(source, /lastParseMs = performance\.now\(\) - parseStartedAt/);
  assert.match(source, /lastSpriteNormalizeMs = performance\.now\(\) - normalizeStartedAt/);
  assert.match(source, /lastDrawMs = performance\.now\(\) - drawStartedAt/);
  assert.match(metricsCatalog, /key: "frameP95Ms"/);
  assert.match(metricsCatalog, /source: "worker\.frameSamples\.p95"/);
  assert.match(metricsCatalog, /frameP95Ms: percentile\(frameSamples, 95\)/);
});

test("native render worker batches atlas texture uploads instead of decoding all textures at once", () => {
  const source = readFrontend("src/workers/nativeRender.worker.ts");
  assert.match(source, /const TEXTURE_UPLOAD_CONCURRENCY = 4/);
  assert.match(source, /async function uploadTexturesInBatches/);
  assert.match(source, /pending\.slice\(offset, offset \+ TEXTURE_UPLOAD_CONCURRENCY\)/);
  assert.doesNotMatch(source, /Promise\.all\(uniqueTextures\.map/);
  assert.match(source, /textureUploadBatches/);
  assert.match(source, /lastTextureUploadMs/);
  assert.match(source, /lastTextureReadyDelayMs/);
});

test("native render worker cancels obsolete atlas uploads during rapid paging", () => {
  const protocol = readFrontend("src/native-surface/NativeSurfaceRenderProtocol.ts");
  const worker = readFrontend("src/workers/nativeRender.worker.ts");

  assert.match(protocol, /latestTextureUploadToken: number/);
  assert.match(protocol, /cancelledTextureUploads: number/);
  assert.match(worker, /let latestTextureUploadToken = 0/);
  assert.match(worker, /let cancelledTextureUploads = 0/);
  assert.match(worker, /const uploadToken = latestTextureUploadToken \+ 1/);
  assert.match(worker, /latestTextureUploadToken = uploadToken/);
  assert.match(worker, /textureUploadRequestedAt = performance\.now\(\)/);
  assert.match(worker, /lastTextureReadyDelayMs = performance\.now\(\) - textureUploadRequestedAt/);
  assert.match(worker, /if \(uploadToken !== latestTextureUploadToken\)/);
  assert.match(worker, /cancelledTextureUploads \+= 1/);
  assert.match(worker, /await uploadTexturesInBatches\(uniqueTextures, uploadToken\)/);
});

test("native render worker virtualizes oversized atlas textures into GPU-safe tiles", () => {
  const source = readFrontend("src/workers/nativeRender.worker.ts");
  assert.match(source, /const virtualTextureTiles = new Map/);
  assert.match(source, /async function uploadVirtualTextureTiles/);
  assert.match(source, /createImageBitmap\(bitmap, 0, y, bitmap\.width, tileHeight\)/);
  assert.match(source, /splitSpriteCommandsForVirtualTiles/);
  assert.match(source, /textureKey: tile\.key/);
  assert.match(source, /sourceY: overlapTop - tile\.y/);
});

test("native surface benchmark gates segmented render metrics", () => {
  const source = readRepo("scripts/native-surface-baseline.mjs");
  assert.match(source, /lastParseMs/);
  assert.match(source, /lastSpriteNormalizeMs/);
  assert.match(source, /lastDrawMs/);
  assert.match(source, /frameP95Ms/);
  assert.match(source, /latestTextureUploadToken/);
  assert.match(source, /cancelledTextureUploads/);
  assert.match(source, /lastTextureReadyDelayMs/);
  assert.match(source, /nativeRenderTextureDelayMs/);
  assert.match(source, /max-native-texture-delay-ms/);
  assert.match(source, /native texture ready delay/);
  assert.match(source, /maxNativeTextureDelayMs/);
  assert.match(source, /native render context was lost/);
  assert.match(source, /nativeRenderContextLost/);
  assert.match(source, /nativeRenderCancelledTextureUploads/);
  assert.match(source, /native render metric \$\{metricName\} is missing or non-finite/);
});


test("native render worker drops stale rapid-paging frames by frame token", () => {
  const protocol = readFrontend("src/native-surface/NativeRenderPipelineProtocol.ts");
  const engineWorker = readFrontend("src/workers/nativeSurfaceEngine.worker.ts");
  const worker = readFrontend("src/workers/nativeRender.worker.ts");

  assert.match(protocol, /frameToken: number/);
  assert.match(engineWorker, /frameToken: message\.id/);
  assert.match(worker, /let latestFrameToken = 0/);
  assert.match(worker, /let droppedStaleFrames = 0/);
  assert.match(worker, /if \(frameToken < latestFrameToken\)/);
  assert.match(worker, /droppedStaleFrames \+= 1/);
});

test("native WebGPU renderer surfaces context loss diagnostics to render metrics", () => {
  const backend = readFrontend("src/renderers/native/NativeRendererBackend.ts");
  const renderer = readFrontend("src/renderers/native/WebGpuNativeRenderer.ts");
  const worker = readFrontend("src/workers/nativeRender.worker.ts");
  const metricsCatalog = readFrontend("src/workers/nativeRenderFrameMetricsCatalog.ts");

  assert.match(backend, /export type NativeRendererDiagnostics/);
  assert.match(backend, /diagnostics\?\(\): NativeRendererDiagnostics/);
  assert.match(renderer, /private contextLost = false/);
  assert.match(renderer, /handles\.device\.lost\?\.then\?/);
  assert.match(renderer, /contextLostReason/);
  assert.match(worker, /const rendererDiagnostics = nativeRenderer\?\.diagnostics\?\.\(\)/);
  assert.match(worker, /contextLost: rendererDiagnostics\.contextLost/);
  assert.match(worker, /contextLostReason: rendererDiagnostics\.contextLostReason/);
  assert.match(metricsCatalog, /key: "contextLost"/);
  assert.match(metricsCatalog, /source: "renderer\.diagnostics\.contextLost"/);
  assert.match(metricsCatalog, /key: "contextLostReason"/);
  assert.match(metricsCatalog, /source: "renderer\.diagnostics\.contextLostReason"/);
});
