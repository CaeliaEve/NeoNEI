import {javaLongFloat,nativeSysUnits,nativeCos} from './native-visual-math.ts';

export interface ForestryClock {
  profile:'bee'|'butterfly';alive:boolean;itemHash:number;ticks:number;
  state?:'flying'|'gliding'|'rising'|'resting'|'hover';stateHash?:number;
}
const f=Math.fround;
function hash(value:number):bigint{if(!Number.isInteger(value)||(value|0)!==value)throw Error('Invalid native Forestry identity hash');return BigInt(value);}
function flap(time:bigint,period:bigint):number{return f(javaLongFloat(time%period)/f(Number(period)));}
function irregular(time:bigint,value:number,profile:ForestryClock['profile']):number{
  const block=time/(profile==='bee'?1000n:1024n);
  if(block%11n===0n)return f(0.75);
  if(profile==='bee'){
    if(block%7n===0n||block%19n===0n)value=f(f(value*f(8))%f(1));
  }else{
    if(block%7n===0n)value=f(f(value*f(4))%f(1));
    else if(block%19n===0n)value=f(f(value*f(6))%f(1));
  }
  return value<0.5?f(f(0.75)+value):f(f(1.75)-value);
}
/** Item and entity formulas are separate native calls. A cached display entity
 * is not spawned/ticked, so its captured ticksExisted is never advanced here. */
export function forestrySwing(milliseconds:number,data:ForestryClock):number{
  if(data.profile!=='bee'&&data.profile!=='butterfly')throw Error('Unreviewed Forestry clock');
  hash(data.ticks);const item=hash(data.itemHash),millis=nativeSysUnits(milliseconds,1000n);
  if(data.profile==='butterfly'&&(data.state==='resting'||data.state==='hover')){
    if(data.stateHash===undefined)throw Error('Native butterfly species clock is missing');
    const time=BigInt.asIntN(64,millis+hash(data.stateHash));
    return irregular(time,flap(time,1000n),'butterfly');
  }
  const time=BigInt.asIntN(64,millis+item),period=data.profile==='bee'?1000n:1024n;
  const partial=data.alive?irregular(time,flap(time,period),data.profile):f(1);
  return f(f(data.ticks)+partial);
}
export function forestryWing(swing:number,sine:Float32Array):number{
  return f(f(nativeCos(f(f(swing)*f(1.3)),sine)*f(Math.PI))*f(0.25));
}
