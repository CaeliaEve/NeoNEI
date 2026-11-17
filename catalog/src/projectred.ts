import type {Item,Recipe} from '@elysium/contracts';
import {nativeNbtEqual} from './native-nbt.ts';
type Process=Extract<NonNullable<Recipe['process']>,{kind:'projectRedCrafting'}>;
type Predicate=NonNullable<Process['predicates'][number]>;
type Offered=Pick<Item,'registry'|'meta'|'nbt'|'tags'>|null;
const invalid=():never=>{throw new Error('Invalid native ProjectRed workbench predicate');};
const handlers=['mrtjp.projectred.core.libmc.recipe.PRShapedRecipeHandler','mrtjp.projectred.core.libmc.recipe.PRShapelessRecipeHandler'];

function predicates(p:Process):void{
  if(p.version!=='4.12.6-GTNH'||p.minimumSlots>9||p.predicates.length>9||p.ignoredOutputs>=65536
    ||(p.shaped?p.predicates.length!==9:p.predicates.length!==p.minimumSlots||p.predicates.some(s=>s==null)))invalid();
  for(const s of p.predicates)if(s){
    if(s.kind==='ore'){if(s.registry!=null||s.metadata!=null||s.nbt!=null||s.checkNbt||s.ores.length>4096||s.ores.some(s=>!s||s.length>512)||new Set(s.ores).size!==s.ores.length)invalid();}
    else if(!s.registry||s.registry.length>512||s.metadata==null||s.ores.length||s.kind==='micro'&&!s.checkNbt)invalid();
  }
}
function accepts(s:Predicate,item:Offered):boolean{
  if(!item)return false;
  if(s.kind==='ore')return s.ores.some(name=>item.tags.includes(name));
  return s.registry===item.registry&&(s.metadata===item.meta||s.kind==='item'&&(s.metadata===32767||item.meta===32767))
    &&(!s.checkNbt||nativeNbtEqual(s.nbt,item.nbt));
}
/** Native physical order: shaped cells are absolute; shapeless consumes first remaining. */
export function projectRedSelect(p:Process,offered:readonly Offered[]):(number|null)[]|null{
  predicates(p);if(offered.length!==9)invalid();
  if(p.shaped){for(let cell=0;cell<9;cell++){const predicate=p.predicates[cell];if(predicate?!accepts(predicate,offered[cell]!):offered[cell]!=null)return null;}return p.predicates.map((s,i)=>s?i:null);}
  const remaining=p.predicates.map((_,i)=>i),selected=Array<number|null>(9).fill(null);
  for(let cell=0;cell<9;cell++)if(offered[cell]){const at=remaining.findIndex(i=>accepts(p.predicates[i]!,offered[cell]!));if(at<0)return null;selected[cell]=remaining.splice(at,1)[0]!;}
  return remaining.length?null:selected;
}
export function validateProjectRedRecipe(r:Recipe,items?:ReadonlyMap<string,Item>):void{
  const p=r.process;if(p?.kind!=='projectRedCrafting'){if(handlers.includes(r.source.handler))invalid();return;}
  predicates(p);
  if(r.source.handler!==handlers[p.shaped?0:1]||r.duration!=null||r.energy!=null||r.magic!=null||Object.keys(r.properties).length||r.outputs.length!==1)invalid();
  let slot=0;const cells=p.predicates.map(s=>s?slot++:null);
  if(slot!==r.inputs.length||(p.shaped? r.grid?.width!==3||r.grid?.height!==3||r.grid?.mirror||JSON.stringify(r.grid?.cells)!==JSON.stringify(cells):r.grid!=null))invalid();
  const groups=p.predicates.filter((s):s is Predicate=>s!=null);
  for(const [slot,input]of r.inputs.entries()){
    const s=groups[slot]!;if(input.kind!=='item'||input.slot!==slot||!input.choices.length)invalid();
    for(const c of input.choices){if(c.amount!=='1'||!['consume','keep','damage','gtTool','nativeContainer'].includes(c.consume.kind))invalid();
      if(s.kind==='ore'){if(c.rule.kind!=='ore'||c.rule.exclusive||!s.ores.includes(c.rule.name))invalid();}
      else if(c.rule.kind!=='wildcard'||c.rule.meta!==(s.kind==='item'&&s.metadata===32767)||c.rule.nbt!==!s.checkNbt)invalid();
      if(items&&!accepts(s,items.get(c.id)??invalid()))invalid();
    }
  }
  const out=r.outputs[0]!;if(out.kind!=='item'||out.role!=='result'||out.slot!==0||out.amount==null||out.change!=null||out.quantity!=null||out.chance.numerator!=='1'||out.chance.denominator!=='1')invalid();
}
export function projectRedNote(p:Process,locale:'zh-CN'|'en-US'='zh-CN'):string{
  return locale==='en-US'
    ?`${p.shaped?'Absolute workbench cells: no translation or mirror.':'Reads physical cells in order and removes the first matching remaining predicate.'} Item keys optionally compare NBT and allow metadata 32767 on either side. Microblock keys compare literal metadata and NBT. Ore predicates use current ore membership. Counts do not take part in matching; one item is consumed per occupied cell, with native container/tool behavior. Only the first output definition is returned (${p.ignoredOutputs} additional definitions ignored). Earlier workbench registrations may have priority.`
    :`${p.shaped?'固定检查工作台绝对格子，不平移、不镜像。':'按实际格子顺序，移除首个匹配的剩余谓词。'}物品键可检查 NBT，并允许任一侧元数据为 32767；微方块键比较具体元数据与 NBT；矿辞谓词使用当前矿辞成员。匹配忽略数量，每个占用格消耗一件，另计原生容器／工具行为。只返回首个输出定义（其余 ${p.ignoredOutputs} 个定义忽略）；工作台中更早的注册可能优先。`;
}
