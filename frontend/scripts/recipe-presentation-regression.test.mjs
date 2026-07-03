import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(scriptDir, '..');
const read = (relativePath) => fs.readFileSync(path.resolve(frontendRoot, relativePath), 'utf8');

test('native recipe presentation is routed through explicit policy catalogs', () => {
  const nativePolicySource = read('src/composables/recipe-display/nativeLayoutRendering.ts');
  const presentationPolicySource = read('src/composables/recipe-display/recipePresentationPolicyCatalog.ts');
  const presentationSource = read('src/composables/recipe-display/useRecipePresentation.ts');

  assert.match(nativePolicySource, /NATIVE_LAYOUT_RENDERER_DESCRIPTORS/);
  assert.match(nativePolicySource, /validateNativeLayoutRendererDescriptors/);
  assert.match(nativePolicySource, /policy: 'static-layout'/);
  assert.match(nativePolicySource, /policy: 'dynamic-primitives'/);
  assert.match(nativePolicySource, /NATIVE_LAYOUT_RENDERER_POLICY_CATALOG/);
  assert.match(nativePolicySource, /StandardCraftingUI/);
  assert.match(nativePolicySource, /AvaritiaExtremeCraftingUI/);
  assert.match(nativePolicySource, /FurnaceUI/);
  assert.match(nativePolicySource, /BotaniaPoolUI/);
  assert.match(nativePolicySource, /BotaniaRuneAltarUI/);
  assert.match(nativePolicySource, /BotaniaPureDaisyUI/);
  assert.match(nativePolicySource, /BotaniaTerraPlateUI/);
  assert.match(nativePolicySource, /ThaumcraftArcaneUI/);
  assert.match(nativePolicySource, /BloodMagicAltarUI/);
  assert.match(nativePolicySource, /MultiblockBlueprintUI/);
  assert.match(nativePolicySource, /GTResearchStationUI/);
  assert.match(nativePolicySource, /GTUniversalMachineUI/);
  assert.match(nativePolicySource, /GTAssemblyLineUI/);
  assert.match(nativePolicySource, /GTChemicalReactorUI/);
  assert.match(nativePolicySource, /hasDrawableNativePrimitive/);
  assert.match(nativePolicySource, /hasNativeDynamicPrimitives\(layout\)/);

  assert.match(presentationPolicySource, /RECIPE_PRESENTATION_ROUTE_DESCRIPTORS/);
  assert.match(presentationPolicySource, /nativePayloadAuthority: 'fail-closed-native-layout-authority'/);
  assert.match(presentationPolicySource, /resolveRecipePresentationDecision/);
  assert.match(presentationPolicySource, /resolveRecipePresentationRoute/);
  assert.match(presentationPolicySource, /refusing retired component path/);
  assert.match(presentationSource, /resolveRecipePresentationDecision/);
  assert.match(presentationSource, /resolveRecipePresentationRoute/);
  assert.doesNotMatch(presentationSource, /isNativeLayoutRendererEligible\(presentationProfile\.value\.component, layout\)/);
});
