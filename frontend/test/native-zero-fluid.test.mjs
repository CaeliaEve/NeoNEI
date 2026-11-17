import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {validateZeroFluidRecipe} from '../../catalog/src/zero-fluid.ts';

test('incubator zero cost retains the native fluid object gate without a debit',async()=>{
  const {recipe}=JSON.parse(await readFile(new URL('../../../elysium-compiler/contracts/fixtures/binnie-genetics-incubator-semantic-contract.json',import.meta.url),'utf8'));
  recipe.process.recipe.fluidInput.amount=0;
  const choice=recipe.inputs[1].choices[0];choice.amount='0';choice.consume={kind:'keep'};choice.rule={kind:'nativeZeroFluid',policy:'binnieIncubator'};
  assert.doesNotThrow(()=>validateZeroFluidRecipe(recipe));
  for(const change of [r=>r.source.handler='fixture:other',r=>r.process.recipe.fluidInput.amount=1,r=>r.inputs[1].choices[0].consume={kind:'staged'}]){
    const invalid=structuredClone(recipe);change(invalid);assert.throws(()=>validateZeroFluidRecipe(invalid),/Invalid native zero-fluid policy/);
  }
});
