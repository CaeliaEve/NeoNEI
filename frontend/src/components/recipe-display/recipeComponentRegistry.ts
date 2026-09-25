import { defineAsyncComponent, type Component } from 'vue';
import StandardCraftingUI from '../StandardCraftingUI.vue';
import {
  isRegisteredRecipeComponentName,
  type RegisteredRecipeComponentName,
} from './recipeComponentCatalog';

export { StandardCraftingUI };
export type { RegisteredRecipeComponentName };

export const AvaritiaExtremeCraftingUI = defineAsyncComponent(() => import('../AvaritiaExtremeCraftingUI.vue'));
export const NEIRecipeWidget = defineAsyncComponent(() => import('../NEIRecipeWidget.vue'));
export const FurnaceUI = defineAsyncComponent(() => import('../FurnaceUI.vue'));
export const GTUniversalMachineUI = defineAsyncComponent(() => import('../GTUniversalMachineUI.vue'));
export const GTResearchStationUI = defineAsyncComponent(() => import('../GTResearchStationUI.vue'));
export const GTAssemblerUI = defineAsyncComponent(() => import('../GTAssemblerUI.vue'));
export const GTAssemblyLineUI = defineAsyncComponent(() => import('../GTAssemblyLineUI.vue'));
export const GTAlloySmelterUI = defineAsyncComponent(() => import('../GTAlloySmelterUI.vue'));
export const GTChemicalReactorUI = defineAsyncComponent(() => import('../GTChemicalReactorUI.vue'));
export const IndustrialSlaughterhouseUI = defineAsyncComponent(() => import('../IndustrialSlaughterhouseUI.vue'));
export const GTMolecularUI = defineAsyncComponent(() => import('../GTMolecularUI.vue'));
export const GTElectrolyzerUI = defineAsyncComponent(() => import('../GTElectrolyzerUI.vue'));
export const GTBlastFurnaceUI = defineAsyncComponent(() => import('../GTBlastFurnaceUI.vue'));
export const GTElectricFurnaceUI = defineAsyncComponent(() => import('../GTElectricFurnaceUI.vue'));
export const BotaniaPoolUI = defineAsyncComponent(() => import('../BotaniaPoolUI.vue'));
export const BotaniaPureDaisyUI = defineAsyncComponent(() => import('../BotaniaPureDaisyUI.vue'));
export const BotaniaTerraPlateUI = defineAsyncComponent(() => import('../BotaniaTerraPlateUI.vue'));
export const BotaniaRuneAltarUI = defineAsyncComponent(() => import('../BotaniaRuneAltarUI.vue'));
export const BotaniaElvenTradeUI = defineAsyncComponent(() => import('../BotaniaElvenTradeUI.vue'));
export const ThaumcraftArcaneUI = defineAsyncComponent(() => import('../ThaumcraftArcaneUI.vue'));
export const ThaumcraftInfusionUI = defineAsyncComponent(() => import('../ThaumcraftInfusionUI.vue'));
export const ThaumcraftCrucibleUI = defineAsyncComponent(() => import('../ThaumcraftCrucibleUI.vue'));
export const ThaumcraftAspectUI = defineAsyncComponent(() => import('../ThaumcraftAspectUI.vue'));
export const ThaumcraftResearchUI = defineAsyncComponent(() => import('../ThaumcraftResearchUI.vue'));
export const BloodMagicAltarUI = defineAsyncComponent(() => import('../BloodMagicAltarUI.vue'));
export const BloodAlchemyTableUI = defineAsyncComponent(() => import('../BloodAlchemyTableUI.vue'));
export const BloodBindingRitualUI = defineAsyncComponent(() => import('../BloodBindingRitualUI.vue'));
export const BloodOrbCraftingUI = defineAsyncComponent(() => import('../BloodOrbCraftingUI.vue'));
export const MultiblockBlueprintUI = defineAsyncComponent(() => import('../MultiblockBlueprintUI.vue'));

export const componentRegistry = {
  NEIRecipeWidget,
  StandardCraftingUI,
  AvaritiaExtremeCraftingUI,
  FurnaceUI,
  GTUniversalMachineUI,
  GTResearchStationUI,
  GTAssemblerUI,
  GTAssemblyLineUI,
  GTAlloySmelterUI,
  GTChemicalReactorUI,
  IndustrialSlaughterhouseUI,
  GTMolecularUI,
  GTElectrolyzerUI,
  GTBlastFurnaceUI,
  GTElectricFurnaceUI,
  BotaniaPoolUI,
  BotaniaPureDaisyUI,
  BotaniaTerraPlateUI,
  BotaniaRuneAltarUI,
  BotaniaElvenTradeUI,
  ThaumcraftArcaneUI,
  ThaumcraftInfusionUI,
  ThaumcraftCrucibleUI,
  ThaumcraftAspectUI,
  ThaumcraftResearchUI,
  BloodMagicAltarUI,
  BloodAlchemyTableUI,
  BloodBindingRitualUI,
  BloodOrbCraftingUI,
  MultiblockBlueprintUI,
} satisfies Record<RegisteredRecipeComponentName, Component>;

export function isRegisteredRecipeComponent(
  componentName: string,
): componentName is RegisteredRecipeComponentName {
  return isRegisteredRecipeComponentName(componentName)
    && Object.prototype.hasOwnProperty.call(componentRegistry, componentName);
}

export function resolveRegisteredRecipeComponent(componentName: string): Component {
  if (!isRegisteredRecipeComponent(componentName)) {
    throw new Error(`Unknown recipe display component: ${componentName}`);
  }
  return componentRegistry[componentName];
}
