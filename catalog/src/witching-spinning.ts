import type {Item,Recipe} from '@elysium/contracts';

type Process=Extract<NonNullable<Recipe['process']>,{kind:'witchingSpinning'}>;
type Definition=Process['definitions'][number];
type Need=NonNullable<Definition['inputs']>[number];
type Selector=Extract<Need,{kind:'stack'}>['template'];
type Offered=Pick<Item,'registry'|'meta'>|null;
const invalid=():never=>{throw new Error('Invalid native Witching Gadgets spinning rules');};
const templates=(need:Need):readonly Selector[]=>need.kind==='stack'?[need.template]:need.kind==='list'?need.templates:[];
const accepts=(s:Selector,item:Exclude<Offered,null>)=>s.registry===item.registry&&(s.metadata===32767||s.metadata===item.meta);

function matches(definition:Definition,offered:readonly Exclude<Offered,null>[]):boolean{
  if(definition.inputs==null||definition.inputs.length!==offered.length)return false;
  const remaining=[...definition.inputs];let hit=false;
  for(const item of offered){
    let at=0;
    while(at<remaining.length){
      const need=remaining[at]!;
      if(need.kind==='stack'&&accepts(need.template,item)){hit=true;remaining.splice(at,1);break;}
      if(need.kind==='list'&&need.templates.some(s=>accepts(s,item))){hit=true;remaining.splice(at,1);continue;}
      at++;
    }
    if(!hit)return false;
  }
  return remaining.length===0;
}
/** Preserve physical order, the sticky hit flag, multi-list removal and native registry precedence. */
export function witchingSpinningSelect(p:Process,inventory:readonly Offered[]):number|null{
  if(inventory.length!==5)invalid();
  const offered=inventory.filter((i):i is Exclude<Offered,null>=>i!=null);
  for(const [index,definition]of p.definitions.entries())if(matches(definition,offered))return index;
  return null;
}

export function validateWitchingSpinningRecipe(r:Recipe,items?:ReadonlyMap<string,Item>):void{
  const p=r.process;if(p?.kind!=='witchingSpinning'){if(r.source.handler==='witchinggadgets.client.nei.NEISpinningWheelHandler')invalid();return;}
  if(p.version!=='1.7.25-GTNH'||p.definitions.length>4096||!Number.isInteger(p.selected)||p.selected<0
    ||r.source.owner!=='WitchingGadgets'||r.source.handler!=='witchinggadgets.client.nei.NEISpinningWheelHandler'
    ||r.grid!=null||r.magic!=null||r.duration!=null||r.energy!=null||Object.keys(r.properties).length)invalid();
  const selected=p.definitions[p.selected]??invalid(),requirements=selected.inputs??invalid();let count=0;
  for(const d of p.definitions){if(d.inputs==null)continue;if(d.inputs.length>65536)invalid();
    for(const need of d.inputs){if(!['stack','list','never'].includes(need.kind))invalid();const values=templates(need);count+=values.length;if(count>262144)invalid();
      for(const s of values)if(!s.registry||s.registry.length>512||!Number.isInteger(s.metadata)||s.metadata<0||s.metadata>2147483647)invalid();}
  }
  if(requirements.length>5||r.inputs.length!==requirements.length)invalid();
  for(const [slot,input]of r.inputs.entries()){
    const need=requirements[slot]!,values=templates(need);if(!values.length||input.slot!==slot||input.kind!=='item'||!input.choices.length)invalid();
    for(const c of input.choices){
      if(c.amount!=='1'||c.consume.kind!=='consume'||c.returns.length||c.rule.kind!=='wildcard'||!c.rule.nbt)invalid();
      if(items){const item=items.get(c.id)??invalid();if(!values.some(s=>accepts(s,item)&&c.rule.kind==='wildcard'&&c.rule.meta===(s.metadata===32767)))invalid();}
    }
  }
  const o=r.outputs[0];if(r.outputs.length!==1||o?.slot!==0||o.kind!=='item'||o.role!=='result'||o.amount==null
    ||o.quantity!=null||o.change!=null||o.chance.numerator!=='1'||o.chance.denominator!=='1')invalid();
}
export function witchingSpinningNote(p:Process,locale:'zh-CN'|'en-US'='zh-CN'):string{
  return locale==='en-US'
    ?`Registration ${p.selected+1}: five physical slots are packed in order, then the first matching registration wins. Count and NBT are ignored; template 32767 is an ore wildcard. Direct stack matches break, while list matches keep removing requirements; the hit flag stays set for later offers. Completion consumes one item from every occupied input slot, including unmatched offers, without containers. Default work from zero needs 121 consecutive valid calls, but actual progress/maxProgress and output capacity remain machine state. The shown output assumes an empty slot; same item/metadata stock keeps its existing NBT when merged. Candidate combinations may belong to an earlier registration.`
    :`注册 ${p.selected+1}：按五个物理槽顺序压紧非空物品，选择首个匹配注册。忽略数量和 NBT，模板 32767 是矿辞通配。普通需求匹配后退出；列表需求匹配后继续移除其他需求，成功标志不为后续物品重置。完成时所有非空输入槽各减一件，包含未匹配物品，不返还容器。默认从零需 121 次连续有效工作调用；实际进度／maxProgress 和输出容量仍是机器状态。图示以空输出槽为前提，同物品／元数据合并保留已有 NBT。候选组合可能由更早注册优先匹配。`;
}
