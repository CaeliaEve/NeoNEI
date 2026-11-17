import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {nativeStateRules,nativeStateInputNote,nativeStateOutputNote} from '../src/catalog/native-state-rules.ts';

test('native altar charging, world rituals and nine genetic machines have separate language rule panels',async()=>{
  const names=['blood-altar','blood-binding','blood-meteor','blood-charging',
    ...['acclimatiser','sequencer','analyser','splicer','isolator','inoculator','genepool','incubator','polymeriser'].map(n=>'binnie-genetics-'+n)];
  for(const name of names){
    const {recipe}=JSON.parse(await readFile(new URL('../../../elysium-compiler/contracts/fixtures/'+name+'-semantic-contract.json',import.meta.url),'utf8'));
    const en=nativeStateRules(recipe.process,'en-US'),zh=nativeStateRules(recipe.process,'zh-CN');
    assert.ok(en,name+' has no English rule panel');assert.ok(zh,name+' has no Chinese rule panel');
    assert.equal(/\p{Script=Han}/u.test(JSON.stringify(en)),false,name+' mixes languages');
    assert.match(zh.title,/\p{Script=Han}/u);assert.ok(en.facts.length>0&&en.paragraphs.length>0);
    if(recipe.process.kind==='binnie_genetics'){
      for(const locale of ['zh-CN','en-US']){
        for(const input of recipe.inputs)for(const choice of input.choices){
          if(!['staged','buffer','wear'].includes(choice.consume.kind))continue;
          const note=nativeStateInputNote(recipe.process,input,choice,locale);
          assert.ok(note,name+' is missing a consumption explanation');
          assert.doesNotMatch(note,/air checkpoint|empty-cell|空气检查点|空单元/);
          if(locale==='en-US')assert.doesNotMatch(note,/\p{Script=Han}/u);
          if(choice.consume.kind==='buffer')assert.match(note,locale==='en-US'?/charges|accumulator/:/充量|累计量/);
        }
        for(const output of recipe.outputs)if(output.quantity?.kind==='potential'){
          const note=nativeStateOutputNote(recipe.process,output,locale);
          assert.ok(note);assert.doesNotMatch(note,/binnie:geneticTransform|nativeInputState/);
          assert.match(note,locale==='en-US'?/not.*guaranteed/:/不是保证/);
        }
      }
    }
    if(recipe.process.machine==='acclimatiser'){
      const packed=structuredClone(recipe.process);packed.effect=Math.fround(packed.effect);
      const rule=nativeStateRules(packed,'en-US');
      assert.equal(rule.facts.find(f=>f.label==='Tolerance effect').value,String(recipe.process.effect));
    }
    if(name==='blood-charging'){assert.match(en.paragraphs.join(' '),/keeps the orb/);assert.match(en.paragraphs.join(' '),/owner/);}
    if(name==='blood-meteor')assert.match(en.paragraphs.join(' '),/not guaranteed/);
  }
  assert.equal(nativeStateRules(null,'en-US'),null);
});
