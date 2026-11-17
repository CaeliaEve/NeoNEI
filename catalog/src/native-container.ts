import type {Item,Recipe} from '@elysium/contracts';
import {ariHandlers,isAriSource} from './magic-source.ts';

const handlers=new Set([
  'codechicken.nei.recipe.ShapedRecipeHandler','codechicken.nei.recipe.ShapelessRecipeHandler',
]);
const processes=new Set(['extremeCrafting','aeCrafting','ic2Advanced','projectRedCrafting','xuMicroblock',
  'matterManipulatorUpgrade','salisReplacement','arcaneSpecial','extraUtilsSoul','gendustryTemplate','bloodOrbCrafting']);

/** Dynamic returns are admitted only within a checked workbench lifecycle. */
export function validateNativeContainers(recipe:Recipe,items?:ReadonlyMap<string,Item>):void {
  for(const input of recipe.inputs)for(const choice of input.choices){
    const use=choice.consume;if(use.kind!=='nativeContainer')continue;
    const registries=use.callback==='ic2Cutter'?['IC2:itemToolCutter']:use.callback==='botaniaCosmetic'?['Botania:divaCharm','Botania:tinyPlanet']
      :use.callback==='botaniaBlackHole'?['Botania:blackHoleTalisman']
      :use.callback==='thaumicMortar'?['thaumicbases:mortar']:use.callback==='railFirestone'?['Railcraft:firestone.refined']:[];
    if(registries.length===0||input.kind!=='item'||choice.amount!=='1'||choice.returns.length!==0
      ||(!handlers.has(recipe.source.handler)&&!isAriSource(recipe.source,ariHandlers.shaped)
        &&!isAriSource(recipe.source,ariHandlers.shapeless)&&!processes.has(recipe.process?.kind??''))
      ||(items&&!registries.includes(items.get(choice.id)?.registry??'')))throw new Error('Invalid native crafting container callback');
  }
}
