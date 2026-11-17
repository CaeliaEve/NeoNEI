import type {Recipe} from '@elysium/contracts';
import {ensure} from './store.ts';

/** Preserve the native process boundary even if an otherwise valid table strips the optional law. */
export function validateBloodRecipe(recipe:Recipe):void {
  const kinds:Record<string,string>={
    'WayofTime.alchemicalWizardry.client.nei.NEIAltarRecipeHandler':'bloodmagic-altar',
    'WayofTime.alchemicalWizardry.client.nei.NEIBindingRitualHandler':'bloodmagic-binding',
    'WayofTime.alchemicalWizardry.client.nei.NEIMeteorRecipeHandler':'bloodmagic-meteor',
  };
  const expected=kinds[recipe.source?.handler??''],p=recipe.process;
  if(expected)ensure(p?.kind===expected,'Native Blood Magic process is missing or mismatched');
  if(p?.kind!=='bloodmagic-altar'&&p?.kind!=='bloodmagic-binding'&&p?.kind!=='bloodmagic-meteor'){
    ensure(!recipe.inputs.some(i=>i.choices.some(c=>c.rule.kind==='bloodmagic-altar')),'Native altar predicate requires its process');
    return;
  }
  ensure(expected===p.kind&&recipe.source?.owner==='AWWayofTime','Invalid native Blood Magic origin');
  const i=recipe.inputs[0],c=i?.choices[0];
  ensure(recipe.inputs.length===1&&i?.kind==='item'&&i.slot===0&&i.choices.length===1&&c?.amount==='1'&&c.returns.length===0,'Invalid native Blood Magic ingredient');
  if(p.kind==='bloodmagic-altar'){
    ensure(c.rule.kind==='bloodmagic-altar','Altar native matching rule is missing');
    if(p.canBeFilled)ensure(c.consume.kind==='keep'&&p.result==='soul-network-charge'&&recipe.outputs.length===0
      &&p.orb?.requireOwner&&!p.orb.free,'Blood orb charging cannot become a crafted item or consume its orb');
    else ensure(c.consume.kind==='stack'&&p.result==='stack-conversion'&&recipe.outputs.length===1
      &&recipe.outputs[0]?.quantity?.kind==='bloodAltar','Altar conversion must retain whole-stack output');
  }else{
    ensure(c.consume.kind==='consume'&&c.rule.kind==='wildcard'&&c.rule.nbt,'Blood world ritual matching or consumption changed');
    if(p.kind==='bloodmagic-meteor')ensure(recipe.outputs.length===0&&p.result==='spatial-weighted-blocks','Meteor weights cannot become guaranteed products');
    else ensure(recipe.outputs.length===1&&p.result==='world-entity-after-cooldown','Binding must retain its world entity result');
  }
}
