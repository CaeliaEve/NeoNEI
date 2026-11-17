import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {encode} from '@msgpack/msgpack';
import {canonical,decodeTable} from '@elysium/contracts';

const fixture=async name=>JSON.parse(await readFile(new URL('../../../elysium-compiler/contracts/fixtures/'+name,import.meta.url),'utf8'));

test('mana pool keeps signed native parameters including MIN_VALUE without promising a refill',async()=>{
  const module=await import('../../catalog/src/botania.ts'),{recipe}=await fixture('botania-pool-native-0-en_US-contract.json');
  for(const mana of [-2147483648,-50,0,2147483647]){
    const sample=structuredClone(recipe);sample.process.mana=mana;
    module.validateBotaniaRecipe(sample);
    assert.match(module.botaniaNote(sample.process,'en-US'),/signed|integer/);
    for(let state=0;state<3;state++){
      const en=await fixture(`botania-pool-signed-${mana}-${state}-en_US-contract.json`),zh=await fixture(`botania-pool-signed-${mana}-${state}-zh_CN-contract.json`);
      const native=decodeTable(encode({kind:'recipes',records:[en.recipe]}),'recipes').records[0];
      assert.equal(native.process.mana,mana);assert.equal(native.id,zh.recipe.id);
      module.validateBotaniaRecipe(native);
    }
  }
  for(const mana of [-2147483649,2147483648,NaN])assert.throws(()=>module.validateBotaniaRecipe({...recipe,process:{...recipe.process,mana}}));
});

test('Botania follows 341 native greedy and hidden-priority probes instead of free permutation',async()=>{
  const module=await import('../../catalog/src/botania.ts').catch(()=>null);
  assert.ok(module,'Native Botania matcher, contract and locale rules are missing');
  const rows=await Promise.all([0,1,2].map(i=>fixture(`botania-runic-greedy-${i}-contract.json`)));
  const parity=await fixture('botania-runic-greedy-parity.json');
  assert.equal(parity.length,341);
  for(const row of rows)module.validateBotaniaRecipe(row.recipe,new Map(row.items.map(i=>[i.id,i])));
  for(const probe of parity)for(const [index,row]of rows.entries()){
    const offered=[...probe.offered,...Array(16-probe.offered.length).fill(null)];
    assert.equal(module.botaniaRunicSelect(row.recipe.process,offered)!==null,probe.winner===[0,2,3][index],JSON.stringify({index,...probe}));
  }
  const p=rows[0].recipe.process,iron={registry:'minecraft:iron_ingot',meta:0},gold={registry:'minecraft:gold_ingot',meta:0};
  assert.equal(module.botaniaRunicSelect(p,[iron,gold,...Array(14).fill(null)]),null);
  assert.notEqual(module.botaniaRunicSelect(p,[gold,iron,...Array(14).fill(null)]),null);
  assert.equal(module.botaniaRunicSelect(p,[gold,null,iron,...Array(13).fill(null)]),null);
  const invalid=structuredClone(rows[0].recipe);invalid.process=null;
  assert.throws(()=>module.validateBotaniaRecipe(invalid));
});

test('Botania typed conditions keep Chinese and English separate and results conditional',async()=>{
  const module=await import('../../catalog/src/botania.ts').catch(()=>null);
  assert.ok(module,'Botania localized process notes are missing');
  const {calculateMaterials}=await import('./helpers/materials.mjs');
  for(const family of ['pool','runic','floating']){
    const [en,zh]=await Promise.all(['en_US','zh_CN'].map(locale=>fixture(`botania-${family}-native-0-${locale}-contract.json`)));
    assert.equal(en.recipe.id,zh.recipe.id);
    assert.deepEqual(en.recipe.properties,{});
    const decoded=decodeTable(encode({kind:'recipes',records:[en.recipe]}),'recipes').records[0];
    const identity=Object.fromEntries(['source','category','inputs','outputs','duration','energy','grid','magic','process'].map(k=>[k,decoded[k]]));identity.properties={};
    // Dynamic render samples and binding indices are outside stable recipe identity.
    identity.outputs=decoded.outputs.map(out=>{
      if(out.change==null)return out;
      const {id,amount,change,...stable}=out,{samples,bindings,...operation}=change;
      return {...stable,change:operation};
    });
    assert.equal('recipe_'+createHash('sha256').update(canonical(identity)).digest('hex'),en.recipe.id);
    module.validateBotaniaRecipe(en.recipe,new Map(en.items.map(i=>[i.id,i])));
    const english=module.botaniaNote(en.recipe.process,'en-US'),chinese=module.botaniaNote(zh.recipe.process,'zh-CN');
    assert.match(chinese,/\p{Script=Han}/u);assert.doesNotMatch(english,/\p{Script=Han}/u);
    assert.notEqual(english,chinese);
    assert.deepEqual(calculateMaterials(en.recipe,'10').outputs,[]);
    assert.ok(calculateMaterials(en.recipe,'10').uncertain.length>0);
    assert.throws(()=>module.validateBotaniaRecipe({...en.recipe,process:null}));
    assert.throws(()=>module.validateBotaniaRecipe({...en.recipe,duration:'60'}));
  }
});
