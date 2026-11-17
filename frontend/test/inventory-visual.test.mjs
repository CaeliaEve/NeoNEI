import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeFloat,javaLongFloat,nativeSysUnits,keyAngle,identity,multiply,rotationZ,normalMatrix,scaling} from '../src/catalog/native-visual-math.ts';
import {samplerFrame,samplerLayout} from '../src/catalog/native-sampler.ts';
import {forestrySwing} from '../src/catalog/forestry-visual-math.ts';

test('inventory clocks preserve Java float casts, native units and unbounded phase',()=>{
  assert.ok(Object.is(nativeFloat('80000000'),-0));
  for(const bad of ['7f800000','7fc00000','3F800000','0000000'])assert.throws(()=>nativeFloat(bad));
  assert.equal(javaLongFloat(16777217n),16777216);
  assert.equal(javaLongFloat(16777219n),16777220);
  // Number(long) would lose the +1 and double-round to the wrong float here.
  assert.equal(javaLongFloat((1n<<62n)+(1n<<38n)+1n),Number((1n<<62n)+(1n<<39n)));
  assert.equal(nativeSysUnits(150,1000n),150n);
  assert.equal(nativeSysUnits(150,1000000n),150000n);
  assert.equal(nativeSysUnits(0,1000n),0n);
  assert.equal(nativeSysUnits(Number.MIN_VALUE,1000n),0n);
  assert.equal(nativeSysUnits(1.5,1000000n),1500n);
  assert.equal(nativeSysUnits(2**63-1024,1000n),BigInt(2**63-1024));
  assert.throws(()=>nativeSysUnits(2**63,1000n),/signed long/);
  const table=new Float32Array(65536);table[0]=0;table[8192]=0.5;
  assert.equal(keyAngle(0,1000n,table),-2750);
  const first=nativeSysUnits(1000,1000n),late=nativeSysUnits(1000+720000,1000n);
  assert.notEqual(first,late,'A long/non-periodic native clock must not be wrapped into a short sprite cycle');
});

test('inventory transforms preserve model coordinates and normal orientation',()=>{
  const turn=rotationZ(90),unchanged=multiply(identity(),turn);
  assert.deepEqual(unchanged,turn);
  assert.ok(Math.abs(turn[0])<1e-6);assert.ok(Math.abs(turn[1]-1)<1e-6);
  assert.ok(Math.abs(turn[4]+1)<1e-6);
  const normal=normalMatrix(scaling(2,3,4));assert.equal(normal[0],0.5);assert.equal(normal[4],Math.fround(1/3));assert.equal(normal[8],0.25);
});

test('native sampler keeps timeline order, phase and every mip size',()=>{
  const data={phase:4,timeline:[{frame:1,ticks:3},{frame:0,ticks:2}]};
  assert.equal(samplerFrame(data,0),0);assert.equal(samplerFrame(data,50),1);
  assert.equal(samplerFrame(data,200),0);assert.throws(()=>samplerFrame({...data,phase:5},0));
  assert.equal(samplerFrame({...data,anchor:{frame:2,ticks:2}},0),2);
  assert.equal(samplerFrame({...data,anchor:{frame:2,ticks:2}},50),2);
  assert.equal(samplerFrame({...data,anchor:{frame:2,ticks:2}},100),1);
  assert.deepEqual(samplerLayout([4,2],3,2,3),[
    {width:4,height:2,sheetWidth:8,sheetHeight:4},
    {width:2,height:1,sheetWidth:4,sheetHeight:2},
    {width:1,height:1,sheetWidth:2,sheetHeight:2},
  ]);
  assert.throws(()=>samplerLayout([4096,4096],4096,1,1));
});

test('Forestry separates item identity from resting species clock and keeps cached entity ticks',()=>{
  const dead={profile:'butterfly',alive:false,itemHash:7700,stateHash:11100,state:'hover',ticks:2};
  // Resting phase is /1000, but its irregular decision still divides by 1024.
  assert.equal(forestrySwing(0,dead),Math.fround(0.85));
  assert.equal(forestrySwing(0,{...dead,itemHash:-91}),Math.fround(0.85));
  assert.equal(forestrySwing(0,{...dead,state:'flying'}),3);
  assert.equal(forestrySwing(999999,{...dead,state:'flying'}),3);
  assert.equal(forestrySwing(0,{profile:'bee',alive:true,itemHash:-1200,ticks:0}),Math.fround(0.55));
});
