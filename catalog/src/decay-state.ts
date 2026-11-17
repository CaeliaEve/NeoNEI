import type {Item} from '@elysium/contracts';
type Nbt=NonNullable<Item['nbt']>;
type Compound=Extract<Nbt,{type:'compound'}>;
export interface DecayBatch {input:Compound|null;state:Compound|null;outcome:'fault'|'ongoing'|'complete';steps:number}

/** One native scheduled batch on owned tags, never live inventory or elapsed-time animation. */
export function decayBatch(threshold:number,input:Compound|null):DecayBatch {
  if(!Number.isInteger(threshold)||threshold<=0||threshold>2147483647)throw new Error('Invalid native decay threshold');
  let state=input===null?null:structuredClone(input),steps=0;
  const create=():Compound=>({type:'compound',value:{TickableItem:{type:'compound',value:{Tick:{type:'long',value:'0'},maxTick:{type:'long',value:String(threshold)},isActive:{type:'byte',value:'1'}}}}});
  const ticking=():boolean|null=>{
    if(state===null){state=create();return true;}
    const tag=state.value.TickableItem;
    if(tag===undefined)return false;
    if(tag.type!=='compound')return null;
    return nativeBoolean(tag.value.isActive);
  };
  const tick=():boolean=>{
    if(state===null||state.value.TickableItem===undefined){state=create();return true;}
    const tag=state.value.TickableItem;
    if(tag.type!=='compound')throw new Error('Decay state type changed during owned batch');
    const tick=nativeLong(tag.value.Tick);
    if(BigInt.asIntN(64,BigInt(threshold)-tick)<=0n){tag.value.isActive={type:'byte',value:'0'};return false;}
    if(!nativeBoolean(tag.value.isActive))return false;
    tag.value.Tick={type:'long',value:BigInt.asIntN(64,tick+1n).toString()};return true;
  };
  let active=ticking(),result=false;
  if(active===null)return {input,state,outcome:'fault',steps};
  while(steps<20&&active){active=ticking();result=tick();steps++;}
  return {input,state,outcome:!active&&!result?'complete':'ongoing',steps};
}

function floating(tag:Nbt):number|null {
  const buffer=new DataView(new ArrayBuffer(8));
  if(tag.type==='float'){buffer.setUint32(0,Number.parseInt(tag.value,16));return buffer.getFloat32(0);}
  if(tag.type==='double'){buffer.setBigUint64(0,BigInt('0x'+tag.value));return buffer.getFloat64(0);}
  return null;
}
function nativeLong(tag:Nbt|undefined):bigint {
  if(!tag)return 0n;
  if(tag.type==='byte'||tag.type==='short'||tag.type==='int'||tag.type==='long')return BigInt(tag.value);
  let number=floating(tag);if(number===null||Number.isNaN(number))return 0n;
  if(tag.type==='double')number=Math.floor(number);
  if(number>=9223372036854775808)return 9223372036854775807n;
  if(number<=-9223372036854775808)return -9223372036854775808n;
  return BigInt(Math.trunc(number));
}
function nativeBoolean(tag:Nbt|undefined):boolean {
  if(!tag)return false;
  if(tag.type==='byte'||tag.type==='short'||tag.type==='int'||tag.type==='long')return BigInt.asIntN(8,BigInt(tag.value))!==0n;
  const number=floating(tag);if(number===null)return false;
  const integer=Number.isNaN(number)?0:Math.max(-2147483648,Math.min(2147483647,Math.trunc(number)));
  const floor=number<integer?(integer-1)|0:integer;
  return (floor&255)!==0;
}
