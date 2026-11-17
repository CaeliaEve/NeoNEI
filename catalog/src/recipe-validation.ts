import type {Fluid, Item, Recipe} from '@elysium/contracts';
import {validateNativeContainers} from './native-container.ts';
import {validateZeroFluidRecipe} from './zero-fluid.ts';
import {validateCircuitRecipe} from './circuit.ts';
import {validateRefineryRecipe} from './refinery.ts';
import {validateChiselRecipe} from './chisel.ts';
import {validateDistilleryRecipe} from './distillery.ts';
import {validateCreativeCoreRecipe} from './creativecore.ts';
import {validateEnchanterRecipe} from './enchanter.ts';
import {validateLumbermillRecipe} from './lumbermill.ts';
import {validateBloodRecipe} from './blood.ts';
import {validateBloodCalcinatorRecipe} from './blood-calcinator.ts';
import {validateInventoryProcessRecipe} from './inventory-process.ts';
import {validateImbuingRecipe} from './imbuing.ts';
import {validateBloodOrbRecipe} from './blood-orb.ts';
import {validateInscriberRecipe} from './inscriber.ts';
import {validateAeCraftingRecipe} from './ae-crafting.ts';
import {validateWirelessTerminalRecipe} from './wireless-terminal.ts';
import {validateProjectRedRecipe} from './projectred.ts';
import {validateBotaniaWorldRecipe} from './botania-world.ts';
import {validateNativeBrewingRecipe} from './native-brewing.ts';
import {validateArcaneSpecialRecipe} from './arcane-special.ts';
import {validateWitcherySpinningRecipe} from './witchery-spinning.ts';
import {validateWitchingSpinningRecipe} from './witching-spinning.ts';
import {validateNativeOvenRecipe} from './native-oven.ts';
import {validateNativeRitualRecipe} from './native-ritual.ts';
import {validateNativeInfusionRecipe} from './infusion.ts';
import {validateSalisWandRecipe} from './salis-wand.ts';
import {validateMatterManipulatorRecipe} from './matter-manipulator.ts';
import {validateBotaniaRecipe} from './botania.ts';
import {validateGendustryTemplateRecipe} from './gendustry-template.ts';
import {validateGendustryGeneticsRecipe} from './gendustry-genetics.ts';
import {validateGendustryFluidRecipe} from './gendustry-fluid.ts';
import {validateGtProbabilityRecipe} from './gt-probability.ts';
import {validateCalImprintRecipe} from './cal-imprint.ts';

type Validator = (recipe: Recipe, items?: ReadonlyMap<string, Item>, fluids?: ReadonlyMap<string, Fluid>) => void;
type ProcessKind = NonNullable<Recipe['process']>['kind'];
const botania: Validator = (recipe, items) => validateBotaniaRecipe(recipe, items);
const lumbermill: Validator = (recipe, items, fluids) =>
  validateLumbermillRecipe(recipe, items && fluids ? {items, fluids} : undefined);

const processes = new Map<ProcessKind, Validator>([
  ['calImprint', validateCalImprintRecipe],
  ['circuitFabricator', validateCircuitRecipe],
  ['galacticraftRefinery', validateRefineryRecipe],
  ['chisel', validateChiselRecipe],
  ['witcheryDistillery', validateDistilleryRecipe],
  ['creativeCoreCrafting', validateCreativeCoreRecipe],
  ['enderioEnchanter', validateEnchanterRecipe],
  ['binnieLumbermill', lumbermill],
  ['bloodmagic-altar', validateBloodRecipe],
  ['bloodmagic-binding', validateBloodRecipe],
  ['bloodmagic-meteor', validateBloodRecipe],
  ['bloodCalcinator', validateBloodCalcinatorRecipe],
  ['bloodAlchemy', validateInventoryProcessRecipe],
  ['logisticsSoldering', validateInventoryProcessRecipe],
  ['randomThingsImbuing', validateImbuingRecipe],
  ['bloodOrbCrafting', validateBloodOrbRecipe],
  ['inscriber', validateInscriberRecipe],
  ['aeCrafting', validateAeCraftingRecipe],
  ['wirelessTerminalUpgrade', validateWirelessTerminalRecipe],
  ['projectRedCrafting', validateProjectRedRecipe],
  ['botaniaWorld', validateBotaniaWorldRecipe],
  ['nativeBrewing', validateNativeBrewingRecipe],
  ['arcaneSpecial', validateArcaneSpecialRecipe],
  ['stickyJar', validateArcaneSpecialRecipe],
  ['witcherySpinning', validateWitcherySpinningRecipe],
  ['witchingSpinning', validateWitchingSpinningRecipe],
  ['witcheryNativeOven', validateNativeOvenRecipe],
  ['witcheryNativeRitual', validateNativeRitualRecipe],
  ['nativeInfusion', validateNativeInfusionRecipe],
  ['disguiseInfusion', validateNativeInfusionRecipe],
  ['nativeRunic', validateNativeInfusionRecipe],
  ['salisReplacement', validateSalisWandRecipe],
  ['matterManipulatorUpgrade', validateMatterManipulatorRecipe],
  ['nativeBotaniaPool', botania],
  ['nativeFloatingFlowers', botania],
  ['botaniaPool', botania],
  ['botaniaRunic', botania],
  ['floatingFlowers', botania],
  ['gendustryTemplate', validateGendustryTemplateRecipe],
  ['gendustryGenetics', validateGendustryGeneticsRecipe],
  ['gendustryFluid', validateGendustryFluidRecipe],
]);

// A missing/wrong process must not bypass a family's existing admission checks.
const handlers = new Map<string, Validator>([
  ['gregtech.nei.GTNEIImprintHandler', validateCalImprintRecipe],
  ['micdoodle8.mods.galacticraft.core.nei.CircuitFabricatorRecipeHandler', validateCircuitRecipe],
  ['de.katzenpapst.amunra.nei.recipehandler.ARCircuitFab', validateCircuitRecipe],
  ['micdoodle8.mods.galacticraft.core.nei.RefineryRecipeHandler', validateRefineryRecipe],
  ['WayofTime.alchemicalWizardry.client.nei.NEIAltarRecipeHandler', validateBloodRecipe],
  ['WayofTime.alchemicalWizardry.client.nei.NEIBindingRitualHandler', validateBloodRecipe],
  ['WayofTime.alchemicalWizardry.client.nei.NEIMeteorRecipeHandler', validateBloodRecipe],
  ['WayofTime.alchemicalWizardry.client.nei.NEICalcinatorHandler', validateBloodCalcinatorRecipe],
  ['WayofTime.alchemicalWizardry.client.nei.NEIAlchemyRecipeHandler', validateInventoryProcessRecipe],
  ['logisticspipes.nei.NEISolderingStationRecipeManager', validateInventoryProcessRecipe],
  ['WayofTime.alchemicalWizardry.client.nei.NEIBloodOrbShapedHandler', validateBloodOrbRecipe],
  ['WayofTime.alchemicalWizardry.client.nei.NEIBloodOrbShapelessHandler', validateBloodOrbRecipe],
  ['appeng.integration.modules.NEIHelpers.NEIInscriberRecipeHandler', validateInscriberRecipe],
  ['appeng.integration.modules.NEIHelpers.NEIAEShapedRecipeHandler', validateAeCraftingRecipe],
  ['appeng.integration.modules.NEIHelpers.NEIAEShapelessRecipeHandler', validateAeCraftingRecipe],
  ['net.p455w0rd.wirelesscraftingterminal.integration.modules.NEIHelpers.NEIAEShapedRecipeHandler', validateAeCraftingRecipe],
  ['mrtjp.projectred.core.libmc.recipe.PRShapedRecipeHandler', validateProjectRedRecipe],
  ['mrtjp.projectred.core.libmc.recipe.PRShapelessRecipeHandler', validateProjectRedRecipe],
  ['vazkii.botania.client.integration.nei.recipe.RecipeHandlerPureDaisy', validateBotaniaWorldRecipe],
  ['vazkii.botania.client.integration.nei.recipe.RecipeHandlerPetalApothecary', validateBotaniaWorldRecipe],
  ['vazkii.botania.client.integration.nei.recipe.RecipeHandlerElvenTrade', validateBotaniaWorldRecipe],
  ['vazkii.botania.client.integration.nei.recipe.RecipeHandlerBrewery', validateBotaniaWorldRecipe],
  ['vazkii.botania.client.integration.nei.recipe.RecipeHandlerManaPool', botania],
  ['vazkii.botania.client.integration.nei.recipe.RecipeHandlerRunicAltar', botania],
  ['vazkii.botania.client.integration.nei.recipe.RecipeHandlerFloatingFlowers', botania],
  ['lumien.randomthings.Handler.ModCompability.NEI.ImbuingStationRecipeHandler', validateImbuingRecipe],
  ['codechicken.nei.recipe.BrewingRecipeHandler', validateNativeBrewingRecipe],
  ['alkalus.main.nei.NEI_Handler_SpinningWheel', validateWitcherySpinningRecipe],
  ['witchinggadgets.client.nei.NEISpinningWheelHandler', validateWitchingSpinningRecipe],
  ['com.recursive_pineapple.matter_manipulator.client.nei.UpdateRecipeNEIHandler', validateMatterManipulatorRecipe],
  ['net.bdew.gendustry.nei.TemplateCraftingHandler', validateGendustryTemplateRecipe],
  ['net.bdew.gendustry.nei.ImprinterHandler', validateGendustryGeneticsRecipe],
  ['net.bdew.gendustry.nei.SamplerHandler', validateGendustryGeneticsRecipe],
  ['net.bdew.gendustry.nei.TransposerHandler', validateGendustryGeneticsRecipe],
  ['net.bdew.gendustry.nei.MutatronHandler', validateGendustryGeneticsRecipe],
  ['net.bdew.gendustry.nei.ReplicatorHandler', validateGendustryGeneticsRecipe],
  ['net.bdew.gendustry.nei.ExtractorHandler', validateGendustryGeneticsRecipe],
  ['net.bdew.gendustry.nei.LiquifierHandler', validateGendustryFluidRecipe],
  ['net.bdew.gendustry.nei.MutagenProducerHandler', validateGendustryFluidRecipe],
]);

type InputRule = Recipe['inputs'][number]['choices'][number]['rule']['kind'];
const inputRules = new Map<InputRule, Validator>([
  ['calInput', validateCalImprintRecipe],
  ['ae', validateInscriberRecipe],
  ['bloodmagic-altar', validateBloodRecipe],
  ['nativePoolInput', botania],
  ['matterManipulatorInput', validateMatterManipulatorRecipe],
  ['matterManipulatorUpgrade', validateMatterManipulatorRecipe],
]);
type OutputAction = NonNullable<Recipe['outputs'][number]['change']>['action']['kind'];
const outputActions = new Map<OutputAction, Validator>([
  ['calImprint', validateCalImprintRecipe],
  ['nativePoolResult', botania],
  ['nativeInfusionMerge', validateNativeInfusionRecipe],
  ['nativeInfusion', validateNativeInfusionRecipe],
  ['disguiseInfusion', validateNativeInfusionRecipe],
  ['salisWand', validateSalisWandRecipe],
  ['matterManipulator', validateMatterManipulatorRecipe],
]);

/** The same static dispatch guards stored rows and transported responses. */
export function validateRecipe(recipe: Recipe, items?: ReadonlyMap<string, Item>, fluids?: ReadonlyMap<string, Fluid>): void {
  validateZeroFluidRecipe(recipe);
  validateNativeContainers(recipe, items);
  validateGtProbabilityRecipe(recipe, items, fluids);
  const selected = new Set<Validator | undefined>([
    recipe.process ? processes.get(recipe.process.kind) : undefined,
    handlers.get(recipe.source.handler),
  ]);
  for (const input of recipe.inputs) for (const choice of input.choices) selected.add(inputRules.get(choice.rule.kind));
  for (const output of recipe.outputs) if (output.change) selected.add(outputActions.get(output.change.action.kind));
  for (const validate of selected) if (validate) validate(recipe, items, fluids);
}
