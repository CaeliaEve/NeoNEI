import type {Nbt} from '@elysium/contracts';
import {nativeNbtEqual,nativeNbtHash} from './native-nbt.ts';

/** Single-instant lookup precursor. Not yet a published program or production
 * pool selector: hit writes, misses, eviction and ordered transitions are absent. */
export interface PoolCachedAllele {uid:string;dominant:boolean;beeSpecies:boolean;sourceIdentity:boolean}
export interface PoolCachedChromosome {primary:PoolCachedAllele|null;secondary:PoolCachedAllele|null}
export interface PoolCacheEntry {hash:number;key:Nbt;accessNanos:string;chromosome:PoolCachedChromosome|null}
export interface PoolCacheSnapshot {shift:number;mask:number;segments:{count:number;buckets:PoolCacheEntry[][]}[]}
export type PoolCacheRead={kind:'miss'}|{kind:'hit';chromosome:PoolCachedChromosome|null};
export interface PoolCacheState {
  shift:number;mask:number;keys:Nbt[];
  entries:{hash:number;key:number;accessNanos:string;chromosome:PoolCachedChromosome|null}[];
  segments:{count:number;threshold:number;maxWeight:string;totalWeight:number;readCount:number;
    buckets:number[][];access:number[];recency:number[]}[];
}
export type PoolCacheLoad={nativeError:true}|{chromosome:PoolCachedChromosome|null};
export type PoolCacheResult={kind:'nativeError'}|{kind:'hit'|'loaded';chromosome:PoolCachedChromosome|null};
const invalid=():never=>{throw new Error('Invalid native pool cache snapshot');};
const power=(value:number,max:number):boolean=>Number.isInteger(value)&&value>0&&value<=max&&(value&(value-1))===0;
function nanos(value:string):bigint{
  if(typeof value!=='string'||!/^(-?[1-9][0-9]*|0)$/.test(value)||value.length>20)return invalid();
  const parsed=BigInt(value);if(BigInt.asIntN(64,parsed)!==parsed)return invalid();return parsed;
}
function rehash(hash:number):number{
  hash=(hash+((hash<<15)^0xffffcd7d))|0;hash^=hash>>>10;hash=(hash+(hash<<3))|0;
  hash^=hash>>>6;hash=(hash+(hash<<2)+(hash<<14))|0;return (hash^(hash>>>16))|0;
}
function allele(value:PoolCachedAllele|null):void{
  if(value===null)return;
  if(!value||typeof value.uid!=='string'||value.uid.length===0||value.uid.length>16384
    ||typeof value.dominant!=='boolean'||typeof value.beeSpecies!=='boolean'||typeof value.sourceIdentity!=='boolean')invalid();
}
export function nativePoolCacheLookup(cache:PoolCacheSnapshot,query:Nbt,now:string):PoolCacheRead{
  const at=nanos(now);
  if(!cache||!Array.isArray(cache.segments)||!power(cache.segments.length,128)
    ||cache.mask!==cache.segments.length-1||cache.shift!==32-Math.log2(cache.segments.length))return invalid();
  let total=0;
  for(let segmentAt=0;segmentAt<cache.segments.length;segmentAt++){
    const segment=cache.segments[segmentAt];
    if(!segment||!Array.isArray(segment.buckets)||!power(segment.buckets.length,65536)
      ||!Number.isInteger(segment.count)||segment.count<0||segment.count>4096)return invalid();
    let count=0;
    for(let slot=0;slot<segment.buckets.length;slot++){
      const bucket=segment.buckets[slot];if(!Array.isArray(bucket)||bucket.length>4096)return invalid();
      for(const entry of bucket){
        if(++total>4096)return invalid();count++;
        if(!entry||!Number.isInteger(entry.hash)||entry.hash!==(entry.hash|0)||entry.key?.type!=='compound'
          ||((entry.hash>>>cache.shift)&cache.mask)!==segmentAt||(entry.hash&(segment.buckets.length-1))!==slot)return invalid();
        nanos(entry.accessNanos);
        if(entry.chromosome!==null){if(!entry.chromosome)return invalid();allele(entry.chromosome.primary);allele(entry.chromosome.secondary);}
      }
    }
    if(count!==segment.count)return invalid();
  }
  if(query.type!=='compound')return invalid();
  const hash=rehash(nativeNbtHash(query)),segment=cache.segments[(hash>>>cache.shift)&cache.mask];
  if(!segment)return invalid();
  if(segment.count===0)return {kind:'miss'};
  const bucket=segment.buckets[hash&(segment.buckets.length-1)];if(!bucket)return invalid();
  for(const entry of bucket)if(entry.hash===hash&&nativeNbtEqual(query,entry.key)){
    if(BigInt.asIntN(64,at-nanos(entry.accessNanos))>=60000000000n)return {kind:'miss'};
    return {kind:'hit',chromosome:structuredClone(entry.chromosome)};
  }
  return {kind:'miss'};
}

interface CacheNode {
  hash:number;key:number;access:bigint;chromosome:PoolCachedChromosome|null;loading:object|null;
}
interface CacheSegment {
  count:number;threshold:number;maxWeight:bigint;weight:number;reads:number;
  buckets:CacheNode[][];access:CacheNode[];recency:CacheNode[];
}
const integer=(value:number):boolean=>Number.isInteger(value)&&value===(value|0);
const last=(queue:CacheNode[],entry:CacheNode):void=>{
  const at=queue.indexOf(entry);if(at>=0)queue.splice(at,1);queue.push(entry);
};

/** Serial Guava-17 access/load/eviction semantics on an owned key heap.
 * Each ticker read is requested from the caller; this does not freeze native time
 * or assert that supplied timestamps came from a live JVM. */
export class NativePoolCacheMachine {
  private readonly shift:number;
  private readonly mask:number;
  private readonly keys:Nbt[];
  private readonly segments:CacheSegment[]=[];

  constructor(state:PoolCacheState){
    if(!state||!Array.isArray(state.keys)||state.keys.length>4096||!Array.isArray(state.entries)
      ||state.entries.length>4096||!Array.isArray(state.segments)||!power(state.segments.length,128)
      ||state.mask!==state.segments.length-1||state.shift!==32-Math.log2(state.segments.length))invalid();
    if(new TextEncoder().encode(JSON.stringify(state)).length>16*1024*1024)invalid();
    this.shift=state.shift;this.mask=state.mask;this.keys=structuredClone(state.keys);
    for(const key of this.keys){if(key?.type!=='compound')invalid();nativeNbtHash(key);}
    const entries=state.entries.map(row=>{
      if(!row||!integer(row.hash)||!Number.isInteger(row.key)||row.key<0||row.key>=this.keys.length)invalid();
      if(row.chromosome!==null){if(!row.chromosome)invalid();allele(row.chromosome.primary);allele(row.chromosome.secondary);}
      return {hash:row.hash,key:row.key,access:nanos(row.accessNanos),
        chromosome:structuredClone(row.chromosome),loading:null} as CacheNode;
    });
    const refs=(ids:number[]):CacheNode[]=>{
      if(!Array.isArray(ids)||ids.length>65536)return invalid();
      return ids.map(id=>{
        if(!Number.isInteger(id)||id<0||id>=entries.length)return invalid();
        return entries[id]!;
      });
    };
    const seen=new Set<CacheNode>();let totalWeight=0n;
    for(const [i,row] of state.segments.entries()){
      if(!row||!Array.isArray(row.buckets)||!power(row.buckets.length,65536)
        ||!integer(row.count)||row.count<0||row.count>4096||row.totalWeight!==row.count
        ||!integer(row.readCount)||!integer(row.threshold)||row.threshold<0||row.threshold>row.buckets.length)invalid();
      const max=nanos(row.maxWeight);if(max<0n||max>128n||BigInt(row.count)>max)invalid();totalWeight+=max;
      const segment:CacheSegment={count:row.count,threshold:row.threshold,maxWeight:max,weight:row.totalWeight,
        reads:row.readCount,buckets:row.buckets.map(refs),access:refs(row.access),recency:refs(row.recency)};
      let count=0;
      for(const [slot,bucket] of segment.buckets.entries())for(const entry of bucket){
        if(seen.has(entry)||((entry.hash>>>this.shift)&this.mask)!==i
          ||(entry.hash&(segment.buckets.length-1))!==slot)invalid();
        seen.add(entry);count++;
      }
      if(count!==segment.count||segment.access.length!==count||new Set(segment.access).size!==count)invalid();
      for(const entry of segment.access)if(!segment.buckets[entry.hash&(segment.buckets.length-1)]!.includes(entry))invalid();
      for(const entry of segment.recency)if(((entry.hash>>>this.shift)&this.mask)!==i)invalid();
      this.segments.push(segment);
    }
    if(totalWeight!==128n)invalid();
  }

  /** Only the session's owned tags are mutable; initial observations remain untouched. */
  key(id:number):Nbt{
    if(!Number.isInteger(id)||id<0||id>=this.keys.length)return invalid();
    return this.keys[id]!;
  }
  bindOwned(key:Nbt):number{
    if(key.type!=='compound')return invalid();nativeNbtHash(key);
    const present=this.keys.indexOf(key);if(present>=0)return present;
    if(this.keys.length>=4096)return invalid();this.keys.push(key);return this.keys.length-1;
  }
  get(id:number,clock:()=>string,loader:(id:number)=>PoolCacheLoad):PoolCacheResult{
    const query=this.key(id),hash=rehash(nativeNbtHash(query));
    const segment=this.segments[(hash>>>this.shift)&this.mask]!;
    const now=():bigint=>nanos(clock());
    try{
      const found=segment.count===0?undefined:this.find(segment,hash,id);
      if(found){
        const at=now();
        if(BigInt.asIntN(64,at-found.access)<60000000000n){
          found.access=at;segment.recency.push(found);
          return {kind:'hit',chromosome:structuredClone(found.chromosome)};
        }
        this.expire(segment,at);
      }
      const at=now();this.cleanup(segment,at);
      let pending=this.find(segment,hash,id);
      if(!pending){
        pending={hash,key:id,access:9223372036854775807n,chromosome:null,loading:null};
        segment.buckets[hash&(segment.buckets.length-1)]!.unshift(pending);
      }else if(BigInt.asIntN(64,at-pending.access)>=60000000000n){
        segment.access.splice(segment.access.indexOf(pending),1);segment.count--;segment.weight--;
      }else{
        pending.access=at;last(segment.access,pending);
        return {kind:'hit',chromosome:structuredClone(pending.chromosome)};
      }
      const loading={};pending.loading=loading;
      const loaded=loader(id);nativeNbtHash(this.key(id));
      if('nativeError' in loaded){
        if(loaded.nativeError!==true)return invalid();
        const entry=this.find(segment,hash,id);
        if(entry&&entry.loading===loading)this.remove(segment,entry,false);
        return {kind:'nativeError'};
      }
      if(loaded.chromosome!==null){allele(loaded.chromosome.primary);allele(loaded.chromosome.secondary);}
      const write=now();this.cleanup(segment,write);
      if(segment.count+1>segment.threshold)this.expand(segment);
      let entry=this.find(segment,hash,id);
      if(entry&&entry.loading!==loading)throw new Error('Native mutable-key collision retained an unadapted loading reference');
      if(!entry){
        entry={hash,key:id,access:9223372036854775807n,chromosome:null,loading:null};
        segment.buckets[hash&(segment.buckets.length-1)]!.unshift(entry);
      }
      entry.loading=null;entry.chromosome=structuredClone(loaded.chromosome);this.drain(segment);
      entry.access=write;last(segment.access,entry);segment.count++;segment.weight++;
      this.drain(segment);
      while(BigInt(segment.weight)>segment.maxWeight)this.remove(segment,segment.access[0]!,true);
      return {kind:'loaded',chromosome:structuredClone(loaded.chromosome)};
    }finally{
      segment.reads=(segment.reads+1)|0;
      if((segment.reads&63)===0)this.cleanup(segment,now());
    }
  }

  snapshot():PoolCacheState{
    const keys:Nbt[]=[],entries:PoolCacheState['entries']=[],segments:PoolCacheState['segments']=[];
    const entryIds=new Map<CacheNode,number>(),keyIds=new Map<number,number>();
    const encode=(entry:CacheNode):number=>{
      const existing=entryIds.get(entry);if(existing!==undefined)return existing;
      let key=keyIds.get(entry.key);
      if(key===undefined){key=keys.length;keyIds.set(entry.key,key);keys.push(structuredClone(this.keys[entry.key]!));}
      const id=entries.length;entryIds.set(entry,id);
      entries.push({hash:entry.hash,key,accessNanos:entry.access.toString(),chromosome:structuredClone(entry.chromosome)});
      return id;
    };
    for(const segment of this.segments)segments.push({
      count:segment.count,threshold:segment.threshold,maxWeight:segment.maxWeight.toString(),totalWeight:segment.weight,
      readCount:segment.reads,buckets:segment.buckets.map(bucket=>bucket.map(encode)),
      access:segment.access.map(encode),recency:segment.recency.map(encode),
    });
    return {shift:this.shift,mask:this.mask,keys,entries,segments};
  }
  private find(segment:CacheSegment,hash:number,key:number):CacheNode|undefined{
    return segment.buckets[hash&(segment.buckets.length-1)]!.find(entry=>entry.hash===hash
      &&(entry.key===key||nativeNbtEqual(this.keys[key]!,this.keys[entry.key]!)));
  }
  private cleanup(segment:CacheSegment,now:bigint):void{this.expire(segment,now);segment.reads=0;}
  private expire(segment:CacheSegment,now:bigint):void{
    this.drain(segment);
    while(segment.access.length&&BigInt.asIntN(64,now-segment.access[0]!.access)>=60000000000n)
      this.remove(segment,segment.access[0]!,true);
  }
  private drain(segment:CacheSegment):void{
    for(const entry of segment.recency)if(segment.access.includes(entry))last(segment.access,entry);
    segment.recency.length=0;
  }
  private copyEntry(segment:CacheSegment,original:CacheNode):CacheNode{
    const copy={...original};const at=segment.access.indexOf(original);
    if(at>=0)segment.access[at]=copy;
    return copy;
  }
  private remove(segment:CacheSegment,entry:CacheNode,active:boolean):void{
    const slot=entry.hash&(segment.buckets.length-1),bucket=segment.buckets[slot]!,at=bucket.indexOf(entry);
    if(at<0)return invalid();
    const replacement=bucket.slice(at+1);
    for(let i=0;i<at;i++)replacement.unshift(this.copyEntry(segment,bucket[i]!));
    segment.buckets[slot]=replacement;
    const position=segment.access.indexOf(entry);if(position>=0)segment.access.splice(position,1);
    if(active){segment.count--;segment.weight--;}
  }
  private expand(segment:CacheSegment):void{
    const length=segment.buckets.length;if(length>=65536)return invalid();
    const grown:CacheNode[][]=Array.from({length:length*2},()=>[]),mask=length*2-1;
    for(const bucket of segment.buckets){
      if(!bucket.length)continue;
      let lastRun=0,route=bucket[0]!.hash&mask;
      for(let i=1;i<bucket.length;i++)if((bucket[i]!.hash&mask)!==route){lastRun=i;route=bucket[i]!.hash&mask;}
      grown[route]!.push(...bucket.slice(lastRun));
      for(let i=0;i<lastRun;i++){const copy=this.copyEntry(segment,bucket[i]!);grown[copy.hash&mask]!.unshift(copy);}
    }
    segment.buckets=grown;segment.threshold=Math.trunc(length*2*3/4);
  }
}
