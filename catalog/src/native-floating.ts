import type {Item,Recipe} from '@elysium/contracts';

type Process=Extract<NonNullable<Recipe['process']>,{kind:'nativeFloatingFlowers'}>;
function invalid():never {throw new Error('Invalid native floating-flower coercion or result binding');}

export function validateNativeFloatingRecipe(r:Recipe,items?:ReadonlyMap<string,Item>):void{
  const p=r.process;if(p?.kind!=='nativeFloatingFlowers')return;
  const n=r.inputs.length,start=n-p.special.length;
  if(p.version!=='1.12.28-GTNH'||r.source.owner!=='Botania'||r.source.handler!=='vazkii.botania.client.integration.nei.recipe.RecipeHandlerFloatingFlowers'
    ||n<2||n>9||start<=0||p.special.length===0||p.special.some((v,i)=>v!==start+i)
    ||r.grid!=null||r.magic!=null||r.duration!=null||r.energy!=null||Object.keys(r.properties).length||r.outputs.length!==1)invalid();
  const last=r.inputs[n-1]??invalid();
  if(p.coercions.length===0||p.coercions.length>4096||p.coercions.length!==last.choices.length)invalid();
  const roles:string[]=[];
  for(const [slot,input]of r.inputs.entries()){
    if(input.kind!=='item'||input.slot!==slot||!input.choices.length||slot!==n-1&&input.choices.length!==1)invalid();
    let registry:string|undefined;
    for(const c of input.choices){
      if(c.amount!=='1'||c.consume.kind!=='consume'||c.returns.length||c.rule.kind!=='wildcard'||!c.rule.meta||!c.rule.nbt)invalid();
      if(items){const i=items.get(c.id)??invalid();if(registry!=null&&registry!==i.registry)invalid();registry=i.registry;}
    }
    if(items)roles.push(registry??invalid());
  }
  const out=r.outputs[0]??invalid(),change=out.change??invalid(),action=change.action;
  if(out.kind!=='item'||out.slot!==0||out.role!=='result'||out.amount!=='1'||out.quantity!=null||out.chance.numerator!=='1'||out.chance.denominator!=='1'
    ||action.kind!=='nativeFloatingFlower'||change.input!==n-1||change.bindings!=null||change.samples.length!==last.choices.length
    ||out.id!==change.samples[0]?.id)invalid();
  const seen=new Set<string>();let bytes=0;
  for(const [i,c]of p.coercions.entries()){
    bytes+=new TextEncoder().encode(c.value).byteLength;
    if(c.input!==last.choices[i]?.id||seen.has(c.input)||c.value.length>16384||bytes>1024*1024||change.samples[i]?.amount!=='1')invalid();seen.add(c.input);
    if(items){
      const input=items.get(c.input)??invalid();if(input.nbt!=null&&input.nbt.type!=='compound')invalid();
      const tag=input.nbt?.type==='compound'?input.nbt.value.type:undefined;
      if(tag==null?c.value!=='':tag.type==='string'&&tag.value!==c.value)invalid();
      if(action.kind!=='nativeFloatingFlower')invalid();const base=items.get(action.base)??invalid(),sample=items.get(change.samples[i]!.id)??invalid();
      if(base.meta!==0||roles.includes(base.registry)||roles[0]===roles[start]||roles.some((v,j)=>v!==roles[j<start?0:start])
        ||sample.registry!==base.registry||sample.meta!==0||sample.nbt?.type!=='compound'||Object.keys(sample.nbt.value).length!==1
        ||sample.nbt.value.type?.type!=='string'||sample.nbt.value.type.value!==c.value)invalid();
    }
  }
}

export function nativeFloatingNote(p:Process,locale:'zh-CN'|'en-US'='zh-CN'):string{
  return locale==='en-US'
    ?`This branch contains ${p.special.length} special flowers. Every occupied cell is a floating or special flower, with both types present; count, metadata and NBT do not restrict matching. The physically last special flower supplies type through native NBT getString coercion. The output is one fresh floating special flower with only that string tag. String and absent values are checked independently; other listed tags retain source-bound native observations, since canonical JSON cannot recover compound storage order. Other cells are empty; earlier workbench registrations may have priority. Each occupied cell consumes one item without containers.`
    :`本分支含 ${p.special.length} 朵特殊花。每个占用格只能是浮空花或特殊花，两类都必须存在；数量、元数据和 NBT 不限制匹配。按实际格子顺序读取的最后一朵特殊花经原生 NBT getString 转换提供 type。产物是一朵仅含该字符串标签的新浮空特殊花。字符串与缺失值独立校验，其他已列出标签保留来源绑定的原生观测；规范 JSON 无法重建复合标签存储顺序。其余格为空，更早工作台注册可能优先；每个占用格消耗一件，不返还容器。`;
}
