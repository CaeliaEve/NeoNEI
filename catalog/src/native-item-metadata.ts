import type {Item} from '@elysium/contracts';
import {nativeNbtInt} from './native-nbt.ts';

/** A pinned logical getter; physical metadata continues to define item identity. */
export function nativeItemMetadata(item:Partial<Pick<Item,'registry'|'meta'|'nbt'>>):number {
  if(!Number.isInteger(item.meta))throw new Error('Missing native physical metadata');
  if(item.registry!=='Botania:manaMirror')return item.meta!;
  const mana=nativeNbtInt(item.nbt?.type==='compound'?item.nbt.value.mana:undefined);
  const value=Math.fround(Math.fround(Math.fround(mana)/1000000)*1000);
  const narrowed=Number.isNaN(value)?0:Math.max(-2147483648,Math.min(2147483647,Math.trunc(value)));
  return(1000-narrowed)|0;
}
