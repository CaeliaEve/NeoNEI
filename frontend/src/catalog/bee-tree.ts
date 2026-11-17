import {assertTable} from '@elysium/contracts';
import type {BeeTreePage,BeeTreeSearch,BeeTreeNode,BeeTreeMutation} from '@neonei/catalog/source';
import {ApiError} from './transport.ts';
export type {BeeTreePage,BeeTreeSearch,BeeTreeNode} from '@neonei/catalog/source';
const invalid=():never=>{throw new ApiError('invalid_response','蜜蜂育种树资料不完整或原生规则不一致');};
export async function readBeeTree(read:(path:string,signal?:AbortSignal)=>Promise<unknown>,search:BeeTreeSearch,signal?:AbortSignal):Promise<BeeTreePage> {
  const raw=await read('/bee-tree?'+new URLSearchParams({...search,offset:String(search.offset),limit:String(search.limit)}),signal);
  if(!raw||typeof raw!=='object'||Array.isArray(raw)) invalid();const page=raw as BeeTreePage;
  const lineageRows=new Map<string,BeeTreeMutation>();let nodes=0;
  const collect=(node:BeeTreeNode|null,depth:number)=>{
    if(!node||typeof node!=='object'||++nodes>15||node.depth!==depth||depth>3||!Array.isArray(node.children)||node.children.length>2
      ||typeof node.repeated!=='boolean'||typeof node.truncated!=='boolean') invalid();
    if(node.route) lineageRows.set(node.route.id,node.route);
    for(const child of node.children) collect(child,depth+1);
  };
  try {
    if(page.lineage) collect(page.lineage,0);
    const refs=new Map([...page.rows,...page.species,...lineageRows.values(),...(page.definition?[page.definition]:[])].map(row=>[row.id,row]));
    assertTable({kind:'references',records:[...refs.values()]});
    for(const kind of ['items','fluids','categories','strings','textures','topics'] as const) assertTable({kind,records:page.related[kind]});
  } catch {invalid();}
  if(!Number.isSafeInteger(page.total)||page.total<0||page.offset!==search.offset||page.limit!==search.limit
    ||page.rows.length!==Math.max(0,Math.min(page.limit,page.total-page.offset))) invalid();
  if(!page.definition) {
    if(page.definition!==null||page.total||page.species.length||page.lineage||page.related.items.length||page.related.categories.length) invalid();return page;
  }
  const definition=page.definition,data=definition.data,category=page.related.categories[0];
  if(data.kind!=='beeTreeDefinition'||!data.ready||data.consuming||definition.order!==0||data.root!=='rootBees'
    ||data.source.handler!=='hellfirepvp.beebetteratbees.client.gui.BBABGuiRecipeTreeHandler'
    ||data.nativeTreeDepth!==4||data.nativeVisibleParentDepth!==3||page.related.categories.length!==1||!category
    ||category.reference!==definition.domain||category.source.handler!==data.source.handler||category.source.owner!==data.source.owner||category.source.key!==data.source.key) invalid();
  const species=new Map(page.species.map(row=>[row.data.species,row])),items=new Map(page.related.items.map(row=>[row.id,row]));
  const strings=new Set(page.related.strings.map(row=>row.id)),textures=new Set(page.related.textures.map(row=>row.id));
  if(species.size!==page.species.length||!strings.has(category.name)) invalid();
  for(const row of species.values()) {
    if(row.data.kind!=='beeTreeSpecies'||row.domain!==definition.domain||row.data.princess===row.data.drone) invalid();
    for(const id of [row.data.princess,row.data.drone]) {
      const item=items.get(id);if(!item||!strings.has(item.name)||item.tooltip.some(id=>!strings.has(id))||item.icon&&!textures.has(item.icon)) invalid();
    }
  }
  const check=(row:BeeTreeMutation)=>{
    if(row.data.kind!=='beeTreeMutation'||row.domain!==definition.domain||row.data.ordinal>=data.counts.mutations
      ||row.order!==1+data.counts.species+row.data.ordinal||row.data.eligible!==(!row.data.secret||data.showSecret)
      ||row.data.template[0]!==row.data.result||[...row.data.parents,row.data.result].some(uid=>!species.has(uid))) invalid();
    const fraction=row.data.chance;if(!/^(0|[1-9][0-9]*)$/.test(fraction.numerator)||!/^([1-9][0-9]*)$/.test(fraction.denominator)
      ||fraction.numerator.length>19||fraction.denominator.length>19||BigInt(fraction.numerator)>BigInt(fraction.denominator)) invalid();
  };
  let previous=-1;
  for(const row of page.rows) {
    check(row);
    if(!row.data.eligible||row.data.ordinal<=previous||search.species&&(search.direction==='origins'?row.data.result!==search.species:!row.data.parents.includes(search.species))) invalid();
    previous=row.data.ordinal;
  }
  const validateNode=(node:BeeTreeNode)=>{
    if(!species.has(node.species)||node.route&&node.route.data.result!==node.species||node.repeated&&data.showDuplicateTrees
      ||node.truncated&&node.depth!==3||node.children.length!==0&&node.children.length!==2||node.depth===3&&node.children.length
      ||node.repeated&&node.children.length||!node.route&&(node.children.length||node.repeated||node.truncated)) invalid();
    if(node.route) check(node.route);
    if(node.children.length&&(!node.route||node.children.some((child,i)=>child.species!==node.route!.data.parents[i]))) invalid();
    for(const child of node.children) validateNode(child);
  };
  if(page.lineage) {if(page.lineage.species!==search.species) invalid();validateNode(page.lineage);}
  return page;
}
