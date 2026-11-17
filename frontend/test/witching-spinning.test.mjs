import test from 'node:test';
import assert from 'node:assert/strict';
import {witchingSpinningSelect,validateWitchingSpinningRecipe} from '../../catalog/src/witching-spinning.ts';

const paper={id:'paper',registry:'minecraft:paper',meta:0},diamond={id:'diamond',registry:'minecraft:diamond',meta:0};
const stack={kind:'stack',template:{registry:paper.registry,metadata:0}},list={kind:'list',templates:[stack.template]};
const process={kind:'witchingSpinning',version:'1.7.25-GTNH',selected:0,definitions:[{inputs:[list,list]}]};

test('native list removal can exhaust several requirements with one offer, then ignore unmatched offers',()=>{
  assert.equal(witchingSpinningSelect(process,[paper,diamond,null,null,null]),0);
  assert.equal(witchingSpinningSelect(process,[diamond,paper,null,null,null]),null);
  assert.equal(witchingSpinningSelect({...process,definitions:[{inputs:[stack,list]}]},[paper,diamond,null,null,null]),null);
  assert.equal(witchingSpinningSelect({...process,definitions:[{inputs:[list,stack]}]},[paper,diamond,null,null,null]),0);
  assert.equal(witchingSpinningSelect({...process,definitions:[{inputs:[list,list]},{inputs:[stack,stack]}]},[paper,paper,null,null,null]),0);
});

test('the native gate preserves per-occupied-slot consumption and the conditional empty-output specimen',()=>{
  const r={source:{owner:'WitchingGadgets',handler:'witchinggadgets.client.nei.NEISpinningWheelHandler'},process,
    duration:null,energy:null,grid:null,magic:null,properties:{},
    inputs:[0,1].map(slot=>({slot,kind:'item',choices:[{id:'paper',amount:'1',consume:{kind:'consume'},returns:[],rule:{kind:'wildcard',meta:false,nbt:true}}]})),
    outputs:[{slot:0,kind:'item',id:'paper',amount:'3',quantity:null,change:null,role:'result',chance:{numerator:'1',denominator:'1'}}]};
  const items=new Map([['paper',paper]]);validateWitchingSpinningRecipe(r,items);
  assert.throws(()=>validateWitchingSpinningRecipe({...r,process:null},items));
  assert.throws(()=>validateWitchingSpinningRecipe({...r,duration:'121'},items));
  const bad=structuredClone(r);bad.inputs[0].choices[0].consume.kind='keep';assert.throws(()=>validateWitchingSpinningRecipe(bad,items));
});
