export type UIPresentationFamily =
  | 'crafting'
  | 'gregtech'
  | 'botania'
  | 'thaumcraft'
  | 'blood_magic'
  | 'multiblock';

export type UIPresentationSurface =
  | 'workbench'
  | 'machine'
  | 'ritual'
  | 'research'
  | 'blueprint';

export type UIPresentationDensity = 'standard' | 'oversized';

export interface UIPresentationMeta {
  family: UIPresentationFamily;
  surface: UIPresentationSurface;
  density: UIPresentationDensity;
}

export interface UITypeConfig {
  uiType: string;
  component: string;
  presentation: UIPresentationMeta;
  hasCircuitSlots?: boolean;
  hasFluidSlots?: boolean;
  hasEnergyBar?: boolean;
  hasCentralElement?: boolean;
  hasRuneSlots?: boolean;
  hasInfusionSlots?: boolean;
  hasVisCost?: boolean;
  hasBloodBar?: boolean;
  inputLayout?: 'grid' | 'vertical' | 'circle';
}

export interface RecipePresentationProfile {
  uiConfig: UITypeConfig;
  component: string;
  renderMode: 'component' | 'detailed_crafting';
  reason: string;
  sourceUiType: string;
}

function presentation(
  family: UIPresentationFamily,
  surface: UIPresentationSurface,
  density: UIPresentationDensity = 'standard',
): UIPresentationMeta {
  return Object.freeze({ family, surface, density });
}

function renderer(
  uiType: string,
  component: string,
  presentationMeta: UIPresentationMeta,
  options: Omit<UITypeConfig, 'uiType' | 'component' | 'presentation'> = {},
): UITypeConfig {
  return Object.freeze({ uiType, component, presentation: presentationMeta, ...options });
}

const UI_CONFIG_BY_RENDERER_ID: Readonly<Record<string, UITypeConfig>> = Object.freeze({
  native_nei: renderer('native_nei', 'NEIRecipeWidget', presentation('crafting', 'machine')),
  standard_crafting: renderer('standard_crafting', 'StandardCraftingUI', presentation('crafting', 'workbench')),
  avaritia_extreme_crafting: renderer('avaritia_extreme_crafting', 'AvaritiaExtremeCraftingUI', presentation('crafting', 'workbench', 'oversized')),
  furnace: renderer('furnace', 'FurnaceUI', presentation('crafting', 'machine')),
  gt_generic: renderer('gt_generic', 'GTUniversalMachineUI', presentation('gregtech', 'machine'), { hasFluidSlots: true, hasEnergyBar: true }),
  gt_research_station: renderer('gt_research_station', 'GTResearchStationUI', presentation('gregtech', 'research'), { hasEnergyBar: true }),
  gt_assembler: renderer('gt_assembler', 'GTAssemblerUI', presentation('gregtech', 'machine'), { hasCircuitSlots: true, hasFluidSlots: true, hasEnergyBar: true, inputLayout: 'grid' }),
  gt_assembly_line: renderer('gt_assembly_line', 'GTAssemblyLineUI', presentation('gregtech', 'machine', 'oversized'), { hasCircuitSlots: true, hasFluidSlots: true, hasEnergyBar: true }),
  gt_alloy_smelter: renderer('gt_alloy_smelter', 'GTAlloySmelterUI', presentation('gregtech', 'machine'), { hasEnergyBar: true }),
  gt_chemical_reactor: renderer('gt_chemical_reactor', 'GTChemicalReactorUI', presentation('gregtech', 'machine', 'oversized'), { hasFluidSlots: true, hasEnergyBar: true }),
  industrial_slaughterhouse: renderer('industrial_slaughterhouse', 'IndustrialSlaughterhouseUI', presentation('gregtech', 'machine', 'oversized'), { hasFluidSlots: true, hasEnergyBar: true, hasCentralElement: true }),
  gt_molecular: renderer('gt_molecular', 'GTMolecularUI', presentation('gregtech', 'machine'), { hasEnergyBar: true }),
  gt_electrolyzer: renderer('gt_electrolyzer', 'GTElectrolyzerUI', presentation('gregtech', 'machine'), { hasFluidSlots: true, hasEnergyBar: true }),
  gt_blast_furnace: renderer('gt_blast_furnace', 'GTBlastFurnaceUI', presentation('gregtech', 'machine'), { hasEnergyBar: true }),
  gt_electric_furnace: renderer('gt_electric_furnace', 'GTElectricFurnaceUI', presentation('gregtech', 'machine'), { hasEnergyBar: true }),
  botania_mana_pool: renderer('botania_mana_pool', 'BotaniaPoolUI', presentation('botania', 'ritual'), { hasCentralElement: true, inputLayout: 'vertical' }),
  botania_pure_daisy: renderer('botania_pure_daisy', 'BotaniaPureDaisyUI', presentation('botania', 'ritual'), { hasCentralElement: true, inputLayout: 'circle' }),
  botania_terra_plate: renderer('botania_terra_plate', 'BotaniaTerraPlateUI', presentation('botania', 'ritual'), { hasCentralElement: true, inputLayout: 'circle' }),
  botania_rune_altar: renderer('botania_rune_altar', 'BotaniaRuneAltarUI', presentation('botania', 'ritual'), { hasEnergyBar: true }),
  botania_elven_trade: renderer('botania_elven_trade', 'BotaniaElvenTradeUI', presentation('botania', 'ritual'), { hasCentralElement: true }),
  thaumcraft_arcane: renderer('thaumcraft_arcane', 'ThaumcraftArcaneUI', presentation('thaumcraft', 'workbench'), { hasRuneSlots: true, hasVisCost: true }),
  thaumcraft_infusion: renderer('thaumcraft_infusion', 'ThaumcraftInfusionUI', presentation('thaumcraft', 'ritual', 'oversized'), { hasCentralElement: true, hasInfusionSlots: true, hasVisCost: true }),
  thaumcraft_crucible: renderer('thaumcraft_crucible', 'ThaumcraftCrucibleUI', presentation('thaumcraft', 'ritual'), { hasCentralElement: true, hasVisCost: true }),
  thaumcraft_aspect: renderer('thaumcraft_aspect', 'ThaumcraftAspectUI', presentation('thaumcraft', 'research'), { hasCentralElement: true, hasVisCost: true }),
  thaumcraft_research: renderer('thaumcraft_research', 'ThaumcraftResearchUI', presentation('thaumcraft', 'research'), { hasEnergyBar: true }),
  blood_magic_altar: renderer('blood_magic_altar', 'BloodMagicAltarUI', presentation('blood_magic', 'ritual', 'oversized'), { hasBloodBar: true }),
  blood_alchemy_table: renderer('blood_alchemy_table', 'BloodAlchemyTableUI', presentation('blood_magic', 'ritual'), { hasBloodBar: true }),
  blood_binding_ritual: renderer('blood_binding_ritual', 'BloodBindingRitualUI', presentation('blood_magic', 'ritual'), { hasCentralElement: true }),
  blood_orb_crafting: renderer('blood_orb_crafting', 'BloodOrbCraftingUI', presentation('blood_magic', 'ritual'), { hasCentralElement: true }),
  multiblock_blueprint: renderer('multiblock_blueprint', 'MultiblockBlueprintUI', presentation('multiblock', 'blueprint', 'oversized'), { hasCentralElement: true }),
});

export function resolveRecipePresentationProfileByRendererId(
  rendererId: string,
  options?: {
    reason?: string;
    presentationOverrides?: Partial<UIPresentationMeta>;
    preferDetailedCrafting?: boolean;
  },
): RecipePresentationProfile | null {
  const normalizedRendererId = rendererId.trim();
  const config = UI_CONFIG_BY_RENDERER_ID[normalizedRendererId];
  if (!config) return null;
  const uiConfig: UITypeConfig = options?.presentationOverrides
    ? Object.freeze({
      ...config,
      presentation: Object.freeze({ ...config.presentation, ...options.presentationOverrides }),
    })
    : config;
  return Object.freeze({
    uiConfig,
    component: uiConfig.component,
    renderMode: options?.preferDetailedCrafting && normalizedRendererId === 'standard_crafting'
      ? 'detailed_crafting'
      : 'component',
    reason: options?.reason ?? `renderer_id:${normalizedRendererId}`,
    sourceUiType: normalizedRendererId,
  });
}
