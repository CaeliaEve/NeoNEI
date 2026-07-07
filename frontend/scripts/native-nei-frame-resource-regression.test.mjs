import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  nativeNeiFrameAssetUrl,
  nativeNeiFrameFromPayload,
  nativeNeiFrameValidationError,
} from '../src/services/nativeNeiFrameResource.ts';

const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readSource = (relativePath) => readFileSync(resolve(frontendRoot, relativePath), 'utf8');

test('native NEI frame ABI requires captured in-game frame metadata', () => {
  const payload = {
    recipeId: 'r~abc',
    familyKey: 'gregtech-machine|machine|166x135@6#2|unknown',
    nativeFrame: {
      status: 'captured',
      assetRef: 'assets/nei-native-frames/73/r~abc.png',
      width: 166,
      height: 135,
      coordinateSpace: 'nei_pixels',
      source: 'in-game-nei-render',
    },
  };

  const frame = nativeNeiFrameFromPayload(payload);
  assert.equal(frame.assetRef, 'assets/nei-native-frames/73/r~abc.png');
  assert.equal(frame.width, 166);
  assert.equal(frame.height, 135);
  assert.equal(nativeNeiFrameValidationError(payload), null);
  assert.equal(
    nativeNeiFrameAssetUrl(frame),
    '/dist-data/assets/nei-native-frames/73/r~abc.png',
  );
});

test('native NEI frame ABI fails closed for missing or malformed frame data', () => {
  assert.match(
    nativeNeiFrameValidationError({ recipeId: 'r1', familyKey: 'furnace' }),
    /nativeFrame captured from in-game NEI/,
  );
  assert.equal(
    nativeNeiFrameFromPayload({
      recipeId: 'r1',
      familyKey: 'furnace',
      nativeFrame: {
        status: 'semantic',
        assetRef: 'assets/nei-native-frames/00/r1.png',
        width: 166,
        height: 65,
        coordinateSpace: 'nei_pixels',
      },
    }),
    null,
  );
  assert.match(
    nativeNeiFrameValidationError({
      recipeId: 'r1',
      familyKey: 'furnace',
      nativeFrame: {
        status: 'captured',
        assetRef: '',
        width: 166,
        height: 65,
        coordinateSpace: 'nei_pixels',
      },
    }),
    /assetRef is missing/,
  );
});

test('native NEI frame owns canvas authority before reconstructed layout paths', () => {
  const componentSource = readSource('src/components/NativeNeiRecipeCanvas.vue');
  const policySource = readSource('src/composables/recipe-display/recipePresentationPolicyCatalog.ts');
  const frameResourceSource = readSource('src/services/nativeNeiFrameResource.ts');

  assert.match(componentSource, /nativeNeiFrameFromPayload/);
  assert.match(componentSource, /v-if="hasNativeFrame && nativeFrameUrl"/);
  assert.doesNotMatch(componentSource, /<canvas/);
  assert.doesNotMatch(componentSource, /NativeUiCanvasRenderPipeline/);
  assert.doesNotMatch(componentSource, /!hasNativeFrame && textOverlays/);
  assert.match(frameResourceSource, /Native recipe UI frame is missing/);
  assert.match(policySource, /recipeUiPayloadNativeFrame/);
  assert.match(policySource, /missing nativeFrame; refusing reconstructed nativeLayout canvas path/);
  assert.match(policySource, /Boolean\(recipeUiPayloadNativeFrame\(uiPayload\)\)/);
});
