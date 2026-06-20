export const NATIVE_LAYOUT_RENDERER_COMPONENTS = new Set([
  // Crafting / workbench style
  'StandardCraftingUI',
  'AvaritiaExtremeCraftingUI',
  'FurnaceUI',
  // Static ritual / altar style
  'BotaniaPoolUI',
  'BotaniaRuneAltarUI',
  'BotaniaPureDaisyUI',
  'BotaniaTerraPlateUI',
  'BotaniaElvenTradeUI',
  'ThaumcraftArcaneUI',
  'ThaumcraftCrucibleUI',
  'ThaumcraftAspectUI',
  'ThaumcraftResearchUI',
  'BloodMagicAltarUI',
  'BloodAlchemyTableUI',
  'BloodBindingRitualUI',
  'BloodOrbCraftingUI',
  'MultiblockBlueprintUI',
  // Static metadata / document style
  'GTResearchStationUI',
]);

export const NATIVE_LAYOUT_DYNAMIC_RENDERER_COMPONENTS = new Set([
  'GTUniversalMachineUI',
  'GTAssemblyLineUI',
  'GTChemicalReactorUI',
]);

function hasDrawableNativePrimitive(value: unknown): boolean {
  if (!Array.isArray(value)) {
    return false;
  }
  return value.some((entry) => {
    if (!entry || typeof entry !== 'object') {
      return false;
    }
    const candidate = entry as Record<string, unknown>;
    const width = Number(candidate.width);
    const height = Number(candidate.height);
    return Number.isFinite(width) && width > 0
      && Number.isFinite(height) && height > 0;
  });
}

export function hasNativeDynamicPrimitives(layout: unknown): boolean {
  if (!layout || typeof layout !== 'object') {
    return false;
  }
  const candidate = layout as Record<string, unknown>;
  return hasDrawableNativePrimitive(candidate.dynamicPrimitives)
    || hasDrawableNativePrimitive(candidate.progressBars)
    || hasDrawableNativePrimitive(candidate.fluidBars)
    || hasDrawableNativePrimitive(candidate.energyBars);
}

export function isNativeLayoutRendererEligible(componentName: string, layout?: unknown): boolean {
  if (NATIVE_LAYOUT_RENDERER_COMPONENTS.has(componentName)) {
    return true;
  }
  return NATIVE_LAYOUT_DYNAMIC_RENDERER_COMPONENTS.has(componentName)
    && hasNativeDynamicPrimitives(layout);
}
