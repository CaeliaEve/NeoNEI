import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'node:path';

const read = (relativePath) =>
  fs.readFileSync(path.resolve('..', relativePath), 'utf8');

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

test('AnimatedItemIcon replays exported atlas timing instead of probing GIF files', () => {
  const source = read('frontend/src/components/AnimatedItemIcon.vue');

  assert.equal(
    source.includes('prepareAtlasAnimation(entry)'),
    true,
    'AnimatedItemIcon should prepare animation directly from the compiled atlas entry',
  );

  assert.equal(
    source.includes('const lookupKeys = Array.from(new Set([renderAssetRef, itemId].filter(Boolean)))'),
    true,
    'AnimatedItemIcon should warm atlas entries by renderAssetRef before falling back to itemId',
  );

  assert.equal(
    source.includes('getGlobalBrowserAtlasEntry(itemId, renderAssetRef)'),
    true,
    'AnimatedItemIcon should resolve atlas entries with renderAssetRef priority',
  );

  assert.equal(
    source.includes('normalizeTimeline(entry.animatedAtlas?.timeline, entry.animatedAtlas?.frameDurationMs)'),
    true,
    'AnimatedItemIcon should respect exported per-frame atlas timing',
  );

  assert.equal(
    source.includes('selectAtlasFrameByTimelineIndex(animation.frames, frameIndex)'),
    true,
    'AnimatedItemIcon should wrap sparse/oversized timeline frame indices onto exported atlas frames',
  );

  assert.equal(
    source.includes('prepareItemAnimationFrames('),
    false,
    'AnimatedItemIcon must not fall back to per-item GIF/sprite probing',
  );
});
