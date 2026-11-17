import {canonical,type GeneticReferenceRow,type Item} from '@elysium/contracts';
import {Catalog,Fault,hash} from './store.ts';
import {Query,type Related} from './query.ts';
export type ProjectBlueRow<K extends GeneticReferenceRow['data']['kind']>=Omit<GeneticReferenceRow,'data'>&{data:Extract<GeneticReferenceRow['data'],{kind:K}>};
export type ProjectBlueDefinition=ProjectBlueRow<'projectBlueDefinition'>;
export type ProjectBlueRule=ProjectBlueRow<'projectBlueRule'>;
export type ProjectBlueExample=ProjectBlueRow<'projectBlueExample'>;
export type ProjectBlueItem=ProjectBlueRow<'projectBlueItem'>;
export type ProjectBlueMaterial=ProjectBlueRow<'projectBlueCachedMaterial'>|ProjectBlueRow<'projectBlueRegisteredMaterial'>|ProjectBlueRow<'projectBlueMaterialAlias'>;
export interface ProjectBlueSearch {mode:'all'|'panel'|'miniature'|'paint';offset:number;limit:number}
export interface ProjectBluePage {definition:ProjectBlueDefinition|null;rules:ProjectBlueRule[];roles:ProjectBlueItem[];materials:ProjectBlueMaterial[];examples:ProjectBlueExample[];total:number;offset:number;limit:number;related:Related}
function invalid():never{throw new Fault('invalid_reference','ProjectBlue native predicate, material observation or callback output differs');}
export function validateProjectBlueDefinition(row:ProjectBlueDefinition):void {
  const def=row.data;
  if(row.order!==0||def.source.handler!=='gcewing.projectblue.nei.NEIRecipeHandler'||!def.source.owner||!def.source.key||!def.ready||def.consuming||def.gridWidth!==3||def.gridHeight!==3||def.pickup!=='vanillaWorkbenchAllOccupiedCells'
    ||def.nativeRules>262144||def.nativeRules!==def.counts.rules||Object.keys(def.core).length!==(def.nativeRules?9:0))invalid();
}
export function validateProjectBlueRule(row:ProjectBlueRule):void {
  const rule=row.data,paint=rule.mode==='paint';
  const suffix=rule.mode==='panel'?'CraftControlPanel':rule.mode==='miniature'?'CraftMiniatureItem':'PaintControl';
  if(!rule.anchored||rule.mirrored||rule.recipeClass!=='gcewing.projectblue.ControlPanelRecipes$'+suffix||canonical(rule.inputs)!==canonical(paint?[0,1]:[0,4])
    ||canonical(rule.requiredEmpty)!==canonical(paint?[]:[1,3])||canonical(rule.ignored)!==canonical(paint?[2,3,4,5,6,7,8]:[2,5,6,7,8])
    ||rule.outputAmount!==(rule.mode==='miniature'?8:1)||rule.materialPolicy!==(rule.mode==='panel'?'defaultWood':rule.mode==='miniature'?'coverRequiresMaterial':'numericSprayColor'))invalid();
}
export function projectBlueExampleItems(row:ProjectBlueExample):string[]{return [...row.data.cells.flatMap(cell=>cell?[cell.item]:[]),row.data.output.item];}
export function validateProjectBlueContext(roles:ProjectBlueItem[],materials:ProjectBlueMaterial[]):void {
  const registries=new Set<string>(),keys=new Set<string>();
  for(const row of roles){const value=row.data;if(value.kind!=='projectBlueItem'||registries.has(value.registry)||!value.roles.length||new Set(value.roles).size!==value.roles.length)invalid();registries.add(value.registry);
    const saw=value.roles.includes('saw'),spray=value.roles.includes('spray');
    if((value.maxDamage!=null)!==(saw||spray)||(value.damageable!=null)!==saw||spray&&value.maxDamage!==256)invalid();
  }
  for(const row of materials){const value=row.data,identity=value.kind+':'+value.key;if(keys.has(identity)||value.key.length>65536)invalid();keys.add(identity);
    if(value.kind==='projectBlueCachedMaterial'){if((value.name!=null)!==(value.block!=null)||(value.name!=null)!==(value.metadata!=null))invalid();}
    else if(value.kind==='projectBlueRegisteredMaterial'){
      if((value.owner!=null)!==(value.sourceBlock!=null)||value.itemBlock&&(value.block!==value.sourceBlock||value.metadata!==Math.max(0,value.sourceMetadata))||!value.itemBlock&&(value.block!=='minecraft:planks'||value.metadata!==0))invalid();
    }else if(value.kind!=='projectBlueMaterialAlias'||value.target.length>65536)invalid();
  }
}
function nativeColor(tag:Item['nbt']):number {
  const value=tag?.type==='compound'?tag.value.color:null;if(!value)return 0;
  if(['byte','short','int'].includes(value.type))return Number(value.value);
  if(value.type==='long')return Number(BigInt.asIntN(32,BigInt(value.value)));
  if(value.type==='float'||value.type==='double'){
    const bits=new DataView(new ArrayBuffer(8));let number:number;
    if(value.type==='float'){bits.setUint32(0,Number.parseInt(value.value,16));number=bits.getFloat32(0);}else{bits.setBigUint64(0,BigInt('0x'+value.value));number=bits.getFloat64(0);}
    const integer=Number.isNaN(number)?0:Math.max(-2147483648,Math.min(2147483647,Math.trunc(number)));
    return number<integer?(integer-1)|0:integer;
  }return 0;
}
export function validateProjectBlueExample(def:ProjectBlueDefinition['data'],rule:ProjectBlueRule,row:ProjectBlueExample,roles:ProjectBlueItem[],materials:ProjectBlueMaterial[],items:Map<string,Item>):void {
  const sample=row.data;
  if(sample.rule!==rule.data.index||sample.cells.length!==9)invalid();
  for(const stack of [...sample.cells.filter(stack=>stack!==null),sample.output])if(!items.has(stack.item)||!/^(-?[1-9][0-9]*|0)$/.test(stack.amount)||!Number.isSafeInteger(Number(stack.amount))||Number(stack.amount)<-2147483648||Number(stack.amount)>2147483647)invalid();
  const cell=(index:number)=>sample.cells[index]?items.get(sample.cells[index]!.item):undefined;
  const first=cell(0),input=cell(rule.data.mode==='paint'?1:4);if(!first||!input)invalid();
  const has=(item:Item,role:ProjectBlueItem['data']['roles'][number])=>roles.some(row=>row.data.registry===item.registry&&row.data.roles.includes(role));
  let registry:string|undefined,meta=0,amount=rule.data.outputAmount,nbt:Item['nbt']=null;
  const mode=rule.data.mode,tag=input.nbt?.type==='compound'?input.nbt.value.mat:undefined;
  let usesMaterial=false;
  if(mode==='paint'){
    if((!has(first,'lever')&&!has(first,'button'))||!has(input,'spray'))invalid();registry=first.registry;meta=nativeColor(input.nbt);
  }else{
    if(!has(first,'saw')||sample.cells[1]!==null||sample.cells[3]!==null)invalid();
    if(mode==='panel'){
      if(input.registry!==def.core.itemMicroPart||input.meta!==257)invalid();registry=def.core.controlPanelItem;usesMaterial=true;
    }else if(has(input,'fullLever')){registry=def.core.miniatureLever;meta=16;}
    else if(has(input,'stoneButton')){registry=def.core.miniatureButton;meta=16;}
    else if(has(input,'woodButton')){registry=def.core.miniatureButton;meta=17;}
    else if(input.registry===def.core.itemPartFixture){registry=def.core.miniatureLamp;meta=input.meta;}
    else if(input.registry===def.core.itemMicroPart&&input.meta===1&&tag){registry=def.core.miniatureCover;usesMaterial=true;}
    else invalid();
  }
  if(usesMaterial){
    const key=sample.materialKey;if(key===null||key===undefined||!tag&&key!=='tile.wood'||tag?.type==='string'&&tag.value!==key)invalid();
    let name=key;
    const cached=materials.find(row=>row.data.kind==='projectBlueCachedMaterial'&&row.data.key===key);
    if(cached?.data.kind==='projectBlueCachedMaterial'&&cached.data.name!=null){name=cached.data.name;meta=cached.data.metadata!;}
    else {
      const alias=materials.find(row=>row.data.kind==='projectBlueMaterialAlias'&&row.data.key===key);
      const target=alias?.data.kind==='projectBlueMaterialAlias'?alias.data.target:key;
      const registered=materials.find(row=>row.data.kind==='projectBlueRegisteredMaterial'&&row.data.key===target);
      meta=registered?.data.kind==='projectBlueRegisteredMaterial'?registered.data.metadata:0;
    }
    nbt={type:'compound',value:{mat:{type:'string',value:name}}};
  }else if(sample.materialKey!==null&&sample.materialKey!==undefined)invalid();
  const output=items.get(sample.output.item);if(!output||!registry||output.registry!==registry||output.meta!==Math.max(0,meta)||Number(sample.output.amount)!==amount||canonical(output.nbt)!==canonical(nbt))invalid();
}
export class ProjectBlueQuery {
  private pending?:Promise<{definition:ProjectBlueDefinition|null;rules:ProjectBlueRule[];roles:ProjectBlueItem[];materials:ProjectBlueMaterial[];examples:ProjectBlueExample[]}>;
  private readonly query:Query;
  private readonly catalog:Catalog;
  constructor(catalog:Catalog){this.catalog=catalog;this.query=new Query(catalog);}
  private async load(){
    const rows:GeneticReferenceRow[]=[];let bytes=0;
    for await(const row of this.catalog.scan('references'))if(row.data.kind.startsWith('projectBlue')){
      bytes+=JSON.stringify(row).length*2;if(bytes>64*1024*1024||rows.length>=1000000)throw new Fault('reference_limit','ProjectBlue index exceeds byte/row budget');rows.push(row);
    }
    rows.sort((a,b)=>a.order-b.order);let definition:ProjectBlueDefinition|null=null;
    const rules:ProjectBlueRule[]=[],roles:ProjectBlueItem[]=[],materials:ProjectBlueMaterial[]=[],examples:ProjectBlueExample[]=[];
    for(const row of rows){const data=row.data;
      if(data.kind==='projectBlueDefinition'){if(definition)invalid();definition={...row,data};validateProjectBlueDefinition(definition);}
      else if(data.kind==='projectBlueRule'){const rule={...row,data};validateProjectBlueRule(rule);if(data.index!==rules.length)invalid();rules.push(rule);}
      else if(data.kind==='projectBlueExample')examples.push({...row,data});
      else if(data.kind==='projectBlueItem')roles.push({...row,data});
      else if(data.kind==='projectBlueCachedMaterial'||data.kind==='projectBlueRegisteredMaterial'||data.kind==='projectBlueMaterialAlias')materials.push({...row,data} as ProjectBlueMaterial);
      else invalid();
    }
    if(definition){
      if(rows.some((row,index)=>row.domain!==definition!.domain||row.order!==index)||definition.domain!=='reference_'+await hash(canonical({kind:'projectBlueRules',records:rows.map(row=>row.data)})))invalid();
      const counts=definition.data.counts;if(counts.rules!==rules.length||counts.roles!==roles.length||counts.materials!==materials.length||counts.examples!==examples.length)invalid();
      for(const example of examples)if(!rules[example.data.rule])invalid();
      validateProjectBlueContext(roles,materials);
    }else if(rows.length)invalid();
    return {definition,rules,roles,materials,examples};
  }
  async page(search:ProjectBlueSearch):Promise<ProjectBluePage>{
    if(!['all','panel','miniature','paint'].includes(search.mode)||!Number.isSafeInteger(search.offset)||search.offset<0||!Number.isSafeInteger(search.limit)||search.limit<1||search.limit>12)throw new Fault('invalid_query','Invalid ProjectBlue paging or mode',400);
    this.pending??=this.load().catch(error=>{this.pending=undefined;throw error;});const index=await this.pending;
    const matches=index.examples.filter(row=>search.mode==='all'||index.rules[row.data.rule]?.data.mode===search.mode),examples=matches.slice(search.offset,search.offset+search.limit);
    const needed=new Set(examples.flatMap(projectBlueExampleItems)),categories=[];
    if(index.definition)for await(const row of this.catalog.scan('categories'))if(row.reference===index.definition.domain)categories.push(row.id);
    const related=await this.query.related([],categories,{targets:[...needed].map(id=>({kind:'item' as const,id}))});
    const originalKeys=new Set(examples.flatMap(row=>row.data.materialKey===null||row.data.materialKey===undefined?[]:[row.data.materialKey]));
    const keys=new Set(originalKeys);
    for(const alias of index.materials)if(alias.data.kind==='projectBlueMaterialAlias'&&originalKeys.has(alias.data.key))keys.add(alias.data.target);
    // Keep only one alias hop: key set expansion must never become recursive.
    const materials=index.materials.filter(row=>row.data.kind==='projectBlueMaterialAlias'?originalKeys.has(row.data.key):keys.has(row.data.key));
    const page={definition:index.definition,rules:index.rules,roles:index.roles,materials,examples,total:matches.length,offset:search.offset,limit:search.limit,related};
    if(index.definition){if(related.categories.length!==1||canonical(related.categories[0]!.source)!==canonical(index.definition.data.source))invalid();const items=new Map(related.items.map(row=>[row.id,row]));for(const row of examples)validateProjectBlueExample(index.definition.data,index.rules[row.data.rule]!,row,index.roles,materials,items);}
    if(JSON.stringify(page).length*2>16*1024*1024)throw new Fault('reference_limit','ProjectBlue response exceeds byte budget');return page;
  }
}
