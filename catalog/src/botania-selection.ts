import {nativeBeePoolTransition} from './botania-bee.ts';
import type {BeePoolSource,BeePoolStack} from './botania-bee.ts';
import type {PoolCacheRead} from './botania-cache.ts';
import type {Nbt} from '@elysium/contracts';

/** Ordered selection with resolved read traces, not a published program or a
 * simulation of live cache writes, callback output caches, or clock progression. */
interface Conditions {alchemy:boolean;conjuration:boolean;mana:number}
export type PoolSelectionEntry=Conditions&(
  {kind:'bee';form:string;inputSpecies:string;outputSpecies:string}|
  {kind:'item';predicates:{registry:string;metadata:number}[];output:BeePoolStack}|
  {kind:'mini';key:string;output:BeePoolStack});
export interface PoolSelectionTrace {index:number;reads:PoolCacheRead[]}
export type PoolSelectionResult={state:'notMatched'}|{state:'nativeError'|'insufficientMana';index:number}|
  {state:'selected';index:number;output:BeePoolStack};
export interface PoolSelection {result:PoolSelectionResult;offeredAfter:BeePoolStack|null;visited:number}
const invalid=():never=>{throw new Error('Invalid or unsupported explicit native pool selection trace');};
const integer=(value:number):boolean=>Number.isInteger(value)&&value===(value|0);
const fields=(tag:Nbt|null|undefined):Record<string,Nbt>=>tag?.type==='compound'?tag.value:{};

export function nativeBeePoolSelect(source:BeePoolSource,entries:readonly PoolSelectionEntry[],
  offered:BeePoolStack|null,alchemy:boolean,conjuration:boolean,mana:number,traces:readonly PoolSelectionTrace[]):PoolSelection{
  if(entries.length>4096||traces.length>entries.length||!integer(mana)
    ||new TextEncoder().encode(JSON.stringify(entries)).length>16*1024*1024)return invalid();
  let owned=structuredClone(offered),at=0,visited=0,predicates=0;
  let result:PoolSelectionResult={state:'notMatched'};
  if(owned===null){if(traces.length!==0)return invalid();return {result,offeredAfter:null,visited};}
  for(const [index,entry]of entries.entries()){
    visited++;
    if(!integer(entry.mana)||typeof entry.alchemy!=='boolean'||typeof entry.conjuration!=='boolean')return invalid();
    let accepted=false,output:BeePoolStack|undefined;
    switch(entry.kind){
      case 'bee':{
        const trace=traces[at++];if(!trace||trace.index!==index)return invalid();
        const transition=nativeBeePoolTransition(source,entry.form,entry.inputSpecies,entry.outputSpecies,owned,trace.reads);
        owned=transition.offeredAfter;if(owned===null)return invalid();
        if(transition.result.state==='nativeError'){
          if(at!==traces.length)return invalid();return {result:{state:'nativeError',index},offeredAfter:owned,visited};
        }
        if(transition.result.state==='matched'){accepted=true;output=transition.result.output;}
        break;
      }
      case 'item':
        for(const predicate of entry.predicates){
          if(++predicates>65536||!integer(predicate.metadata))return invalid();
          if(predicate.registry===owned.registry&&(predicate.metadata===32767||predicate.metadata===owned.meta)){
            accepted=true;break;
          }
        }
        output=entry.output;break;
      case 'mini':{
        const key=fields(owned.nbt).type;
        // Non-string native key coercions need their own observed binding.
        if(key!==undefined&&key.type!=='string')return invalid();
        accepted=entry.key===(key?.value??'');output=entry.output;break;
      }
      default:return invalid();
    }
    // TilePool runs matches first. Catalyst-ineligible callbacks retain repairs.
    if(!accepted||entry.alchemy&&!alchemy||entry.conjuration&&!conjuration)continue;
    if(mana<entry.mana)result={state:'insufficientMana',index};
    else{if(!output)return invalid();result={state:'selected',index,output:structuredClone(output)};}
    break;
  }
  if(at!==traces.length)return invalid();
  return {result,offeredAfter:owned,visited};
}
