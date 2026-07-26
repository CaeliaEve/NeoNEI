export const REGISTERED_RECIPE_COMPONENT_NAMES = Object.freeze([
  'NEIRecipeWidget',
  'StandardCraftingUI',
  'AvaritiaExtremeCraftingUI',
  'FurnaceUI',
  'GTUniversalMachineUI',
  'GTResearchStationUI',
  'GTAssemblerUI',
  'GTAssemblyLineUI',
  'GTAlloySmelterUI',
  'GTChemicalReactorUI',
  'IndustrialSlaughterhouseUI',
  'GTMolecularUI',
  'GTElectrolyzerUI',
  'GTBlastFurnaceUI',
  'GTElectricFurnaceUI',
  'BotaniaPoolUI',
  'BotaniaPureDaisyUI',
  'BotaniaTerraPlateUI',
  'BotaniaRuneAltarUI',
  'BotaniaElvenTradeUI',
  'ThaumcraftArcaneUI',
  'ThaumcraftInfusionUI',
  'ThaumcraftCrucibleUI',
  'ThaumcraftAspectUI',
  'ThaumcraftResearchUI',
  'BloodMagicAltarUI',
  'BloodAlchemyTableUI',
  'BloodBindingRitualUI',
  'BloodOrbCraftingUI',
  'MultiblockBlueprintUI',
] as const);

export type RegisteredRecipeComponentName = typeof REGISTERED_RECIPE_COMPONENT_NAMES[number];

const REGISTERED_RECIPE_COMPONENT_NAME_SET = new Set<string>(REGISTERED_RECIPE_COMPONENT_NAMES);

export function isRegisteredRecipeComponentName(
  componentName: string,
): componentName is RegisteredRecipeComponentName {
  return REGISTERED_RECIPE_COMPONENT_NAME_SET.has(componentName);
}
