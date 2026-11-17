import {canonical,type Nbt} from '@elysium/contracts';
import {nativeBeePoolMatchOwned,nativeBeePoolGenomeLoad} from './botania-bee.ts';
import type {BeePoolSource,BeePoolStack} from './botania-bee.ts';
import {NativePoolCacheMachine} from './botania-cache.ts';
import type {PoolCacheState} from './botania-cache.ts';
import type {PoolSelection,PoolSelectionEntry} from './botania-selection.ts';
export {reconstructNativeBeePool} from './botania-program.ts';

export type PoolSessionEntry=Exclude<PoolSelectionEntry,{kind:'bee'|'mini'}>|
  Extract<PoolSelectionEntry,{kind:'mini'}>&{coercions?:{input:BeePoolStack;value:string}[]}|
  Extract<PoolSelectionEntry,{kind:'bee'}>&{displayInput:BeePoolStack;prototype:BeePoolStack;cachedOutput:BeePoolStack};
const invalid=():never=>{throw new Error('Invalid or unadapted native pool session');};
const fields=(tag:Nbt|null|undefined):Record<string,Nbt>=>tag?.type==='compound'?tag.value:{};

/** One serial detached session: registry selection and output caches observe the
 * same native cache transitions. Each independent preview starts a new session. */
export class NativeBeePoolSession {
  private readonly source:BeePoolSource;
  private readonly entries:PoolSessionEntry[];
  private readonly cached:(BeePoolStack|null)[];
  private cache:NativePoolCacheMachine;
  private valid=true;
  constructor(source:BeePoolSource,entries:readonly PoolSessionEntry[],state:PoolCacheState){
    if(entries.length>4096||new TextEncoder().encode(JSON.stringify(entries)).length>16*1024*1024)invalid();
    this.source=structuredClone(source);this.entries=structuredClone([...entries]);
    this.cache=new NativePoolCacheMachine(state);
    this.cached=this.entries.map(entry=>{
      if(entry.kind!=='bee')return null;
      if(!entry.prototype||!entry.cachedOutput)return invalid();
      return structuredClone(entry.cachedOutput);
    });
  }
  private alive():void{if(!this.valid)invalid();}
  outputs():(BeePoolStack|null)[]{this.alive();return structuredClone(this.cached);}
  cacheState():PoolCacheState{this.alive();return this.cache.snapshot();}
  takeOutput(index:number):BeePoolStack{
    this.alive();
    const entry=this.entries[index],current=this.cached[index];
    if(!entry||entry.kind!=='bee'||!current)return invalid();
    this.cached[index]=structuredClone(entry.prototype);return structuredClone(current);
  }
  select(offered:BeePoolStack|null,alchemy:boolean,conjuration:boolean,mana:number,clock:()=>string):PoolSelection{
    this.alive();
    try{
      const result=this.selectOwned(offered,alchemy,conjuration,mana,clock);
      this.cache=new NativePoolCacheMachine(this.cache.snapshot());return result;
    }catch(error){this.valid=false;throw error;}
  }
  private selectOwned(offered:BeePoolStack|null,alchemy:boolean,conjuration:boolean,mana:number,clock:()=>string):PoolSelection{
    const owned=structuredClone(offered);
    let result:PoolSelection['result']={state:'notMatched'},visited=0,predicates=0;
      if(owned)for(const [index,entry] of this.entries.entries()){
        visited++;let accepted=false,output:BeePoolStack|null=null;
        switch(entry.kind){
          case 'bee':{
            const match=nativeBeePoolMatchOwned(this.source,entry.form,entry.inputSpecies,entry.outputSpecies,owned,genome=>{
              const tag:Nbt=genome?.type==='compound'?genome:{type:'compound',value:{}};
              const id=this.cache.bindOwned(tag);
              const read=this.cache.get(id,clock,key=>nativeBeePoolGenomeLoad(this.source,this.cache.key(key)));
              return read.kind==='nativeError'?{nativeError:true}:{chromosome:read.chromosome};
            });
            if(match.state==='nativeError')return {result:{state:'nativeError',index},offeredAfter:owned,visited};
            if(match.state==='matched'){accepted=true;this.cached[index]=structuredClone(match.output);}
            break;
          }
          case 'item':
            for(const predicate of entry.predicates){
              if(++predicates>65536)return invalid();
              if(predicate.registry===owned.registry&&(predicate.metadata===32767||predicate.metadata===owned.meta)){
                accepted=true;break;
              }
            }
            output=entry.output;break;
          case 'mini':{
            const tag=fields(owned.nbt).type;
            let observed:string;
            if(!tag)observed='';
            else if(tag.type==='string')observed=tag.value;
            else{
              const candidates=(entry.coercions??[]).filter(row=>row.input.registry===owned.registry
                &&row.input.meta===owned.meta&&canonical(row.input.nbt)===canonical(owned.nbt));
              if(!candidates.length||candidates.some(row=>row.value!==candidates[0]!.value))return invalid();
              observed=candidates[0]!.value;
            }
            accepted=entry.key===observed;output=entry.output;break;
          }
          default:return invalid();
        }
        if(!accepted||entry.alchemy&&!alchemy||entry.conjuration&&!conjuration)continue;
        if(mana<entry.mana)result={state:'insufficientMana',index};
        else{
          if(entry.kind==='bee')output=this.takeOutput(index);if(!output)return invalid();
          result={state:'selected',index,output:structuredClone(output)};
        }
        break;
      }
      return {result,offeredAfter:owned,visited};
  }
}
