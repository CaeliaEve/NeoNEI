import type {GeneticReferenceRow} from '@elysium/contracts';
import {canonical} from '@elysium/contracts';
import {Catalog,Fault} from './store.ts';
import type {Related} from './query.ts';
type Row<K extends GeneticReferenceRow['data']['kind']> = Omit<GeneticReferenceRow,'data'> & {data:Extract<GeneticReferenceRow['data'],{kind:K}>};
export type ForestryDefinition=Row<'forestryAddonsDefinition'>;
export type ForestrySpecies=Row<'forestryAddonsSpecies'>;
export type ForestryOutput=Row<'forestryAddonsOutput'>;
export type ForestryMutation=Row<'forestryAddonsMutation'>;
export interface ForestrySearch {mode:'produce'|'breeding';root:string;species:string;query:string;offset:number;limit:number}
export interface ForestryPage {
  view:'species'|'outputs'|'mutations';definitions:ForestryDefinition[];
  rows:Array<ForestrySpecies|ForestryOutput|ForestryMutation>;species:ForestrySpecies[];outputs:ForestryOutput[];
  total:number;offset:number;limit:number;related:Related;
}
const roots:Record<string,{root:string;mode:'produce'|'breeding'}>={
  'net.bdew.neiaddons.forestry.bees.BeeProduceHandler':{root:'rootBees',mode:'produce'},
  'net.bdew.neiaddons.forestry.trees.TreeProduceHandler':{root:'rootTrees',mode:'produce'},
  'net.bdew.neiaddons.forestry.bees.BeeBreedingHandler':{root:'rootBees',mode:'breeding'},
  'net.bdew.neiaddons.forestry.trees.TreeBreedingHandler':{root:'rootTrees',mode:'breeding'},
  'net.bdew.neiaddons.forestry.butterflies.ButterflyBreedingHandler':{root:'rootButterflies',mode:'breeding'},
  'net.bdew.neiaddons.botany.flowers.FlowerBreedingHandler':{root:'rootFlowers',mode:'breeding'},
};
const invalid:()=>never=()=>{throw new Fault('invalid_reference','Native Forestry Addons information is incomplete');};
export function nativeForestryFloat(value:{bits:string;decimal:string}):number {
  if(!/^[a-f0-9]{8}$/.test(value.bits)||value.decimal.length>64)invalid();
  const parsed=Math.fround(Number(value.decimal)),bytes=new DataView(new ArrayBuffer(4));bytes.setFloat32(0,parsed);
  if(!Number.isFinite(parsed)||parsed<0||bytes.getUint32(0)!==parseInt(value.bits,16))invalid();return parsed;
}
function positive(value:string){if(!/^[1-9][0-9]{0,9}$/.test(value)||Number(value)>2147483647)invalid();}
function genome(template:(string|null)[],species:string){if(!template.length||template.length>256||template[0]!==species||template.some(uid=>uid!==null&&(!uid||uid.length>256)))invalid();}
export function validateForestryDefinition(def:ForestryDefinition['data']):void {
  const source=roots[def.source.handler];
  if(!source||def.root!==source.root||def.mode!==source.mode||!def.ready||def.consuming||!def.source.owner||!def.source.key
    ||def.probability!=='nominalSpeciesValues'||def.outputOrder!=='stableRoleItemAmountFloatBits'||def.specimens!=='nativeAnalyzedTemplates')invalid();
  const expected=def.mode==='produce'?['producer']:['offspring','parent1','parent2'];
  if(canonical(Object.keys(def.memberTypes).sort())!==canonical(expected)||Object.values(def.memberTypes).some(value=>!Number.isSafeInteger(value)||value<0||value>255))invalid();
  const c=def.counts;
  if(Object.values(c).some(value=>!Number.isSafeInteger(value)||value<0)||c.species>65536||c.outputs>262144||c.mutations>262144
    ||(def.mode==='produce'?(def.showSecret!==null||c.nativeEntries!==c.species||c.mutations!==0||c.eligible!==0)
      :(typeof def.showSecret!=='boolean'||c.nativeEntries!==c.mutations||c.outputs!==0||c.eligible>c.mutations)))invalid();
}
export function validateForestrySpecies(row:ForestrySpecies,def:ForestryDefinition['data']):void {
  const s=row.data;genome(s.template,s.species);
  if(s.jubilance===undefined||s.jubilanceProvider===undefined)invalid();
  const roles=new Set(s.specimens.map(form=>form.role));
  if(s.ordinal>=def.counts.species||row.order!==1+s.ordinal||!s.species||!s.name||s.specimens.length!==Object.keys(def.memberTypes).length||roles.size!==s.specimens.length)invalid();
  for(const form of s.specimens){positive(form.amount);if(form.nativeType!==def.memberTypes[form.role]||!form.item)invalid();}
  if(s.jubilance!==null&&s.jubilanceProvider===null||def.mode==='breeding'&&(!s.listed||s.outputs!==0||s.jubilance!==null||s.jubilanceProvider!==null))invalid();
}
export function validateForestryOutput(row:ForestryOutput,species:ForestrySpecies,def:ForestryDefinition['data']):void {
  const output=row.data;positive(output.amount);nativeForestryFloat(output.rate);
  if(def.mode!=='produce'||row.domain!==species.domain||output.species!==species.data.species||output.ordinal>=species.data.outputs||row.order<=def.counts.species||row.order>def.counts.species+def.counts.outputs)invalid();
}
export function validateForestryMutation(row:ForestryMutation,def:ForestryDefinition['data']):void {
  const m=row.data;genome(m.template,m.result);nativeForestryFloat(m.base);
  if(m.conditions===undefined)invalid();
  if(def.mode!=='breeding'||m.ordinal>=def.counts.mutations||row.order!==1+def.counts.species+m.ordinal||!m.owner||m.parents.length!==2
    ||m.eligible!==(!m.secret||def.showSecret)||m.conditions!==null&&(m.conditions.length>256||m.conditions.some(text=>!text)))invalid();
}
interface Domain {definition:ForestryDefinition;species:Map<string,ForestrySpecies>;outputs:ForestryOutput[];mutations:ForestryMutation[]}
export class ForestryQuery {
  private pending?:Promise<Domain[]>;
  private readonly catalog:Pick<Catalog,'scan'|'records'>;
  constructor(catalog:Pick<Catalog,'scan'|'records'>){this.catalog=catalog;}
  private async load():Promise<Domain[]> {
    const groups=new Map<string,GeneticReferenceRow[]>();let bytes=0;
    for await(const row of this.catalog.scan('references')) {
      if(!row.data.kind.startsWith('forestryAddons'))continue;
      bytes+=JSON.stringify(row).length*2;if(bytes>64*1024*1024)throw new Fault('reference_limit','Forestry information index exceeds its budget');
      const rows=groups.get(row.domain)??[];rows.push(row);groups.set(row.domain,rows);
    }
    if(groups.size>6)invalid();const domains:Domain[]=[],owners=new Set<string>();
    for(const rows of groups.values()) {
      rows.sort((a,b)=>a.order-b.order);if(rows[0]?.data.kind!=='forestryAddonsDefinition')invalid();
      const definition=rows[0] as ForestryDefinition,def=definition.data;validateForestryDefinition(def);
      if(owners.has(def.source.handler)||rows.length!==1+def.counts.species+def.counts.outputs+def.counts.mutations||rows.some((row,i)=>row.order!==i))invalid();owners.add(def.source.handler);
      const species=new Map<string,ForestrySpecies>(),outputs:ForestryOutput[]=[],mutations:ForestryMutation[]=[];
      for(const row of rows.slice(1)) {
        if(row.data.kind==='forestryAddonsSpecies'){const value=row as ForestrySpecies;validateForestrySpecies(value,def);if(species.has(value.data.species))invalid();species.set(value.data.species,value);}
        else if(row.data.kind==='forestryAddonsOutput')outputs.push(row as ForestryOutput);
        else if(row.data.kind==='forestryAddonsMutation')mutations.push(row as ForestryMutation);
        else invalid();
      }
      if(species.size!==def.counts.species||outputs.length!==def.counts.outputs||mutations.length!==def.counts.mutations)invalid();
      const counts=new Map<string,number>();for(const row of outputs){const owner=species.get(row.data.species);if(!owner)invalid();validateForestryOutput(row,owner,def);if(row.data.ordinal!==(counts.get(row.data.species)??0))invalid();counts.set(row.data.species,row.data.ordinal+1);}
      for(const row of mutations){validateForestryMutation(row,def);if([...row.data.parents,row.data.result].some(uid=>!species.has(uid)))invalid();}
      if(mutations.filter(row=>row.data.eligible).length!==def.counts.eligible)invalid();
      if(def.mode==='produce')for(const s of species.values())if(s.data.outputs!==(counts.get(s.data.species)??0)||s.data.listed!==(s.data.outputs>0))invalid();
      domains.push({definition,species,outputs,mutations});
    }return domains;
  }
  async page(search:ForestrySearch):Promise<ForestryPage> {
    if(!['produce','breeding'].includes(search.mode)||search.root&&!Object.values(roots).some(value=>value.root===search.root)||search.species.length>256||search.query.length>256
      ||!Number.isSafeInteger(search.offset)||search.offset<0||!Number.isSafeInteger(search.limit)||search.limit<1||search.limit>100)throw new Fault('invalid_query','Invalid Forestry information query',400);
    this.pending??=this.load().catch(error=>{this.pending=undefined;throw error;});
    const domains=(await this.pending).filter(d=>d.definition.data.mode===search.mode&&(!search.root||d.definition.data.root===search.root));
    const byDomain=new Map(domains.map(d=>[d.definition.domain,d]));
    const view=search.mode==='breeding'?'mutations':search.species?'outputs':'species';
    const query=search.query.trim().toLocaleLowerCase(),match=(d:Domain,uid:string)=>(uid+' '+d.species.get(uid)!.data.name).toLocaleLowerCase().includes(query);
    const candidates:Array<ForestrySpecies|ForestryOutput|ForestryMutation>=[];
    for(const d of domains) {
      if(view==='species')candidates.push(...[...d.species.values()].filter(row=>row.data.listed&&(!query||match(d,row.data.species))));
      else if(view==='outputs')candidates.push(...d.outputs.filter(row=>row.data.species===search.species&&(!query||match(d,row.data.species))));
      else candidates.push(...d.mutations.filter(row=>row.data.eligible&&(!search.species||[...row.data.parents,row.data.result].includes(search.species))&&(!query||[...row.data.parents,row.data.result].some(uid=>match(d,uid)))));
    }
    const rows=candidates.slice(search.offset,search.offset+search.limit),selected=new Map<string,ForestrySpecies>();
    const add=(d:Domain,uid:string)=>{const species=d.species.get(uid);if(!species)invalid();selected.set(d.definition.domain+':'+uid,species);};
    for(const row of rows){const d=byDomain.get(row.domain)!;if(row.data.kind==='forestryAddonsSpecies')add(d,row.data.species);else if(row.data.kind==='forestryAddonsOutput')add(d,row.data.species);else for(const uid of [...row.data.parents,row.data.result])add(d,uid);}
    if(view==='outputs')for(const d of domains)if(d.species.has(search.species))add(d,search.species);
    const species=[...selected.values()],outputs=rows.filter((row):row is ForestryOutput=>row.data.kind==='forestryAddonsOutput');
    const items=await this.catalog.records('items',new Set([...species.flatMap(row=>row.data.specimens.map(form=>form.item)),...outputs.map(row=>row.data.item)]));
    const categories:Related['categories']=[];for await(const category of this.catalog.scan('categories'))if(byDomain.has(category.reference??''))categories.push(category);
    if(categories.length!==domains.length||domains.some(d=>!categories.some(category=>category.reference===d.definition.domain&&canonical(category.source)===canonical(d.definition.data.source))))invalid();
    const strings=await this.catalog.records('strings',new Set([...items.flatMap(item=>[item.name,...item.tooltip]),...categories.map(row=>row.name)]));
    const textures=await this.catalog.records('textures',new Set(items.flatMap(item=>item.icon?[item.icon]:[])));
    const result:ForestryPage={view,definitions:domains.map(d=>d.definition),rows,species,outputs,total:candidates.length,offset:search.offset,limit:search.limit,
      related:{items,categories,strings,textures,fluids:[],topics:[]}};
    if(JSON.stringify(result).length>16*1024*1024)throw new Fault('reference_limit','Forestry information page exceeds its budget');return result;
  }
}
