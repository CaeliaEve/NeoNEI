import type {Nbt} from '@elysium/contracts';
import type {PoolCachedAllele,PoolCachedChromosome,PoolCacheRead,PoolCacheLoad} from './botania-cache.ts';
import {nativeNbtInt} from './native-nbt.ts';

/** Snapshot law precursor, not recipe admission. Callers supply resolved cache
 * reads in Genome/Mate order; this module does not infer reachability/transitions. */
export interface BeePoolAllele {uid:string;dominant:boolean;slots:number[]}
export interface BeePoolSource {
  forestry:string;magicbees:string;root:string;chromosomes:string[];
  definitions:Record<string,BeePoolAllele>;
  alleles:{key:string;uid:string;dominant:boolean;slots:number[];aliasOnly?:boolean}[];
  aliases:Record<string,string>;templates:Record<string,(string|null)[]>;
  defaults:(string|null)[];forest:({primary:string|null;secondary:string|null}|null)[];
  forms:Record<string,string>;clearInvalidChromosomes:boolean;
}
export interface BeePoolStack {registry:string;meta:number;amount:string;nbt:Nbt|null}
export type BeePoolResult={state:'notMatched'|'nativeError'}|{state:'matched';output:BeePoolStack};
export interface BeePoolTransition {result:BeePoolResult;offeredAfter:BeePoolStack|null}
class NativeFailure extends Error {}
const invalid=():never=>{throw new Error('Invalid explicit native bee pool source or cache-read trace');};
const fail=():never=>{throw new NativeFailure();};
const fields=(tag:Nbt|null|undefined):Record<string,Nbt>=>tag?.type==='compound'?tag.value:{};
const string=(tag:Nbt|undefined):string=>tag?.type==='string'?tag.value:'';
const own=(value:object,key:string):boolean=>Object.prototype.hasOwnProperty.call(value,key);

export function nativeBeePoolEvaluate(source:BeePoolSource,form:string,input:string,output:string,
  offered:BeePoolStack|null,reads:readonly PoolCacheRead[]):BeePoolResult{
  return nativeBeePoolTransition(source,form,input,output,offered,reads).result;
}

/** Match-time repairs survive rejection; result conversion writes to a separate copy. */
export function nativeBeePoolTransition(source:BeePoolSource,form:string,input:string,output:string,
  offered:BeePoolStack|null,reads:readonly PoolCacheRead[]):BeePoolTransition{
  const owned=structuredClone(offered);
  return {result:evaluateOwned(source,form,input,output,owned,reads),offeredAfter:owned};
}

function evaluateOwned(source:BeePoolSource,form:string,input:string,output:string,
  offered:BeePoolStack|null,reads:readonly PoolCacheRead[],
  reader?: (genome:Nbt|undefined)=>PoolCacheLoad):BeePoolResult{
  if(offered===null)return {state:'notMatched'};
  if(!own(source.forms,form))return invalid();
  if(source.forms[form]!==offered.registry)return {state:'notMatched'};
  const count=source.chromosomes.length;
  if(source.forestry!=='4.10.17'||source.magicbees!=='2.9.4-GTNH'||count!==14
    ||source.defaults.length!==count||source.forest.length!==count||reads.length>2)return invalid();
  const definitions=new Map(Object.entries(source.definitions));
  const definition=(uid:string|null|undefined):BeePoolAllele|undefined=>uid==null?undefined:definitions.get(uid);
  const valid=(allele:BeePoolAllele|undefined,slot:number):allele is BeePoolAllele=>allele!==undefined&&allele.slots.includes(slot);
  const active=(pair:{primary:string|null;secondary:string|null}|null|undefined):string|null=>{
    if(pair==null)return null;const a=definition(pair.primary),b=definition(pair.secondary);
    return !a||!b?null:a.dominant?a.uid:b.dominant?b.uid:a.uid;
  };
  const tag=offered.nbt===null?null:fields(offered.nbt);let at=0;
  const cached=(allele:PoolCachedAllele|null):PoolCachedAllele|null=>{
    if(allele===null)return null;
    if(!allele||typeof allele.uid!=='string'||allele.uid.length===0||allele.uid.length>16384
      ||typeof allele.dominant!=='boolean'||typeof allele.sourceIdentity!=='boolean'||typeof allele.beeSpecies!=='boolean')return invalid();
    return allele;
  };
  const read=(genome:Nbt|undefined,used:boolean):PoolCachedAllele|null=>{
    let entry:PoolCacheRead;
    if(reader){
      const value=reader(genome);
      if('nativeError' in value)return fail();
      entry={kind:'hit',chromosome:value.chromosome};
    }else{
      const value=reads[at++];if(!value)return invalid();entry=value;
      if(entry.kind==='miss'){
        const loaded=nativeBeePoolGenomeLoad(source,genome);
        if('nativeError' in loaded)return fail();
        entry={kind:'hit',chromosome:loaded.chromosome};
      }
    }
    if(entry.kind!=='hit'||!own(entry,'chromosome'))return invalid();
    if(!used)return null;
    if(entry.chromosome===null)return null;
    const a=cached(entry.chromosome.primary),b=cached(entry.chromosome.secondary);
    return !a||!b?null:a.dominant?a:b.dominant?b:a;
  };
  try{
    const uid=active(source.forest[0]),defaultAllele=definition(uid);
    const species=tag===null||!own(tag,'Genome')
      ?!defaultAllele?null:{uid:defaultAllele.uid,dominant:defaultAllele.dominant,sourceIdentity:true,beeSpecies:valid(defaultAllele,0)}
      :read(tag.Genome,true);
    if(tag!==null&&own(tag,'Mate'))read(tag.Mate,false);
    if(at!==reads.length)return invalid();
    if(!species||!species.beeSpecies)return fail();
    if(!species.sourceIdentity||species.uid!==input)return {state:'notMatched'};
    if(tag===null)return fail();
    const result=structuredClone(offered);
    const list=fields(fields(result.nbt).Genome).Chromosomes;if(list?.type!=='list')return fail();
    // Native getCompoundTagAt edits a detached empty compound for absent/noncompound cells.
    const first=list.value[0];if(first?.type==='compound'){
      first.value.UID0={type:'string',value:output};first.value.UID1={type:'string',value:output};
    }
    result.amount='1';return {state:'matched',output:result};
  }catch(error){if(error instanceof NativeFailure)return {state:'nativeError'};throw error;}
}

/** Internal owned-session entry point; callers carry repairs and cache identity
 * across callbacks instead of copying the offered stack for each registry row. */
export function nativeBeePoolMatchOwned(source:BeePoolSource,form:string,input:string,output:string,
  offered:BeePoolStack,reader:(genome:Nbt|undefined)=>PoolCacheLoad):BeePoolResult{
  return evaluateOwned(source,form,input,output,offered,[],reader);
}

/** Real loader law on owned tags. Failed loads retain earlier repair writes. */
export function nativeBeePoolGenomeLoad(source:BeePoolSource,genome:Nbt|undefined):PoolCacheLoad{
  const count=source.chromosomes.length;
  if(source.forestry!=='4.10.17'||source.magicbees!=='2.9.4-GTNH'||count!==14
    ||source.defaults.length!==count||source.forest.length!==count)return invalid();
  const definitions=new Map(Object.entries(source.definitions)),lookup=new Map<string,BeePoolAllele>();
  for(const row of source.alleles)if(!row.aliasOnly){
    const allele=definitions.get(row.uid);if(!allele)return invalid();lookup.set(row.key,allele);
  }
  for(const [key,uid] of Object.entries(source.aliases))if(!lookup.has(key)){
    const allele=definitions.get(uid);if(!allele)return invalid();lookup.set(key,allele);
  }
  const definition=(uid:string|null|undefined):BeePoolAllele|undefined=>uid==null?undefined:definitions.get(uid);
  const valid=(allele:BeePoolAllele|undefined,slot:number):allele is BeePoolAllele=>allele!==undefined&&allele.slots.includes(slot);
  const cached=(allele:BeePoolAllele|undefined):PoolCachedAllele|null=>!allele?null:{
    uid:allele.uid,dominant:allele.dominant,sourceIdentity:true,beeSpecies:valid(allele,0),
  };
  try{
    const raw=fields(genome).Chromosomes;
    const list=raw?.type==='list'&&(raw.value.length===0||raw.element==='compound')?raw.value:[];
    if(list.length>65536)return invalid();
    const cells:({primary:string;secondary:string}|null)[]=Array(count).fill(null);
    for(const cell of list){
      const entry=fields(cell),slot=(nativeNbtInt(entry.Slot)<<24)>>24;if(slot<0||slot>=count)continue;
      let a=lookup.get(string(entry.UID0)),b=lookup.get(string(entry.UID1));
      if(source.clearInvalidChromosomes){
        const fallback=valid(a,slot)?a:valid(b,slot)?b:definition(source.defaults[slot]);let changed=false;
        if(!valid(a,slot)){a=fallback;changed=true;}if(!valid(b,slot)){b=fallback;changed=true;}
        if(changed){if(!a||!b)return fail();entry.UID0={type:'string',value:a.uid};entry.UID1={type:'string',value:b.uid};}
      }
      if(!valid(a,slot)||!valid(b,slot))return fail();
      cells[slot]={primary:a.uid,secondary:b.uid};
    }
    const first=cells[0];let chromosome:PoolCachedChromosome|null=null;
    if(first){
      const a=definition(first.primary),b=definition(first.secondary);
      const active=!a||!b?null:a.dominant?a:b.dominant?b:a;
      const template=active&&source.templates[active.uid];if(!template||template.length!==count)return fail();
      chromosome={primary:cached(a),secondary:cached(b)};
    }
    return {chromosome};
  }catch(error){if(error instanceof NativeFailure)return {nativeError:true};throw error;}
}
