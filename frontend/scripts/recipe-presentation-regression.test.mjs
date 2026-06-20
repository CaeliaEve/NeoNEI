import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(scriptDir, '..');
const read = (relativePath) => fs.readFileSync(path.resolve(frontendRoot, relativePath), 'utf8');

test('static workbench-style native layouts are eligible for the native canvas path', () => {
  const helperSource = read('src/composables/recipe-display/nativeLayoutRendering.ts');
  const presentationSource = read('src/composables/recipe-display/useRecipePresentation.ts');

  assert.equal(helperSource.includes('StandardCraftingUI'), true);
  assert.equal(helperSource.includes('AvaritiaExtremeCraftingUI'), true);
  assert.equal(helperSource.includes('FurnaceUI'), true);
  assert.equal(helperSource.includes('BotaniaPoolUI'), true);
  assert.equal(helperSource.includes('BotaniaRuneAltarUI'), true);
  assert.equal(helperSource.includes('BotaniaPureDaisyUI'), true);
  assert.equal(helperSource.includes('BotaniaTerraPlateUI'), true);
  assert.equal(helperSource.includes('ThaumcraftArcaneUI'), true);
  assert.equal(helperSource.includes('BloodMagicAltarUI'), true);
  assert.equal(helperSource.includes('MultiblockBlueprintUI'), true);
  assert.equal(helperSource.includes('GTResearchStationUI'), true);
  assert.equal(helperSource.includes('NATIVE_LAYOUT_DYNAMIC_RENDERER_COMPONENTS'), true);
  assert.equal(helperSource.includes('GTUniversalMachineUI'), true);
  assert.equal(helperSource.includes('GTAssemblyLineUI'), true);
  assert.equal(helperSource.includes('GTChemicalReactorUI'), true);
  assert.equal(helperSource.includes('hasDrawableNativePrimitive'), true);
  assert.equal(helperSource.includes('hasNativeDynamicPrimitives(layout)'), true);
  assert.equal(
    presentationSource.includes("import { isNativeLayoutRendererEligible } from './nativeLayoutRendering';"),
    true,
  );
  assert.equal(
    presentationSource.includes('isNativeLayoutRendererEligible(presentationProfile.value.component, layout)'),
    true,
  );
});
