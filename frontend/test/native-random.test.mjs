import test from 'node:test';
import assert from 'node:assert/strict';
import {JavaRandom,RandomStreams,nativeLog,nativeSqrt,doubleBits} from '../src/catalog/native-random.ts';
import {cosmicTime,eternalPulse} from '../src/catalog/cosmic-shader.ts';

test('Java Gaussian cache, seed and advancement survive detach and restore',()=>{
  const first=JavaRandom.seeded(0n),a=first.nextGaussian(),state=first.snapshot(),b=first.nextGaussian();
  assert.equal(a,0.8025330637390305);assert.equal(b,-0.9015460884175122);
  assert.equal(state.haveGaussian,true);
  const restored=new JavaRandom(state);assert.equal(doubleBits(restored.nextGaussian()),doubleBits(b));
  assert.deepEqual(restored.snapshot(),first.snapshot());
  const continuous=new JavaRandom(state);assert.notEqual(continuous.nextGaussian(),continuous.nextGaussian(),'The cache must be consumed once, not reset per frame');
  for(const bad of ['-1','281474976710656','01'])assert.throws(()=>new JavaRandom({...state,seed:bad}));
  assert.throws(()=>new JavaRandom({...state,gaussian:'7ff0000000000000'}));
});

test('native stream identity spans textures and draw times until Catalog close',()=>{
  const streams=new RandomStreams(),state=JavaRandom.seeded(0n).snapshot();let held=0;
  const reserve=bytes=>{held+=bytes;return ()=>{held-=bytes;};};
  const a=streams.get('resource-a',1,state,reserve),b=streams.get('resource-a',1,state,reserve);
  assert.equal(a,b);assert.equal(a.nextGaussian(),0.8025330637390305);assert.equal(b.nextGaussian(),-0.9015460884175122);
  assert.throws(()=>streams.get('changed-authority',1,state,reserve));
  assert.notEqual(streams.get('independent-native-object',2,state,reserve),a);
  assert.equal(held,1024);streams.close();streams.close();assert.equal(held,0);
  assert.throws(()=>streams.get('resource-a',1,state,reserve));
});

test('fdlibm paths preserve exact edge values used by native polar rejection',()=>{
  assert.equal(doubleBits(nativeLog(1)),'0000000000000000');
  assert.equal(doubleBits(nativeLog(2)),'3fe62e42fefa39ef');
  assert.equal(nativeLog(0),-Infinity);assert.ok(Number.isNaN(nativeLog(-1)));
  for(const value of [Number.MIN_VALUE,1e-300,0.125,0.5,1,2,3,100,Number.MAX_VALUE])
    assert.equal(doubleBits(nativeSqrt(value)),doubleBits(Math.sqrt(value)));
  assert.ok(Object.is(nativeSqrt(-0),-0));
});

test('shader tick casting precedes modulo and Eternal pulse advances per draw',()=>{
  assert.equal(cosmicTime(49),0);assert.equal(cosmicTime(50),1);
  assert.equal(cosmicTime(16777217*50),16777216,'Native int-to-float precision must precede the shader modulo');
  assert.equal(cosmicTime(2147483648*50),-2147483648,'Player ticks wrap as a signed int');
  const random=JavaRandom.seeded(0n),first=eternalPulse(random),second=eternalPulse(random);
  assert.equal(first.scale,0.8025330637390305*0.15+0.95);assert.equal(first.offset,(1-first.scale)/2);
  assert.equal(first.translate,first.offset*16);assert.notEqual(first.scale,second.scale);
});
