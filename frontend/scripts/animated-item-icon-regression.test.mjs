import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

const read = (relativePath) =>
  fs.readFileSync(`E:/codex/ae2/NeoNEI/${relativePath}`, 'utf8');

test('recipe slot resolver preserves render asset metadata for animated textures', () => {
  const source = read('frontend/src/composables/useRecipeSlots.ts');

  assert.equal(
    source.includes('renderAssetRef?: string | null;'),
    true,
    'ResolvedSlot should keep renderAssetRef so recipe UIs can render the correct animated variant',
  );

  assert.equal(
    source.includes('imageFileName?: string | null;'),
    true,
    'ResolvedSlot should keep imageFileName so gif-backed exports can render exact texture files',
  );
});

test('core recipe surfaces use AnimatedItemIcon instead of raw static img tags for item slots', () => {
  const files = [
    'frontend/src/components/RecipeItemTooltip.vue',
    'frontend/src/components/ItemTooltip.vue',
    'frontend/src/components/StandardCraftingUI.vue',
    'frontend/src/components/GTUniversalMachineUI.vue',
    'frontend/src/components/GTAssemblerUI.vue',
    'frontend/src/components/GTAssemblyLineUI.vue',
    'frontend/src/components/FurnaceUI.vue',
    'frontend/src/components/GTAlloySmelterUI.vue',
    'frontend/src/components/GTBlastFurnaceUI.vue',
    'frontend/src/components/GTElectricFurnaceUI.vue',
    'frontend/src/components/GTElectrolyzerUI.vue',
    'frontend/src/components/GTMolecularUI.vue',
    'frontend/src/components/NEIRecipeWidget.vue',
    'frontend/src/components/BloodMagicAltarUI.vue',
    'frontend/src/components/BotaniaPoolUI.vue',
    'frontend/src/components/ThaumcraftResearchUI.vue',
  ];

  for (const file of files) {
    const source = read(file);
    assert.equal(
      source.includes('AnimatedItemIcon'),
      true,
      `${file} should render item textures through AnimatedItemIcon`,
    );
  }
});

test('AnimatedItemIcon replays exported frame timing instead of a fixed fps', () => {
  const source = read('frontend/src/components/AnimatedItemIcon.vue');

  assert.equal(
    source.includes('const DEFAULT_FRAME_DURATION_MS = 50;'),
    true,
    'AnimatedItemIcon should default to Minecraft-style 50ms ticks when metadata omits timing',
  );

  assert.equal(
    source.includes("typeof frame.durationMs === 'number' ? frame.durationMs : defaultFrameDurationMs"),
    true,
    'AnimatedItemIcon should respect per-frame native sprite timing from exported metadata',
  );

  assert.equal(
    source.includes('animatedAtlasEntry.timeline?.find'),
    true,
    'AnimatedItemIcon should honor per-frame timing from animated atlas manifests instead of a single fixed delay',
  );
});
