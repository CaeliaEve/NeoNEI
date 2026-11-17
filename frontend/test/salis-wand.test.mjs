import assert from 'node:assert/strict';
import test from 'node:test';
import {salisInventoryMatch, salisReplacementNote, validateSalisWandRecipe} from '../../catalog/src/salis-wand.ts';

const item = (id, registry, meta = 0) => ({id, registry, meta, nbt: null, tags: []});
const choice = id => ({id, amount: '1', consume: {kind: 'consume'}, returns: [], rule: {kind: 'wildcard', meta: false, nbt: true}});

test('Salis counts occupied cells rather than stack quantities and ignores cells after nine', () => {
  const wand = item('wand', 'native:wand'), cap = item('cap', 'native:cap');
  const items = new Map([[wand.id, wand], [cap.id, cap]]);
  const recipe = {inputs: [{choices: [choice(wand.id)]}, {choices: [choice(cap.id)]}, {choices: [choice(cap.id)]}]};
  assert.equal(salisInventoryMatch(recipe, [wand, cap, cap], items), true);
  assert.equal(salisInventoryMatch(recipe, [wand, {...cap, stackLimit: 64}], items), false);
  assert.equal(salisInventoryMatch(recipe, [wand, cap, cap, cap], items), false);
  assert.equal(salisInventoryMatch(recipe, [wand, cap, cap, null, null, null, null, null, null, wand], items), true);
});

test('Salis self-payment explanation preserves old-part payment and the second capacity clamp in one language', () => {
  const process = {part: 'rod', staff: false, sceptre: false, preserve: true, cost: 125,
    chargeCapacity: 10000, resultCapacity: 5000, selfPayment: true, roles: ['center', 'part'], material: null};
  const english = salisReplacementNote(process, 'en-US');
  assert.match(english, /old components/); assert.match(english, /5000/);
  assert.doesNotMatch(english, /\p{Script=Han}/u);
  assert.match(salisReplacementNote(process, 'zh-CN'), /旧部件/);
});

test('Salis screw ore rules keep cross-item component and conductor precedence', () => {
  const wand=item('wand','native:wand'),rod=item('rod','native:rod'),screw=item('screw','native:screw');
  const otherRod={...item('otherRod','native:other-rod',32767),tags:['screwNative']};
  const conductor={...item('conductor','native:conductor'),tags:['screwNative']};
  screw.tags=['screwNative'];
  const items=new Map([wand,rod,screw,otherRod,conductor].map(i=>[i.id,i]));
  const screwChoice={...choice(screw.id),rule:{kind:'except',base:{kind:'ore',name:'screwNative',exclusive:false},
    exclude:[{id:otherRod.id,rule:{kind:'wildcard',meta:false,nbt:true}},{id:conductor.id,rule:{kind:'wildcard',meta:false,nbt:true}}]}};
  const recipe={inputs:[{choices:[choice(wand.id)]},{choices:[choice(rod.id)]},{choices:[screwChoice]},{choices:[choice(conductor.id)]}]};
  assert.equal(salisInventoryMatch(recipe,[wand,rod,screw,conductor],items),true);
  assert.equal(salisInventoryMatch(recipe,[wand,rod,otherRod,conductor],items),false);
  assert.equal(salisInventoryMatch(recipe,[wand,rod,conductor,conductor],items),false);
  assert.equal(salisInventoryMatch({inputs:[{choices:[choice(otherRod.id)]}]},[{...otherRod,meta:0}],items),false);
});

test('Salis output cannot acquire native semantics from a display property alone', () => {
  assert.throws(()=>validateSalisWandRecipe({properties:{'salisarcana:replacement':{}},outputs:[{change:{action:{kind:'salisWand'}}}]}));
});
