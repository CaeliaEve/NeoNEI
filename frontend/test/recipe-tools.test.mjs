import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { effectScope, nextTick, ref, shallowRef } from 'vue';

const choice = (id, amount = '1', consume = { kind: 'consume' }, returns = []) => ({ id, amount, consume, returns, rule: { kind: 'exact' } });
const input = (slot, choices, kind = 'item') => ({ slot, kind, choices });
const output = (id, amount = '1', rest = {}) => ({ id, amount, slot: 0, kind: 'item', role: 'result', chance: { numerator: '1', denominator: '1' }, ...rest });
const recipe = (inputs = [], outputs = []) => ({ id: 'recipe-a', category: 'category', order: 0, inputs, outputs, properties: {}, source: { mod: 'fixture', handler: 'fixture' } });

test('extreme repair or earlier selectors keep the registered result conditional',async()=>{
  const calculate=await materials();
  for(const name of ['priority','repair']) {
    const fixture=JSON.parse(readFileSync(new URL(`../../../elysium-compiler/contracts/fixtures/native-extreme-${name}-contract.json`,import.meta.url),'utf8'));
    const result=calculate(fixture.recipe,'3');
    assert.deepEqual(result.outputs,[]);assert.match(result.uncertain.find(row=>row.id===fixture.recipe.outputs[0].id).note,/修理.*注册顺序/);
  }
});

test('AE2 literal wildcard dust remains a conditional input instead of ordinary display-item stock',async()=>{
  const calculate=await materials();
  const fixture=JSON.parse(readFileSync(new URL('../../../elysium-compiler/contracts/fixtures/ae-world-ender-wildcard-contract.json',import.meta.url),'utf8'));
  const id=fixture.recipe.inputs[1].choices[0].id,result=calculate(fixture.recipe,'3');
  assert.ok(!result.inputs.some(row=>row.id===id));
  assert.equal(result.uncertain.find(row=>row.id===id)?.amount,'3');
  assert.match(result.uncertain.find(row=>row.id===id)?.note??'',/32767/);
});
async function materials() {
  const module = await import('./helpers/materials.mjs').catch(() => null);
  assert.ok(module, 'materials calculator is not implemented');
  return module.calculateMaterials;
}

test('installed GT tool consumption keeps one reusable tool and conditional native wear',async()=>{
  const calculate=await materials();
  for(const name of ['physical','electric']) {
    const fixture=JSON.parse(readFileSync(new URL(`../../../elysium-compiler/contracts/fixtures/native-crafting-tool-${name}-contract.json`,import.meta.url),'utf8'));
    const result=calculate(fixture.recipe,'3');
    assert.deepEqual(result.inputs,[]);
    assert.equal(result.tools.length,1);assert.equal(result.tools[0].amount,'1');
    assert.match(result.tools[0].note,/200.*原生/);
    if(name==='electric')assert.match(result.tools[0].note,/成功耗电.*1\/25/);
    else assert.match(result.tools[0].note,/损坏.*消失/);
  }
});

test('native crafting containers keep wear conditional and cosmetics input-dependent',async()=>{
  const calculate=await materials();
  const {nativeContainerNote}=await import('../src/catalog/native-container.ts');
  for(const [name,callback] of [['cutter','ic2Cutter'],['cosmetic','botaniaCosmetic']]) {
    const {recipe:r}=JSON.parse(readFileSync(new URL(`../../../elysium-compiler/contracts/fixtures/native-container-${name}-contract.json`,import.meta.url),'utf8'));
    const result=calculate(r,'100');
    assert.deepEqual(result.returns,[]);
    if(name==='cutter') {
      assert.deepEqual(result.inputs,[]);assert.equal(result.tools.length,1);assert.equal(result.tools[0].amount,'1');
      assert.match(result.tools[0].note,/附魔.*损坏/);
    } else {
      assert.equal(result.inputs[0].amount,'100');
      assert.ok(result.uncertain.some(row=>row.id===r.inputs[0].choices[0].id&&row.amount===null));
      assert.match(result.uncertain[0].note,/cosmeticItem/);
    }
    const en=nativeContainerNote({kind:'nativeContainer',callback},'en_US');
    assert.doesNotMatch(en,/[\u3400-\u9fff]/);
    assert.notEqual(en,nativeContainerNote({kind:'nativeContainer',callback},'zh_CN'));
  }
});

test('native multi-input NBT result remains conditional without inventory placement facts', async () => {
  const calculate = await materials();
  const r = recipe([input(0,[choice('left')]),input(1,[choice('right')])],
    [output('base','3',{change:{input:0,action:{kind:'craftingNbt',base:{id:'base',amount:'3'}},samples:[{id:'base'},{id:'left-result'},{id:'right-result'}]}})]);
  r.process = {kind:'craftingNbt'};
  const result = calculate(r,'2');
  assert.deepEqual(result.outputs,[]);
  assert.match(result.uncertain[0].note,/最后.*标签.*镜像/);
  const gt=JSON.parse(readFileSync(new URL('../../../elysium-compiler/contracts/fixtures/native-gt-crafting-shaped-contract.json',import.meta.url),'utf8'));
  const native=calculate(gt.recipe,'2');assert.deepEqual(native.outputs,[]);
  assert.match(native.uncertain[0].note,/归一化.*标签.*电量.*摆放/);
});

test('Soul lifecycle results stay uncertain and explain player ownership and health', async()=>{
  const calculate=await materials();
  const r=JSON.parse(readFileSync(new URL('../../../elysium-compiler/contracts/fixtures/native-extrautils-soul-contract.json',import.meta.url),'utf8')).recipe;
  const {assertTable}=await import('@elysium/contracts');assertTable({kind:'recipes',records:[r]});
  const result=calculate(r,'3');
  assert.deepEqual(result.inputs.map(({id,amount})=>[id,amount]),[[r.process.sword,'3']]);
  assert.deepEqual(result.outputs,[]);
  assert.match(result.uncertain[0].note,/玩家.*生命/);
  assert.match(result.uncertain[0].note,/归属/);
});

test('actual decay fresh-state transport keeps whole-stack input and native batch explanation',async()=>{
  const row=JSON.parse(readFileSync(new URL('../../../elysium-compiler/contracts/fixtures/native-decay-fresh-contract.json',import.meta.url),'utf8')).recipe;
  const {assertTable}=await import('@elysium/contracts');assertTable({kind:'recipes',records:[row]});
  const {decayNote}=await import('../../catalog/src/decay.ts');
  const result=(await materials())(row,'3');
  assert.deepEqual(result.inputs,[]);assert.ok(result.uncertain.some(input=>input.id===row.process.input));
  assert.equal(result.outputs[0].amount,'3');assert.equal(row.duration,null);
  assert.match(decayNote(row.process),/107374183 批/);assert.match(decayNote(row.process),/整个存储堆叠/);
  assert.match(decayNote(row.process,'en-US'),/no root NBT/);assert.match(decayNote(row.process,'en-US'),/no|prevent a fixed duration/);
});

test('actual native saved decay batches preserve faults, NBT coercions and signed overflow',async()=>{
  const {decayBatch}=await import('../../catalog/src/decay-state.ts');
  const cases=JSON.parse(readFileSync(new URL('../../../elysium-compiler/contracts/fixtures/native-decay-state-parity.json',import.meta.url),'utf8'));
  assert.equal(cases.length,336);
  for(const {threshold,...expected}of cases){const before=JSON.stringify(expected.input);assert.deepEqual(decayBatch(threshold,expected.input),expected,`threshold=${threshold}`);assert.equal(JSON.stringify(expected.input),before);}
});

test('saved decay transport never counts every tagged input as a certain result',async()=>{
  const row=JSON.parse(readFileSync(new URL('../../../elysium-compiler/contracts/fixtures/native-decay-state-contract.json',import.meta.url),'utf8')).recipe;
  const {assertTable}=await import('@elysium/contracts');assertTable({kind:'recipes',records:[row]});
  const result=(await materials())(row,'3');assert.deepEqual(result.inputs,[]);assert.deepEqual(result.outputs,[]);
  assert.match(result.uncertain.find(output=>output.id===row.process.output).note,/已保存.*状态.*原生异常/);
  const {decayNote}=await import('../../catalog/src/decay.ts');assert.match(decayNote(row.process),/类型错误.*不产出/);assert.match(decayNote(row.process,'en-US'),/native fault without producing an output/);
});

test('actual molecular transformer transport keeps total energy, zero-presence and output merge conditions',async()=>{
  const {assertTable}=await import('@elysium/contracts');const {molecularTransformerNote}=await import('../../catalog/src/solar.ts');
  for(const name of ['native-solar','native-solar-zero']){
    const row=JSON.parse(readFileSync(new URL(`../../../elysium-compiler/contracts/fixtures/${name}-contract.json`,import.meta.url),'utf8')).recipe;
    assertTable({kind:'recipes',records:[row]});const totals=(await materials())(row,'3');assert.deepEqual(totals.outputs,[]);
    assert.match(totals.uncertain.find(output=>output.id===row.process.output).note,/已有堆叠.*NBT/);
    assert.equal(row.duration,null);assert.equal(row.energy,null);
    assert.match(molecularTransformerNote(row.process),/每次加工总能量.*EU.*不是 EU\/t/);
    assert.match(molecularTransformerNote(row.process,'en-US'),/matching existing output keeps its own NBT/);
    if(name==='native-solar-zero'){assert.equal(totals.tools[0].amount,'1');assert.deepEqual(totals.inputs,[]);}
    else assert.equal(totals.inputs[0].amount,'9');
  }
});

test('actual refinery transport retains drain-before-rejected-fill uncertainty and native timing',async()=>{
  const {assertTable}=await import('@elysium/contracts');const {validateRefineryRecipe,refineryNote}=await import('../../catalog/src/refinery.ts');
  for(const name of ['native-refinery','native-refinery-alternate','native-refinery-legacy','native-refinery-legacy-alternate']){
    const row=JSON.parse(readFileSync(new URL(`../../../elysium-compiler/contracts/fixtures/${name}-contract.json`,import.meta.url),'utf8')).recipe;
    assertTable({kind:'recipes',records:[row]});validateRefineryRecipe(row);const total=(await materials())(row,'3');
    assert.equal(total.inputs[0].amount,'3');assert.deepEqual(total.outputs,[]);
    assert.match(total.uncertain.find(o=>o.id===row.process.output).note,/原油先扣除.*NBT.*写入失败/);
    assert.match(refineryNote(row.process),/可能扣油却无产出/);assert.match(refineryNote(row.process,'en-US'),/reject the fill after oil is consumed/);
    for(const change of [r=>r.process=null,r=>r.process.countdownTicks=3,r=>r.outputs[0].amount='1',r=>r.outputs[0].quantity.condition='always']){
      const bad=structuredClone(row);change(bad);assert.throws(()=>validateRefineryRecipe(bad));
    }
  }
});

test('actual circuit law retains native empty slots, raw versus quick count and conditional drops',async()=>{
  const {assertTable}=await import('@elysium/contracts');
  const {validateCircuitRecipe,circuitNote}=await import('../../catalog/src/circuit.ts');
  for(const name of ['native-circuit-law','native-circuit-quick','native-circuit-empty','native-circuit-amunra']){
    const row=JSON.parse(readFileSync(new URL(`../../../elysium-compiler/contracts/fixtures/${name}-contract.json`,import.meta.url),'utf8')).recipe;
    assertTable({kind:'recipes',records:[row]});validateCircuitRecipe(row);
    assert.equal(row.duration,null);assert.equal(row.process.slots.length,5);
    assert.equal(row.outputs[0].slot,6);assert.deepEqual(row.properties,{});
    const totals=(await materials())(row,'3');assert.deepEqual(totals.outputs,[]);
    assert.match(totals.uncertain.find(output=>output.id===row.outputs[0].id).note,/超过 64.*不带模板 NBT.*掉落/);
    assert.match(circuitNote(row.process),/先用原始产量.*快速模式/);assert.match(circuitNote(row.process,'en-US'),/ignores spawn failure/);
    for(const mutate of [r=>r.process=null,r=>r.process.slots[4]='missing',r=>r.outputs[0].quantity.condition='always',r=>r.duration='300']){
      const bad=structuredClone(row);mutate(bad);assert.throws(()=>validateCircuitRecipe(bad));
    }
    if(name==='native-circuit-empty')assert.deepEqual(row.inputs,[]);
    if(name==='native-circuit-quick'){assert.equal(row.process.rawOutputAmount,'1');assert.equal(row.process.outputAmount,'5');}
  }
});

test('banner material notes preserve history and native dye correlation',async()=>{
  const calculate=await materials();
  const banner={...choice('banner'),rule:{kind:'bannerInput',maxPatterns:6}};
  const r=recipe([input(0,[banner]),input(1,[choice('dye')])],
    [output('pattern','1',{change:{input:0,action:{kind:'bannerPattern',pattern:'br',color:14},samples:[{id:'pattern',amount:'1'}]}})]);
  r.process={kind:'bannerPattern',mode:'mask',maxPatterns:6,color:14};
  const result=calculate(r,'2');
  assert.match(result.inputs.find(row=>row.id==='banner').note,/六.*图案/);
  assert.match(result.uncertain[0].note,/原有.*图案/);
  assert.match(result.uncertain[0].note,/染料.*颜色/);
  assert.deepEqual(result.outputs,[]);
});

test('oven material notes keep genome admission and conditional jar debit visible', async () => {
  const calculate=await materials();
  const wood={...choice('wood'),rule:{kind:'witcheryOvenNbt',meta:false,product:'exhale'}};
  const r=recipe([input(0,[wood]),input(1,[choice('jar','3',{kind:'allocated'})])],
    [output('charcoal','1'),output('exhale',null,{slot:1,quantity:{kind:'potential',nominal:'1',stat:'witchery:ovenByproduct',condition:'nativeJarRollAndOutputAccepts'}})]);
  r.process={kind:'witcheryOven'};
  const result=calculate(r,'10');
  assert.deepEqual(result.inputs.map(({id,amount})=>[id,amount]),[['wood','10']]);
  assert.match(result.inputs[0].note,/橡树/);
  assert.match(result.uncertain.find(row=>row.id==='jar').note,/只.*实际.*一.*罐/);
  assert.match(result.uncertain.find(row=>row.id==='exhale').note,/副产物槽/);
});

test('native drop and altar amounts stay conditional and carry useful material notes', async () => {
  const calculate=await materials();
  const harvest=calculate(recipe([], [output('crop',null,{quantity:{kind:'harvest',nominal:'1'}})]),'8');
  assert.deepEqual(harvest.outputs,[]);
  assert.match(harvest.uncertain[0].note,/抽取/);
  const altar=calculate(recipe([input(0,[choice('stack','1',{kind:'stack'})])],
    [output('converted',null,{quantity:{kind:'bloodAltar',nominal:'3'}})]),'8');
  assert.deepEqual(altar.outputs,[]);
  assert.match(altar.uncertain[1].note,/整叠/);
});

test('lumbermill water gate describes continuous partial drain rather than emptying the buffer', async () => {
  const calculate=await materials();
  const r=recipe([input(0,[choice('water','5',{kind:'allocated'})],'fluid')]);
  r.process={kind:'binnieLumbermill',fluidGate:5,fluidDrainLimit:10};
  const result=calculate(r,'4');
  assert.deepEqual(result.inputs,[]);
  assert.match(result.uncertain[0].note,/每.*工作.*10/);
  assert.doesNotMatch(result.uncertain[0].note,/耗尽/);
});

test('genetic buffers, random labware and Chisel wear stay conditional with readable notes', async () => {
  const calculate=await materials();
  const pool=recipe([input(0,[choice('ethanol','1',{kind:'buffer'})],'fluid')]);
  pool.process={kind:'binnie_genetics',machine:'genepool'};
  const buffer=calculate(pool,'100');
  assert.deepEqual(buffer.inputs,[]);
  assert.match(buffer.uncertain[0].note,/工作 tick/);
  assert.doesNotMatch(buffer.uncertain[0].note,/耗尽/);
  const sampler=JSON.parse(readFileSync(new URL('../../../elysium-compiler/contracts/fixtures/gendustry-sampler-native-0-en_US-contract.json',import.meta.url),'utf8')).recipe;
  const random=calculate(sampler,'100');
  assert.deepEqual(random.inputs,[]);
  assert.match(random.uncertain.find(row=>row.id===sampler.inputs.find(input=>input.slot===sampler.process.slots.labware).choices[0].id).note,/37\/100/);
  const chisel=recipe([input(1,[choice('chisel','1',{kind:'keep'})])],[output('target',null,{quantity:{kind:'potential',stat:'chisel:selection',condition:'compatibleToolAndNativeTarget',nominal:'1'}})]);
  chisel.process={kind:'chisel'};
  const changed=calculate(chisel,'4');
  assert.match(changed.tools[0].note,/损耗/);
  assert.doesNotMatch(changed.uncertain[0].note,/compatibleToolAndNativeTarget/);
});

test('actual acclimatiser inputs describe individual mutation and reagent selection without blast-furnace consumption', async () => {
  const calculate=await materials();
  const {language}=await import('../src/i18n/index.ts');
  const row=JSON.parse(readFileSync(new URL('../../../elysium-compiler/contracts/fixtures/binnie-genetics-acclimatiser-semantic-contract.json',import.meta.url),'utf8')).recipe;
  try {
    for(const locale of ['zh-CN','en-US']){
      language.value=locale;
      const result=calculate(row,'100');
      assert.deepEqual(result.inputs,[]);
      const reagent=result.uncertain.find(r=>r.id===row.inputs[1].choices[0].id);
      const individual=result.uncertain.find(r=>r.id===row.inputs[0].choices[0].id&&r.amount===null);
      assert.match(reagent.note,locale==='en-US'?/first.*item.*meta.*reagent/i:/第一个.*物品.*元数据.*试剂/);
      assert.match(individual.note,locale==='en-US'?/individual.*tolerance/i:/个体.*耐性/);
      assert.doesNotMatch(result.uncertain.map(r=>r.note).join(' '),/air checkpoint|empty-cell|container|空气|空单元|容器/i);
    }
  } finally { language.value='zh-CN'; }
});

// A Number conversion or summing all candidates breaks these literal totals.
test('materials sum exact decimal amounts and preserve integers above Number precision', async () => {
  const calculate = await materials();
  const result = calculate(recipe([
    input(0, [choice('iron', '9007199254740993.125')]),
    input(1, [choice('iron', '0.625')]),
    input(0, [choice('iron', '1')], 'fluid'),
  ], [output('plate', '0.25')]), '3');
  assert.deepEqual(result.inputs.map(({ kind, id, amount }) => ({ kind, id, amount })), [
    { kind: 'item', id: 'iron', amount: '27021597764222981.25' },
    { kind: 'fluid', id: 'iron', amount: '3' },
  ]);
  assert.equal(result.outputs[0].amount, '0.75');
  assert.equal(calculate(recipe([input(0, [choice('iron', '2')])]), '9007199254740993').inputs[0].amount, '18014398509481986');
});

test('batch validation rejects zero, negative, fractional and non-decimal counts', async () => {
  const calculate = await materials();
  for (const batches of ['', '0', '-1', '1.5', '1e3', 'Infinity', '2x']) assert.throws(() => calculate(recipe(), batches), /正整数/);
});

test('QED successful batches consume each occupied cell without crafting container returns', async () => {
  const calculate = await materials();
  const r = recipe([input(0, [choice('filled-container')]), input(1, [choice('filled-container')])], [output('result', '3')]);
  r.process = { kind: 'qed', enderFlux: '20000', earlier: [] };
  r.grid = { width: 3, height: 1, cells: [0, null, 1], mirror: true };
  const result = calculate(r, '4');
  assert.deepEqual(result.inputs.map(row => [row.id, row.amount]), [['filled-container', '8']]);
  assert.deepEqual(result.outputs.map(row => [row.id, row.amount]), [['result', '12']]);
  assert.deepEqual(result.returns, []);
  assert.deepEqual(result.tools, []);
  assert.deepEqual(result.uncertain, []);
});

test('only the selected candidate contributes materials and its returns', async () => {
  const calculate = await materials();
  const r = recipe([input(0, [choice('water-cell', '1', { kind: 'consume' }, [{ kind: 'item', id: 'cell', amount: '1' }]), choice('water-can', '2')])]);
  const result = calculate(r, '4', { inputitem0: 1 });
  assert.deepEqual(result.inputs.map(row => [row.id, row.amount]), [['water-can', '8']]);
  assert.deepEqual(result.returns, []);
  assert.throws(() => calculate(r, '1', { inputitem0: 7 }), /候选/);
  assert.throws(() => calculate(r, '1', { inputitem0: -1 }), /候选/);
});

test('kept tools are stocked once, durability is separate, and containers scale with batches', async () => {
  const calculate = await materials();
  const result = calculate(recipe([
    input(0, [choice('mold', '1', { kind: 'keep' })]),
    input(1, [choice('hammer', '1', { kind: 'damage', points: 2 })]),
    input(2, [choice('cell', '2', { kind: 'consume' }, [{ kind: 'item', id: 'empty-cell', amount: '2' }])]),
  ], [output('bottle', '1', { role: 'return' })]), '5');
  assert.deepEqual(result.inputs.map(row => row.id), ['cell']);
  assert.deepEqual(result.tools.map(row => [row.id, row.amount]), [['mold', '1'], ['hammer', '1']]);
  assert.match(result.tools[1].note, /10/);
  assert.deepEqual(result.returns.map(row => [row.id, row.amount]), [['empty-cell', '10'], ['bottle', '5']]);
});

test('chance, dynamic quantity and changed samples never become guaranteed outputs', async () => {
  const calculate = await materials();
  const r = recipe([input(0, [choice('a'), choice('b')])], [
    output('random', '4', { chance: { numerator: '1', denominator: '3' } }),
    output('dynamic', null, { slot: 1, quantity: { kind: 'potential', nominal: '8', stat: 'test' } }),
    output('sample-a', '1', { slot: 2, change: { input: 0, action: { kind: 'analyze' }, samples: [{ id: 'sample-a', amount: '1' }, { id: 'sample-b', amount: '2' }] } }),
  ]);
  const result = calculate(r, '3', { inputitem0: 1 });
  assert.deepEqual(result.outputs, []);
  assert.deepEqual(result.uncertain.map(row => row.id), ['random', 'dynamic', 'sample-b']);
  assert.ok(result.uncertain.every(row => row.amount === null));
  assert.match(result.uncertain[0].note, /1\/3/);
  assert.match(result.uncertain[2].note, /样本/);
});

test('identical damage tools keep each input slot and its batch durability cost', async () => {
  const calculate = await materials();
  const result = calculate(recipe([
    input(0, [choice('hammer', '1', { kind: 'damage', points: 2 })]),
    input(1, [choice('hammer', '1', { kind: 'damage', points: 2 })]),
  ]), '5');
  assert.deepEqual(result.tools.map(row => [row.id, row.amount]), [['hammer', '1'], ['hammer', '1']]);
  assert.match(result.tools[0].note, /槽 1.*本槽.*10/);
  assert.match(result.tools[1].note, /槽 2.*本槽.*10/);
});

test('special native consumption never becomes a fixed bill of materials', async () => {
  const calculate = await materials();
  const kinds = ['staged', 'upto', 'allocated', 'reserve', 'wear', 'stack', 'buffer', 'pedestals'];
  const result = calculate(recipe(kinds.map((kind, slot) => input(slot, [choice(kind, '2', { kind })]))), '7');
  assert.deepEqual(result.inputs, []);
  assert.deepEqual(result.tools.map(row => row.id), ['reserve', 'wear']);
  assert.deepEqual(result.uncertain.map(row => row.id), ['staged', 'upto', 'allocated', 'stack', 'buffer', 'pedestals']);
});

test('loot bags keep correlated draws and deferred debit out of fixed batch totals', async () => {
  const calculate = await materials();
  const r = recipe([input(0, [choice('bag', '1', { kind: 'allocated' })])], [output('diamond', null, { quantity: { kind: 'lootBag' } })]);
  r.process = { kind: 'lootBagOpening' };
  const result = calculate(r, '5');
  assert.deepEqual(result.inputs, []); assert.deepEqual(result.outputs, []);
  assert.match(result.uncertain[0].note, /完整.*开袋.*扣/);
  assert.match(result.uncertain[1].note, /同组.*一起/);
  assert.match(result.uncertain[1].note, /领取次数/);
});

test('space acquisition stays conditional and describes reusable tooling and native base yield', async () => {
  const calculate = await materials();
  const r = recipe([], [output('hydrogen', null, { kind: 'fluid', quantity: { kind: 'spaceAcquisition', nominal: '15000' } })]);
  r.process = { kind: 'spaceAcquisition', operation: 'siphon' };
  const result = calculate(r, '3');
  assert.deepEqual(result.outputs, []);
  assert.match(result.uncertain[0].note, /原生基数.*15,000/);
  assert.match(result.uncertain[0].note, /电压.*超频/);
  assert.match(result.uncertain[0].note, /挖矿管.*不消耗/);
  r.process.operation = 'pump';
  assert.match(calculate(r, '3').uncertain[0].note, /并行.*批量.*输出/);
});

test('CAL imprint materials describe preserved machine configuration rather than a fixed replacement', async () => {
  const calculate = await materials();
  const r = recipe([input(0, [choice('machine')]), input(1, [choice('imprint')])], [output('imprinted', '1', {
    change: { input: 0, action: { kind: 'calImprint', imprint: 1 }, bindings: [[0, 0]], samples: [{ id: 'imprinted', amount: '1' }] },
  })]);
  r.process = { kind: 'calImprint' };
  const result = calculate(r, '2');
  assert.match(result.uncertain.find(row => row.id === 'imprinted').note, /id_imprint/);
  assert.match(result.uncertain.find(row => row.id === 'imprinted').note, /保留.*配置/);
  assert.deepEqual(result.outputs, []);
});

test('correlated candidates preserve optional empty inputs and paired output samples', async () => {
  const calculate = await materials();
  const r = recipe([input(0, [choice('base')]), input(1, [choice('chip')])], [output('bare', '1', {
    change: { input: 0, action: { kind: 'integration' }, bindings: [[0, null], [0, 0]], samples: [{ id: 'bare', amount: '1' }, { id: 'expanded', amount: '1' }] },
  })]);
  r.process = { kind: 'buildcraftIntegration' };
  const result = calculate(r, '2');
  assert.deepEqual(result.inputs, []);
  assert.deepEqual(result.uncertain.map(row => row.id), ['base', 'bare']);
});

// Deferred reads simulate Catalog I/O only; the reference state and cancellation are real.
test('comparison reference is Catalog scoped and stale reads cannot repopulate a closed panel', async () => {
  const module = await import('../src/recipe-tools/reference.ts').catch(() => null);
  assert.ok(module, 'reference loader is not implemented');
  const pending = [];
  const makeCatalog = id => ({ manifest: { id }, recipe: (id, signal) => new Promise(resolve => pending.push({ id, signal, resolve })) });
  const a = makeCatalog('catalog-a'), b = makeCatalog('catalog-b');
  const catalog = shallowRef(a), current = shallowRef({ recipe: recipe(), related: {} }), enabled = ref(false);
  const scope = effectScope();
  const state = scope.run(() => module.useRecipeReference(() => catalog.value, () => current.value, () => enabled.value));
  state.remember();
  current.value = { recipe: { ...recipe(), id: 'recipe-b' }, related: {} };
  enabled.value = true;
  await nextTick();
  assert.equal(state.id.value, 'recipe-a');
  assert.equal(pending[0].id, 'recipe-a');
  enabled.value = false;
  await nextTick();
  assert.equal(pending[0].signal.aborted, true);
  pending[0].resolve({ recipe: recipe(), related: {} });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(state.detail.value, null);
  catalog.value = b;
  await nextTick();
  assert.equal(state.id.value, '');
  state.remember();
  catalog.value = a;
  await nextTick();
  assert.equal(state.id.value, 'recipe-a');
  enabled.value = true;
  await nextTick();
  scope.stop();
  assert.equal(pending[1].signal.aborted, true);
});
