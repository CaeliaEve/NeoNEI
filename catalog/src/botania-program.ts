import {assertTable,canonical,type ProgramChunk} from '@elysium/contracts';
import type {BeePoolSource} from './botania-bee.ts';
import {NativePoolCacheMachine,type PoolCacheState} from './botania-cache.ts';
import type {PoolSessionEntry} from './botania-session.ts';
import {nativeNbtHash} from './native-nbt.ts';

type Rows<K extends ProgramChunk['data']['kind']>=Extract<ProgramChunk['data'],{kind:K}>['rows'];
export interface NativeBeePoolProgram {
  settings:Rows<'beePoolSettings'>;chromosomes:Rows<'beePoolChromosomes'>;definitions:Rows<'beePoolDefinitions'>;
  alleles:Rows<'beePoolAlleles'>;aliases:Rows<'beePoolAliases'>;templates:Rows<'beePoolTemplates'>;
  defaults:Rows<'beePoolDefaults'>;forest:Rows<'beePoolForest'>;forms:Rows<'beePoolForms'>;
  entries:Rows<'beePoolEntries'>;keys:Rows<'beePoolKeys'>;cacheEntries:Rows<'beePoolCacheEntries'>;segments:Rows<'beePoolSegments'>;
}
const sections=['beePoolSettings','beePoolChromosomes','beePoolDefinitions','beePoolAlleles','beePoolAliases',
  'beePoolTemplates','beePoolDefaults','beePoolForest','beePoolForms','beePoolEntries','beePoolKeys','beePoolCacheEntries','beePoolSegments'] as const;
const keys=['settings','chromosomes','definitions','alleles','aliases','templates','defaults','forest','forms',
  'entries','keys','cacheEntries','segments'] as const;
const chromosomeTypes=[
  'forestry.api.apiculture.IAlleleBeeSpecies','forestry.api.genetics.IAlleleFloat',
  'forestry.api.genetics.IAlleleInteger','forestry.api.genetics.IAlleleInteger',
  'forestry.api.genetics.IAlleleTolerance','forestry.api.genetics.IAlleleBoolean',
  'forestry.api.genetics.IAllele','forestry.api.genetics.IAlleleTolerance',
  'forestry.api.genetics.IAlleleBoolean','forestry.api.genetics.IAlleleBoolean',
  'forestry.api.genetics.IAlleleFlowers','forestry.api.genetics.IAlleleInteger',
  'forestry.api.genetics.IAlleleArea','forestry.api.apiculture.IAlleleBeeEffect'];
function ensure(value:unknown):asserts value{if(!value)throw new Error('Invalid native bee pool shared program');}
const bytes=(value:unknown):number=>new TextEncoder().encode(canonical(value)).byteLength;
const text=(value:string):boolean=>value.length>0&&value.length<=16384;
const ordered=(rows:readonly {key:string}[]):boolean=>rows.every((row,i)=>text(row.key)&&(!i||rows[i-1]!.key<row.key));
const nanos=(value:string):bigint=>{
  ensure(/^(-?[1-9][0-9]*|0)$/.test(value)&&value.length<=20);
  const parsed=BigInt(value);ensure(BigInt.asIntN(64,parsed)===parsed);return parsed;
};
async function identity(prefix:string,value:unknown):Promise<string>{
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(value)));
  return prefix+'_'+[...new Uint8Array(hash)].map(v=>v.toString(16).padStart(2,'0')).join('');
}
export function nativeBeePoolContext(rules:NativeBeePoolProgram):{
  source:BeePoolSource;cache:PoolCacheState;entries:PoolSessionEntry[];
}{
  ensure(rules.settings.length===1&&rules.entries.length<=4096&&rules.definitions.length<=262144
    &&rules.alleles.length<=524288&&rules.aliases.length<=262144&&rules.templates.length<=262144&&bytes(rules)<=16*1024*1024);
  const settings=rules.settings[0]!,runtime=settings.runtime;
  ensure(settings.revision===1&&settings.forestry==='4.10.17'&&settings.magicbees==='2.9.4-GTNH'&&settings.root==='rootBees'
    &&runtime.runtime==='guava17StrongAccess'&&runtime.clock==='javaSystemNanoTime'
    &&runtime.artifactSha256==='8c36a80ea613d0b6b8040a17cf837c5bbe3677bc1b06a058a6c174fdb787ebbc'
    &&runtime.scope==='serialOwnedTransitionsFromBoundSnapshotWithExplicitTickerReads'
    &&BigInt.asIntN(64,nanos(runtime.afterNanos)-nanos(runtime.beforeNanos))>=0n);
  ensure(canonical(rules.chromosomes)===canonical(chromosomeTypes)&&rules.defaults.length===14&&rules.forest.length===14
    &&ordered(rules.definitions)&&ordered(rules.aliases)&&ordered(rules.templates)&&ordered(rules.forms));
  const definitions=new Map(rules.definitions.map(row=>[row.key,row.allele]));
  for(const row of rules.definitions)ensure(row.key===row.allele.uid&&row.allele.slots.length<=14
    &&row.allele.slots.every((slot,i)=>Number.isInteger(slot)&&slot>=0&&slot<14&&(!i||row.allele.slots[i-1]!<slot)));
  const registrations=new Set<string>();
  for(const row of rules.alleles){
    const key=canonical([Boolean(row.aliasOnly),row.key]),allele=definitions.get(row.uid);
    ensure(allele&&text(row.key)&&!registrations.has(key)&&row.dominant===allele.dominant
      &&canonical(row.slots)===canonical(allele.slots)&&(!row.aliasOnly||rules.aliases.some(v=>v.key===row.key&&v.uid===row.uid)));
    registrations.add(key);
  }
  for(const row of rules.aliases)ensure(definitions.has(row.uid));
  for(const row of rules.templates)ensure(row.alleles.length===14);
  for(const uid of [...rules.defaults,...rules.templates.flatMap(v=>v.alleles),
    ...rules.forest.flatMap(v=>v?[v.primary,v.secondary]:[])])ensure(uid===null||definitions.has(uid));
  ensure(canonical(rules.forms.map(v=>v.key))===canonical(['beeDroneGE','beeLarvaeGE','beePrincessGE','beeQueenGE'])
    &&new Set(rules.forms.map(v=>v.registry)).size===4&&rules.forms.every(v=>text(v.registry)&&v.registry.length<=512));
  let predicates=0;
  for(const entry of rules.entries){
    const stacks=entry.kind==='bee'?[entry.displayInput,entry.prototype,entry.cachedOutput]:[entry.output];
    for(const stack of stacks){
      ensure(text(stack.registry)&&stack.registry.length<=512&&/^[1-9][0-9]*$/.test(stack.amount)
        &&stack.amount.length<=10&&BigInt(stack.amount)<=2147483647n);
      if(stack.nbt!=null){ensure(stack.nbt.type==='compound');nativeNbtHash(stack.nbt);}
    }
    if(entry.kind==='bee')ensure(rules.forms.some(v=>v.key===entry.form
        &&stacks.every(stack=>stack.registry===v.registry))
      &&[entry.inputSpecies,entry.outputSpecies].every(uid=>definitions.get(uid)?.slots.includes(0)));
    else if(entry.kind==='item'){
      predicates+=entry.predicates.length;ensure(predicates<=65536&&entry.predicates.every(v=>text(v.registry)&&v.registry.length<=512));
    }else{
      ensure(entry.key.length<=16384&&(entry.coercions?.length??0)<=4096);
      const observations=new Map<string,string>();
      for(const row of entry.coercions??[]){
        ensure(text(row.input.registry)&&row.input.registry.length<=512&&/^[1-9][0-9]*$/.test(row.input.amount)
          &&row.input.amount.length<=10&&BigInt(row.input.amount)<=2147483647n&&row.value.length<=16384);
        if(row.input.nbt!=null){ensure(row.input.nbt.type==='compound');nativeNbtHash(row.input.nbt);}
        const identity=canonical([row.input.registry,row.input.meta,row.input.nbt]);
        ensure(!observations.has(identity)||observations.get(identity)===row.value);observations.set(identity,row.value);
        const tag=row.input.nbt?.type==='compound'?row.input.nbt.value.type:undefined;
        if(!tag)ensure(row.value==='');else if(tag.type==='string')ensure(tag.value===row.value);
      }
    }
  }
  const source:BeePoolSource={
    forestry:settings.forestry,magicbees:settings.magicbees,root:settings.root,clearInvalidChromosomes:settings.clearInvalidChromosomes,
    chromosomes:rules.chromosomes,definitions:Object.fromEntries(rules.definitions.map(v=>[v.key,v.allele])),alleles:rules.alleles,
    aliases:Object.fromEntries(rules.aliases.map(v=>[v.key,v.uid])),templates:Object.fromEntries(rules.templates.map(v=>[v.key,v.alleles])),
    defaults:rules.defaults,forest:rules.forest,forms:Object.fromEntries(rules.forms.map(v=>[v.key,v.registry])),
  };
  const cache:PoolCacheState={shift:settings.shift,mask:settings.mask,keys:rules.keys,entries:rules.cacheEntries,segments:rules.segments};
  new NativePoolCacheMachine(cache);
  for(const cell of cache.entries.flatMap(v=>v.chromosome?[v.chromosome.primary,v.chromosome.secondary]:[])){
    if(!cell?.sourceIdentity)continue;const allele=definitions.get(cell.uid);
    ensure(allele&&allele.dominant===cell.dominant&&allele.slots.includes(0)===cell.beeSpecies);
  }
  return structuredClone({source,cache,entries:rules.entries});
}

/** Validates every chunk and the whole source-bound program before evaluation.
 * Explicit empty sections distinguish an empty registry from missing data. */
export async function reconstructNativeBeePool(program:string,chunks:readonly ProgramChunk[]):Promise<{
  source:BeePoolSource;cache:PoolCacheState;entries:PoolSessionEntry[];
}>{
  ensure(/^program_[0-9a-f]{64}$/.test(program)&&chunks.length>0&&chunks.length<=65536);
  const rules:NativeBeePoolProgram={settings:[],chromosomes:[],definitions:[],alleles:[],aliases:[],templates:[],
    defaults:[],forest:[],forms:[],entries:[],keys:[],cacheEntries:[],segments:[]};
  const ids=new Set<string>();let total=0;
  for(const chunk of chunks){
    const size=bytes(chunk);total+=size;ensure(size<=1024*1024&&total<=32*1024*1024&&chunk.program===program
      &&chunk.data.rows.length<=128&&!ids.has(chunk.id));
    assertTable({kind:'programs',records:[chunk]});ids.add(chunk.id);
    const {id,...value}=chunk;ensure(id===program+'.'+await identity('chunk',value));
  }
  let consumed=0;
  for(const [i,kind] of sections.entries()){
    const pieces=chunks.filter(v=>v.data.kind===kind).sort((a,b)=>a.offset-b.offset);
    ensure(pieces.length>0);const target=rules[keys[i]!];let empty=false;
    for(const piece of pieces){
      ensure(!empty&&piece.offset===target.length);empty=piece.data.rows.length===0;consumed++;
      (target as unknown[]).push(...structuredClone(piece.data.rows));
    }
  }
  ensure(consumed===chunks.length&&await identity('program',{kind:'magicBeesPool',rules})===program);
  return nativeBeePoolContext(rules);
}
