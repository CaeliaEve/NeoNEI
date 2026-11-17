import assert from 'node:assert/strict';
import test from 'node:test';

test('shared exact material aggregation never rounds large decimals or batch integers',async()=>{
  const module=await import('../../catalog/src/material-quantity.ts').catch(()=>({}));
  assert.equal(typeof module.addMaterialQuantities,'function','exact material aggregation is still recipe-tool-only');
  assert.equal(module.addMaterialQuantities('9007199254740993.125','0.875'),'9007199254740994');
  assert.equal(module.multiplyQuantity('1.125',9007199254740993n),'10133099161583617.125');
  assert.equal(module.parseBatches(' 9007199254740993 '),9007199254740993n);
  assert.equal(module.addMaterialQuantities('-0.125','0.1'),'-0.025');
});

test('shared material classification takes locale explicitly and retains conditional quantities',async()=>{
  const module=await import('../src/catalog/materials.ts').catch(()=>({}));
  assert.equal(typeof module.calculateMaterials,'function','material domain helper has not been separated from the recipe tool');
  const recipe={id:'r',inputs:[{kind:'item',slot:0,choices:[{id:'iron',amount:'0.125',
    rule:{kind:'exact'},consume:{kind:'consume'},returns:[]}]}],outputs:[
    {kind:'item',slot:0,role:'result',id:'result',amount:'9007199254740993',
      chance:{numerator:'1',denominator:'3'},change:null,quantity:null}],process:null};
  const locale={language:'en-US',t:(value,...args)=>'en:'+value.replace(/\{(\d+)\}/g,(_,i)=>String(args[Number(i)]))};
  const before=structuredClone(recipe),result=module.calculateMaterials(recipe,'3',{},locale);
  assert.equal(result.inputs[0].amount,'0.375');
  assert.deepEqual(result.outputs,[]);
  assert.equal(result.uncertain[0].amount,null);
  assert.ok(result.uncertain[0].note.startsWith('en:'));
  assert.deepEqual(recipe,before);
});
