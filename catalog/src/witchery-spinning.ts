import type {Item,Recipe} from '@elysium/contracts';
type Process=Extract<NonNullable<Recipe['process']>,{kind:'witcherySpinning'}>;
type Selector=Process['definitions'][number]['fibre'];
type Offered=Pick<Item,'registry'|'meta'>|null;
const invalid=():never=>{throw new Error('Invalid native Witchery spinning rules');};
const same=(s:Selector,o:Offered)=>o!=null&&s.registry===o.registry&&s.metadata===o.meta;

/** First registered fibre threshold and requirement-first modifier multiset match. Extra slots remain. */
export function witcherySpinningSelect(p:Process,fibre:Offered,count:number,modifiers:readonly Offered[]):number|null{
  if(modifiers.length!==3||!Number.isInteger(count)||count<0||count>2147483647)invalid();
  for(const [index,d]of p.definitions.entries()){
    if(!same(d.fibre,fibre)||count<d.count)continue;
    const remaining=modifiers.filter((s):s is NonNullable<Offered>=>s!=null);let matches=true;
    for(const need of d.modifiers){const at=remaining.findIndex(s=>same(need,s));if(at<0){matches=false;break;}remaining.splice(at,1);}
    if(matches)return index;
  }return null;
}
export function validateWitcherySpinningRecipe(r:Recipe,items?:ReadonlyMap<string,Item>):void{
  const p=r.process;if(p?.kind!=='witcherySpinning'){if(r.source.handler==='alkalus.main.nei.NEI_Handler_SpinningWheel')invalid();return;}
  if(p.version!=='0.24.1'||p.workTicks!==300||p.altarPowerBits!=='3f19999a'||p.definitions.length>4096||!Number.isInteger(p.selected)
    ||r.source.handler!=='alkalus.main.nei.NEI_Handler_SpinningWheel'||r.grid!=null||r.magic!=null||r.duration!=='300'||r.energy!=null||Object.keys(r.properties).length)invalid();
  const d=p.definitions[p.selected]??invalid();
  for(const row of p.definitions){if(!Number.isInteger(row.count)||row.count<=0||row.count>2147483647||row.modifiers.length>3)invalid();
    for(const s of [row.fibre,...row.modifiers])if(!s.registry||s.registry.length>512||!Number.isInteger(s.metadata)||s.metadata<0||s.metadata>2147483647)invalid();}
  const modifiers:Offered[]=d.modifiers.map(s=>({registry:s.registry,meta:s.metadata}));while(modifiers.length<3)modifiers.push(null);
  if(witcherySpinningSelect(p,{registry:d.fibre.registry,meta:d.fibre.metadata},d.count,modifiers)!==p.selected)invalid();
  if(r.inputs.length!==1+d.modifiers.length)invalid();
  for(const [slot,input]of r.inputs.entries()){
    const s=slot===0?d.fibre:d.modifiers[slot-1]!;if(input.kind!=='item'||input.slot!==slot||!input.choices.length)invalid();
    for(const c of input.choices){if(c.amount!==String(slot===0?d.count:1)||c.consume.kind!=='consume'||c.returns.length
      ||(s.metadata===32767?c.rule.kind!=='metadata'||c.rule.value!==32767||!c.rule.nbt||c.rule.absent.length:c.rule.kind!=='wildcard'||c.rule.meta||!c.rule.nbt))invalid();
      if(items){const item=items.get(c.id)??invalid();if(item.registry!==s.registry||s.metadata!==32767&&item.meta!==s.metadata)invalid();}}
  }
  const o=r.outputs[0];if(r.outputs.length!==1||o?.kind!=='item'||o.slot!==0||o.role!=='result'||o.amount==null||o.change!=null||o.quantity!=null||o.chance.numerator!=='1'||o.chance.denominator!=='1')invalid();
}
export function witcherySpinningNote(p:Process,locale:'zh-CN'|'en-US'='zh-CN'):string{
  return locale==='en-US'
    ?`Native registration ${p.selected+1}: fibre must meet the registered count; item and metadata compare literally, including 32767, while NBT is ignored. Of the three modifier slots, each registered requirement removes the first physical matching modifier from a temporary list. Extra modifier slots are allowed and retained. The first matching registration wins. Successful completion debits the registered fibre count and one item from each matched modifier slot, with no containers. Requires a reachable altar and 300 successful work ticks at native float 0.6 power per tick. The shown output is the empty-output-slot specimen; merging into an existing equal item retains its NBT and requires native capacity. This is not a fixed elapsed time or unconditional batch yield.`
    :`原生注册第 ${p.selected+1} 项：纤维库存达到注册数量，物品与元数据按字面匹配（32767 也不是通配），忽略 NBT。三个修饰物槽中，每条注册需求从临时列表移除首个按实际槽序匹配的材料；允许额外修饰物且保留。首条匹配注册优先。成功完成扣除注册纤维数量及每个匹配修饰槽各一件，不返还容器。需要可达祭坛及 300 次有效工作 tick，每次请求原生 float 0.6 祭坛能量。展示的是空产物槽样本；合并已有同物品库存会保留原 NBT，并受原生容量检查约束，不代表固定墙钟耗时或保证批次产出。`;
}
