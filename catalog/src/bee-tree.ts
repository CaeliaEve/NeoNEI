import type {GeneticReferenceRow} from '@elysium/contracts';
import {Catalog, Fault} from './store.ts';
import type {Related} from './query.ts';
type Row<K extends GeneticReferenceRow['data']['kind']> = Omit<GeneticReferenceRow,'data'> & {data:Extract<GeneticReferenceRow['data'],{kind:K}>};
export type BeeTreeDefinition=Row<'beeTreeDefinition'>;
export type BeeTreeSpecies=Row<'beeTreeSpecies'>;
export type BeeTreeMutation=Row<'beeTreeMutation'>;
export interface BeeTreeSearch {species:string;direction:'origins'|'crosses';query:string;offset:number;limit:number}
export interface BeeTreeNode {species:string;depth:number;route:BeeTreeMutation|null;repeated:boolean;truncated:boolean;children:BeeTreeNode[]}
export interface BeeTreePage {
  definition:BeeTreeDefinition|null;rows:BeeTreeMutation[];species:BeeTreeSpecies[];lineage:BeeTreeNode|null;
  total:number;offset:number;limit:number;related:Related;
}
interface Index {definition:BeeTreeDefinition|null;species:Map<string,BeeTreeSpecies>;routes:BeeTreeMutation[];first:Map<string,BeeTreeMutation>}
export class BeeTreeQuery {
  private pending?:Promise<Index>;
  private readonly catalog:Pick<Catalog,'scan'|'records'>;
  constructor(catalog:Pick<Catalog,'scan'|'records'>) {this.catalog=catalog;}
  private index() {return this.pending??=this.load().catch(error=>{this.pending=undefined;throw error;});}
  private async load():Promise<Index> {
    let definition:BeeTreeDefinition|null=null, bytes=0;const species=new Map<string,BeeTreeSpecies>(),routes:BeeTreeMutation[]=[];
    const domains=new Set<string>();
    for await(const row of this.catalog.scan('references')) {
      if(!['beeTreeDefinition','beeTreeSpecies','beeTreeMutation'].includes(row.data.kind)) continue;
      bytes+=JSON.stringify(row).length*2;
      if(bytes>64*1024*1024 || species.size+routes.length>327680) throw new Fault('reference_limit','Bee tree index exceeds budget');
      domains.add(row.domain);
      if(row.data.kind==='beeTreeDefinition') {
        if(definition) throw new Fault('invalid_reference','Ambiguous bee tree definition');definition=row as BeeTreeDefinition;
      } else if(row.data.kind==='beeTreeSpecies') {
        if(species.has(row.data.species)) throw new Fault('invalid_reference','Duplicate bee tree species');
        species.set(row.data.species,row as BeeTreeSpecies);
      } else routes.push(row as BeeTreeMutation);
    }
    if(!definition) {
      if(species.size||routes.length) throw new Fault('invalid_reference','Bee tree definition is absent');
      return {definition,species,routes,first:new Map()};
    }
    const data=definition.data;routes.sort((a,b)=>a.data.ordinal-b.data.ordinal);
    if(!data.ready||data.consuming||definition.order!==0||domains.size!==1||!domains.has(definition.domain)
      ||data.counts.species!==species.size||data.counts.mutations!==routes.length
      ||data.counts.eligible!==routes.filter(row=>row.data.eligible).length
      ||routes.some((row,i)=>row.data.ordinal!==i||row.order!==1+species.size+i||row.data.eligible!==(!row.data.secret||data.showSecret)
        ||[...row.data.parents,row.data.result].some(uid=>!species.has(uid))))
      throw new Fault('invalid_reference','Bee tree graph is incomplete or consuming');
    const first=new Map<string,BeeTreeMutation>();for(const row of routes) if(!first.has(row.data.result)) first.set(row.data.result,row);
    return {definition,species,routes,first};
  }
  async page(search:BeeTreeSearch):Promise<BeeTreePage> {
    if(!['origins','crosses'].includes(search.direction)||search.query.length>256||search.species.length>256
      ||!Number.isSafeInteger(search.offset)||search.offset<0||!Number.isSafeInteger(search.limit)||search.limit<1||search.limit>100)
      throw new Fault('invalid_query','Invalid bee tree query',400);
    const index=await this.index(),query=search.query.trim().toLocaleLowerCase();
    const matches=index.routes.filter(row=>row.data.eligible && (!search.species||
      (search.direction==='origins'?row.data.result===search.species:row.data.parents.includes(search.species)))
      && (!query||[...row.data.parents,row.data.result].some(uid=>{
        const species=index.species.get(uid)!;return (uid+' '+species.data.name).toLocaleLowerCase().includes(query);
      })));
    const rows=matches.slice(search.offset,search.offset+search.limit),selected=new Set(rows.flatMap(row=>[...row.data.parents,row.data.result]));
    let lineage:BeeTreeNode|null=null;
    if(search.species&&index.definition&&index.routes.some(row=>row.data.result===search.species&&row.data.eligible)) {
      const seen=new Set<string>();
      const build=(species:string,depth:number):BeeTreeNode=>{
        const route=index.first.get(species)??null,repeated=Boolean(route&&!index.definition!.data.showDuplicateTrees&&seen.has(species));
        seen.add(species);
        return {species,depth,route,repeated,truncated:false,children:route&&!repeated&&depth<4?route.data.parents.map(uid=>build(uid,depth+1)):[]};
      };
      const trim=(node:BeeTreeNode):BeeTreeNode=>{
        selected.add(node.species);
        return {...node,truncated:node.depth===3&&node.children.length>0,children:node.depth<3?node.children.map(trim):[]};
      };
      lineage=trim(build(search.species,0));
    }
    const species=[...selected].sort().map(uid=>index.species.get(uid)!);
    const items=await this.catalog.records('items',new Set(species.flatMap(row=>[row.data.princess,row.data.drone]))),categories=[];
    if(index.definition) for await(const category of this.catalog.scan('categories')) if(category.reference===index.definition.domain) categories.push(category);
    const strings=await this.catalog.records('strings',new Set([...items.flatMap(row=>[row.name,...row.tooltip]),...categories.map(row=>row.name)]));
    const textures=await this.catalog.records('textures',new Set(items.flatMap(row=>row.icon?[row.icon]:[])));
    return {definition:index.definition,rows,species,lineage,total:matches.length,offset:search.offset,limit:search.limit,
      related:{items,categories,strings,textures,fluids:[],topics:[]}};
  }
}
