import {canonical,type Category,type Item,type Recipe} from '@elysium/contracts';
import {Catalog,Fault} from './store.ts';
import {reconstructNativeBeePool} from './botania-program.ts';
import {NativeBeePoolSession} from './botania-session.ts';
import type {BeePoolStack} from './botania-bee.ts';
import type {PoolSelection} from './botania-selection.ts';
import {nativeNbtHash} from './native-nbt.ts';

type Context=Awaited<ReturnType<typeof reconstructNativeBeePool>>;
const handler='vazkii.botania.client.integration.nei.recipe.RecipeHandlerManaPool';
const classes={bee:'magicbees.main.utils.compat.botania.SpeciesRecipeManaInfusion',
  item:'vazkii.botania.api.recipe.RecipeManaInfusion',mini:'vazkii.botania.api.recipe.RecipeMiniFlower'};
function ensure(value:unknown):asserts value{if(!value)throw new Fault('invalid_pool','Invalid native pool contract');}
const int=(v:unknown,min=-2147483648,max=2147483647):v is number=>typeof v==='number'&&Number.isInteger(v)&&v>=min&&v<=max;
const same=(stack:BeePoolStack,item:Item):boolean=>stack.registry===item.registry&&stack.meta===item.meta
  &&canonical(stack.nbt)===canonical(item.nbt??null);
function nanos(value:unknown):string{
  ensure(typeof value==='string'&&/^(-?[1-9][0-9]*|0)$/.test(value)&&value.length<=20);
  ensure(BigInt.asIntN(64,BigInt(value))===BigInt(value));return value;
}
export function validateNativePoolRecipe(recipe:Recipe,items?:ReadonlyMap<string,Item>):void{
  const p=recipe.process;
  if(p?.kind!=='nativeBotaniaPool'){
    ensure(!recipe.inputs.some(i=>i.choices.some(c=>c.rule.kind==='nativePoolInput'))
      &&!recipe.outputs.some(o=>o.change?.action.kind==='nativePoolResult'));return;
  }
  ensure(recipe.source.owner==='Botania'&&recipe.source.handler===handler&&p.version==='1.12.28-GTNH'
    &&/^program_[0-9a-f]{64}$/.test(p.program)&&int(p.index,0,4095)&&int(p.mana)
    &&Object.values(classes).includes(p.nativeRecipe)&&['none','alchemy','conjuration'].includes(p.catalyst)
    &&p.scope==='serialOwnedSnapshot'&&p.display==='constructorPrototype'
    &&p.matching==='callbacksBeforeCatalystFirstEligible'&&p.settlement==='serverDroppedItemUnitAndSignedManaUpdate');
  ensure(recipe.grid==null&&recipe.duration==null&&recipe.energy==null&&recipe.magic==null
    &&Object.keys(recipe.properties).length===0&&recipe.inputs.length===1&&recipe.outputs.length===1);
  const input=recipe.inputs[0]!,output=recipe.outputs[0]!,change=output.change;
  ensure(input.kind==='item'&&input.slot===0&&input.choices.length>0&&input.choices.every(c=>c.amount==='1'
    &&c.consume.kind==='consume'&&c.returns.length===0&&c.rule.kind==='nativePoolInput'));
  ensure(output.kind==='item'&&output.slot===0&&output.role==='result'&&output.quantity==null
    &&output.chance.numerator==='1'&&output.chance.denominator==='1'&&typeof output.amount==='string'
    &&/^[1-9][0-9]*$/.test(output.amount)&&output.amount.length<=10&&BigInt(output.amount)<=2147483647n
    &&change?.input===0&&change.action.kind==='nativePoolResult'&&change.samples.length===0&&change.bindings==null);
  if(items)ensure(items.has(output.id)&&input.choices.every(c=>items.has(c.id)));
}
function bind(recipe:Recipe,category:Pick<Category,'id'|'program'>,context:Context,items:ReadonlyMap<string,Item>):void{
  validateNativePoolRecipe(recipe,items);const p=recipe.process;
  ensure(p?.kind==='nativeBotaniaPool'&&category.id===recipe.category&&category.program===p.program);
  const entry=context.entries[p.index];ensure(entry&&p.nativeRecipe===classes[entry.kind]
    &&p.mana===entry.mana&&(!entry.alchemy||p.catalyst==='alchemy')&&(!entry.conjuration||p.catalyst==='conjuration'));
  const prototype=entry.kind==='bee'?entry.prototype:entry.output;
  const output=recipe.outputs[0]!,item=items.get(output.id);ensure(item&&same(prototype,item)&&output.amount===prototype.amount);
  const inputs=recipe.inputs[0]!.choices.map(c=>items.get(c.id)!);
  for(const input of inputs){
    if(entry.kind==='bee')ensure(same(entry.displayInput,input));
    else if(entry.kind==='item')ensure(input.nbt==null&&entry.predicates.some(v=>v.registry===input.registry
      &&(v.metadata===32767||v.metadata===input.meta)));
    else{
      const tag=input.nbt?.type==='compound'?input.nbt.value.type:undefined;
      ensure(tag==null?entry.key==='':tag.type==='string'?tag.value===entry.key:
        (entry.coercions??[]).some(v=>same(v.input,input)&&v.value===entry.key));
    }
  }
  if(entry.kind==='item')ensure(entry.predicates.length>0&&entry.predicates.every(v=>inputs.some(i=>v.registry===i.registry&&(v.metadata===32767||v.metadata===i.meta))));
  else ensure(inputs.length===1);
}
export interface NativePoolOptions {item:string;mana?:number;amount?:string;now?:string}
export interface NativePoolPreview {
  scope:'serialOwnedSnapshot';program:string;index:number;targetSelected:boolean;
  snapshotNanos:string;nowNanos:string;mana:number;input:BeePoolStack;selection:PoolSelection;
}
/** Immutable programs are shared; every request owns a fresh mutable session. */
export class NativeBeePoolQuery {
  private readonly pending=new Map<string,Promise<{context:Context;now:string}>>();
  private readonly catalog:Pick<Catalog,'record'> & Partial<Pick<Catalog,'program'>>;
  constructor(catalog:Pick<Catalog,'record'> & Partial<Pick<Catalog,'program'>>){this.catalog=catalog;}
  private read(id:string):Promise<{context:Context;now:string}>{
    const prior=this.pending.get(id);if(prior)return prior;
    if(this.pending.size>=2)this.pending.delete(this.pending.keys().next().value!);
    const promise=(async()=>{
      ensure(this.catalog.program);
      const chunks=await this.catalog.program(id),context=await reconstructNativeBeePool(id,chunks);
      const settings=chunks.find(c=>c.data.kind==='beePoolSettings')!;
      ensure(settings.data.kind==='beePoolSettings'&&settings.data.rows.length===1);
      return {context,now:settings.data.rows[0]!.runtime.afterNanos};
    })();
    this.pending.set(id,promise);void promise.catch(()=>{if(this.pending.get(id)===promise)this.pending.delete(id);});
    return promise;
  }
  async validate(recipe:Recipe,category:Pick<Category,'id'|'program'>,items:ReadonlyMap<string,Item>):Promise<void>{
    if(recipe.process?.kind!=='nativeBotaniaPool'){validateNativePoolRecipe(recipe,items);return;}
    bind(recipe,category,(await this.read(recipe.process.program)).context,items);
  }
  async preview(id:string,options:NativePoolOptions):Promise<NativePoolPreview>{
    if(!/^item_[0-9a-f]{64}$/.test(options.item)||options.mana!=null&&!int(options.mana)
      ||options.amount!=null&&(!/^[1-9][0-9]*$/.test(options.amount)||options.amount.length>10||BigInt(options.amount)>2147483647n))
      throw new Fault('invalid_query','Invalid native pool query',400);
    if(options.now!=null){try{nanos(options.now);}catch{throw new Fault('invalid_query','Invalid pool clock query',400);}}
    const recipe=await this.catalog.record('recipes',id);validateNativePoolRecipe(recipe);
    const p=recipe.process;ensure(p?.kind==='nativeBotaniaPool');
    const [category,loaded,item]=await Promise.all([this.catalog.record('categories',recipe.category),
      this.read(p.program),this.catalog.record('items',options.item)]);
    const specimens=new Map<string,Item>();
    for(const key of new Set([...recipe.inputs.flatMap(i=>i.choices.map(c=>c.id)),...recipe.outputs.map(o=>o.id)]))
      specimens.set(key,await this.catalog.record('items',key));
    bind(recipe,category,loaded.context,specimens);
    const input:BeePoolStack={registry:item.registry,meta:item.meta,nbt:structuredClone(item.nbt??null),amount:options.amount??'1'};
    const now=options.now??loaded.now,mana=options.mana??p.mana;
    const session=new NativeBeePoolSession(loaded.context.source,loaded.context.entries,loaded.context.cache);
    const selection=session.select(input,p.catalyst==='alchemy',p.catalyst==='conjuration',mana,()=>now);
    return {scope:'serialOwnedSnapshot',program:p.program,index:p.index,
      targetSelected:selection.result.state==='selected'&&selection.result.index===p.index,
      snapshotNanos:loaded.now,nowNanos:now,mana,input,selection};
  }
}
function object(value:unknown):Record<string,unknown>{
  ensure(value!==null&&typeof value==='object'&&!Array.isArray(value));return value as Record<string,unknown>;
}
function exact(value:Record<string,unknown>,keys:string[]):void{
  ensure(Object.keys(value).length===keys.length&&keys.every(k=>Object.hasOwn(value,k)));
}
function stack(value:unknown):BeePoolStack{
  const row=object(value);exact(row,['registry','meta','amount','nbt']);
  ensure(typeof row.registry==='string'&&row.registry.length>0&&row.registry.length<=512&&int(row.meta)
    &&typeof row.amount==='string'&&/^[1-9][0-9]*$/.test(row.amount)&&row.amount.length<=10&&BigInt(row.amount)<=2147483647n);
  if(row.nbt!==null){const tag=object(row.nbt);ensure(tag.type==='compound');nativeNbtHash(row.nbt as BeePoolStack['nbt']&{});}
  return structuredClone(row) as unknown as BeePoolStack;
}
/** HTTP and offline worker share this strict response boundary. */
export function readNativePoolPreview(value:unknown):NativePoolPreview{
  const row=object(value);exact(row,['scope','program','index','targetSelected','snapshotNanos','nowNanos','mana','input','selection']);
  ensure(row.scope==='serialOwnedSnapshot'&&typeof row.program==='string'&&/^program_[0-9a-f]{64}$/.test(row.program)
    &&int(row.index,0,4095)&&typeof row.targetSelected==='boolean'&&int(row.mana));
  const selection=object(row.selection);exact(selection,['result','offeredAfter','visited']);
  const result=object(selection.result);
  ensure(['notMatched','nativeError','insufficientMana','selected'].includes(result.state as string)&&int(selection.visited,0,4096));
  exact(result,result.state==='notMatched'?['state']:result.state==='selected'?['state','index','output']:['state','index']);
  if(result.state!=='notMatched')ensure(int(result.index,0,4095)&&selection.visited>result.index);
  if(result.state==='selected')stack(result.output);
  if(selection.offeredAfter!==null)stack(selection.offeredAfter);
  ensure(row.targetSelected===(result.state==='selected'&&result.index===row.index));
  return {scope:'serialOwnedSnapshot',program:row.program,index:row.index,targetSelected:row.targetSelected,
    snapshotNanos:nanos(row.snapshotNanos),nowNanos:nanos(row.nowNanos),mana:row.mana,input:stack(row.input),
    selection:structuredClone(selection) as unknown as PoolSelection};
}
export function nativePoolNote(preview:NativePoolPreview|null,locale:'zh-CN'|'en-US'='zh-CN'):string{
  if(!preview)return locale==='en-US'?'Constructor prototype; the ordered snapshot preview is not available.':
    '构造原型；当前尚无原生顺序快照预览。';
  const state=preview.selection.result.state;
  const en=state==='nativeError'?'Native callback failed':state==='insufficientMana'?'Insufficient mana; the first match blocks later recipes':
    state==='notMatched'?'No native match':preview.targetSelected?'This recipe was selected':'An earlier recipe was selected';
  const zh=state==='nativeError'?'原生回调失败':state==='insufficientMana'?'魔力不足，首个匹配仍阻止后续配方':
    state==='notMatched'?'无原生匹配':preview.targetSelected?'选中本条配方':'选中了更早的配方';
  return locale==='en-US'?`${en}. Snapshot preview uses the exported cache and explicit clock; it does not predict a running world. The image is the constructor prototype.`:
    `${zh}。预览使用导出时的缓存与明确时钟，不预测运行中的世界；图像为构造原型。`;
}
