import {assertTable,canonical,type NativeDiagramComponent} from '@elysium/contracts';
import {hash,expandDiagramComponent,normalizeDiagramLookup,validateDiagramDefinition,validateDiagramEntry,nativeDiagramSelected,visitDiagramDisplay,visitDiagramTooltip,visitDiagramLabel} from '@neonei/catalog/source';
import type {DiagramPage,DiagramSearch,DiagramAnnotationPage} from '@neonei/catalog/source';
import {ApiError} from './transport.ts';
export type {DiagramPage,DiagramSearch};

export async function readDiagrams(read:(endpoint:string,signal?:AbortSignal)=>Promise<unknown>,search:DiagramSearch,signal?:AbortSignal):Promise<DiagramPage> {
  const parameters=new URLSearchParams(Object.entries(search).filter(([,value])=>value!==undefined).map(([key,value])=>[key,String(value)]));
  const raw=await read('/diagrams?'+parameters,signal);
  function invalid():never {throw new ApiError('invalid_response','原生关系图记录、候选或查询绑定不完整');}
  if(!raw||typeof raw!=='object'||Array.isArray(raw))invalid();const page=raw as DiagramPage;
  try {
    if(!Array.isArray(page.definitions)||page.definitions.length>5||!Array.isArray(page.diagrams)||!Array.isArray(page.matches)||!Array.isArray(page.lookups)||page.lookups.length>1||!Array.isArray(page.actions)||!Array.isArray(page.cells)||!Array.isArray(page.annotations)
      ||page.offset!==search.offset||page.limit!==search.limit||!Number.isSafeInteger(page.total)||page.total<0||page.total>262144||page.diagrams.length!==Math.max(0,Math.min(search.limit,page.total-search.offset)))invalid();
    const leaves=[...page.definitions,...page.diagrams,...page.matches,...page.lookups,...page.actions];assertTable({kind:'references',records:leaves});
    if(new Set(leaves.map(row=>row.id)).size!==leaves.length)invalid();
    for(const kind of ['items','fluids','categories','strings','textures','topics'] as const)assertTable({kind,records:page.related[kind]});
    const items=new Map(page.related.items.map(item=>[item.id,item]));
    for(let start=0;start<leaves.length;start+=16)if((await Promise.all(leaves.slice(start,start+16).map(async row=>row.id==='refrow_'+await hash(canonical({domain:row.domain,order:row.order,data:row.data}))))).some(valid=>!valid))invalid();
    const definitions=new Map(page.definitions.map(def=>[def.domain,def]));if(definitions.size!==page.definitions.length)invalid();
    for(const def of page.definitions){if(def.order!==0||def.data.kind!=='neiDiagramDefinition')invalid();validateDiagramDefinition(def.data);}
    const selected=page.definitions.find(def=>!search.group||def.data.group===search.group);
    if(page.actions.length!==(selected?1:0)||page.actions.some(action=>!selected||action.data.kind!=='neiDiagramAction'||action.domain!==selected.domain||action.data.group!==selected.data.group||action.data.key!==selected.data.group||action.data.consuming||canonical(action.data.source)!==canonical(selected.data.source)
      ||action.data.action!==0||action.order!==1+selected.data.counts.diagrams+selected.data.counts.bindings+selected.data.counts.lookups||new Set(action.data.diagrams).size!==action.data.diagrams.length||action.data.diagrams.some(id=>id>=selected.data.counts.diagrams)))invalid();
    const lookup=page.lookups[0];let normalized:NativeDiagramComponent|undefined;
    if(lookup){const q=lookup.data;
      if(!search.item||!selected||q.kind!=='neiDiagramLookup'||lookup.domain!==selected.domain||q.group!==selected.data.group||q.original.fact!==search.item||q.consuming||canonical(q.source)!==canonical(selected.data.source)||q.lookup>=selected.data.counts.lookups||lookup.order!==1+selected.data.counts.diagrams+selected.data.counts.bindings+q.lookup
        ||!q.bindings.length||q.bindings.some(i=>i>=selected.data.counts.bindings)||q.bindings.some((i,n)=>n>0&&i<=q.bindings[n-1]!))invalid();
      normalized=await normalizeDiagramLookup(q,selected.data.ignoreNbt,items);
    }
    if(page.total&&search.item&&!lookup||!search.item&&page.lookups.length)invalid();
    const expectedCells:DiagramPage['cells']=[],expectedAnnotations:DiagramAnnotationPage[]=[],components:NativeDiagramComponent[]=[];
    if(lookup)components.push(lookup.data.original);
    for(const row of page.diagrams){if(row.data.kind!=='neiDiagram'||row.domain!==selected?.domain||search.diagram&&row.id!==search.diagram)invalid();const def=definitions.get(row.domain);if(!def)invalid();validateDiagramEntry(row,def.data,page.actions);
      if(search.selection==='native'&&!nativeDiagramSelected(row.data,def.data.selection,search))invalid();
      if(search.action&&!page.actions.some(action=>action.data.key===search.action&&action.data.diagrams.includes(row.data.diagram)))invalid();
      if(search.item){const binding=page.matches.find(binding=>binding.data.diagrams.includes(row.data.diagram));if(!binding||!lookup||binding.data.kind!=='neiDiagramBinding'||binding.domain!==row.domain||binding.data.group!==row.data.group||binding.data.consuming||canonical(expandDiagramComponent(binding.data.component,items))!==canonical(normalized)||!lookup.data.bindings.includes(binding.data.binding)||search.direction&&binding.data.query!==search.direction
        ||!binding.data.diagrams.length||new Set(binding.data.diagrams).size!==binding.data.diagrams.length||binding.data.diagrams.some(i=>i>=def.data.counts.diagrams)||canonical(binding.data.source)!==canonical(def.data.source)||binding.order!==1+def.data.counts.diagrams+binding.data.binding||binding.data.binding>=def.data.counts.bindings)invalid();}
      const c=row.data.content;
      for(const [local,cell] of c.cells.slice(search.cellOffset,search.cellOffset+search.cellLimit).entries()){
        const alternatives=cell.alternatives.slice(search.choiceOffset,search.choiceOffset+search.choiceLimit);
        for(const display of alternatives)visitDiagramDisplay(display,component=>components.push(component));visitDiagramTooltip(cell.tooltip,component=>components.push(component));
        expectedCells.push({diagram:row.id,cell:search.cellOffset+local,group:cell.group,index:cell.index,total:cell.alternatives.length,offset:search.choiceOffset,limit:search.choiceLimit,alternatives});
      }
      const info:DiagramAnnotationPage[]=[...c.labels.map((label,index)=>({diagram:row.id,index,kind:'label' as const,label})),...c.annotations.map((annotation,index)=>({diagram:row.id,index,kind:'annotation' as const,annotation}))];
      for(const entry of info.slice(search.annotationOffset,search.annotationOffset+search.annotationLimit)){if(entry.kind==='label')visitDiagramLabel(entry.label,component=>components.push(component));else{visitDiagramLabel(entry.annotation.label,component=>components.push(component));visitDiagramTooltip(entry.annotation.tooltip,component=>components.push(component));}expectedAnnotations.push(entry);}
    }
    if(canonical(page.cells)!==canonical(expectedCells)||canonical(page.annotations)!==canonical(expectedAnnotations)||(!search.item&&page.matches.length!==0)||page.matches.some(binding=>!page.diagrams.some(row=>binding.data.diagrams.includes(row.data.diagram))))invalid();
    for(const binding of page.matches)components.push(binding.data.component);
    const fluids=new Map(page.related.fluids.map(fluid=>[fluid.id,fluid])),texts=new Set(page.related.strings.map(row=>row.id)),textures=new Set(page.related.textures.map(row=>row.id));
    const seen=new Set<string>();
    for(const value of components){const component=expandDiagramComponent(value,items);if(component.fact===null)continue;const key=canonical(component);if(seen.has(key))continue;seen.add(key);
      const record=component.kind==='item'?items.get(component.fact):fluids.get(component.fact);if(!record||record.registry!==component.registry||canonical(record.nbt)!==canonical(component.nbt)||!texts.has(record.name)||record.icon&&!textures.has(record.icon))invalid();
      const identity=component.kind==='item'?{kind:'item',registry:component.registry,meta:component.meta,nbt:component.nbt}:{kind:'fluid',registry:component.registry,nbt:component.nbt};
      if(component.fact!==component.kind+'_'+await hash(canonical(identity))||component.kind==='item'&&(!('meta' in record)||record.meta!==component.meta||record.tooltip.some(id=>!texts.has(id))))invalid();
    }
    if(page.related.categories.length!==page.definitions.length||page.definitions.some(def=>!page.related.categories.some(category=>category.reference===def.domain&&canonical(category.source)===canonical(def.data.source)&&texts.has(category.name))))invalid();
  }catch(error){if(error instanceof ApiError)throw error;invalid();}return page;
}
