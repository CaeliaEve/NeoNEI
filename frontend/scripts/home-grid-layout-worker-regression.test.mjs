import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

const componentSource = fs.readFileSync(
  'E:/codex/ae2/NeoNEI/frontend/src/components/HomeCanvasGrid.vue',
  'utf8',
);
const serviceSource = fs.readFileSync(
  'E:/codex/ae2/NeoNEI/frontend/src/services/homeGridLayoutWorker.ts',
  'utf8',
);
const workerSource = fs.readFileSync(
  'E:/codex/ae2/NeoNEI/frontend/src/workers/homeGridLayout.worker.ts',
  'utf8',
);

test('homepage canvas grid delegates layout and resource dependency calculation to a worker', () => {
  assert.match(componentSource, /computeHomeGridLayout/, 'HomeCanvasGrid should call the layout worker service');
  assert.match(componentSource, /layoutCommands/, 'HomeCanvasGrid should store worker draw commands');
  assert.match(componentSource, /activeLayoutKey/, 'HomeCanvasGrid should guard against stale worker responses');
  assert.match(serviceSource, /computeHomeGridLayout/, 'worker service should expose computeHomeGridLayout');
  assert.match(workerSource, /drawCommands/, 'worker should return drawCommands');
  assert.match(workerSource, /renderAssetRefs/, 'worker should return render asset dependencies');
});

test('homepage layout worker keeps an OffscreenCanvas enhancement path with synchronous fallback', () => {
  assert.match(serviceSource, /OffscreenCanvas/, 'worker service should detect OffscreenCanvas support');
  assert.match(workerSource, /offscreenCanvasSupported/, 'worker contract should preserve OffscreenCanvas capability metadata');
  assert.match(serviceSource, /computeFallbackLayout/, 'worker service should keep a no-worker fallback layout');
  assert.match(componentSource, /command\?\.x \?\? col \* \(cardSize\.value \+ gap\)/, 'component should keep inline fallback coordinates');
});
