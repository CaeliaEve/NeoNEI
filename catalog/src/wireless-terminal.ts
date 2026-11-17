import {canonical,type Item,type Nbt,type Recipe} from '@elysium/contracts';
import {nativeNbtInt} from './native-nbt.ts';
type Process=Extract<NonNullable<Recipe['process']>,{kind:'wirelessTerminalUpgrade'}>;
type Offered=Pick<Item,'registry'|'meta'|'nbt'>;
const invalid=():never=>{throw new Error('Invalid native wireless terminal upgrade');};
function tags(item:Offered):Record<string,Nbt>{
  if(item.nbt==null)return {};
  return item.nbt.type==='compound'?item.nbt.value:invalid();
}
/** This native subclass ignores all physical cells after cell 1. */
export function wirelessTerminalMatches(p:Process,grid:readonly (Offered|null)[]):boolean{
  if(grid.length!==9)invalid();
  const terminal=grid[0],booster=grid[1];
  return terminal!=null&&booster!=null&&p.terminals.includes(terminal.registry)&&p.boosters.includes(booster.registry)
    &&(nativeNbtInt(tags(terminal)[p.flag])<<24>>24)===0;
}
/** Retains the offered count as well as item identity, metadata and unrelated NBT. */
export function wirelessTerminalResult<T extends Offered>(p:Process,item:T):T{
  const result=structuredClone(item),root=structuredClone(tags(item));
  root[p.flag]={type:'byte',value:'1'};result.nbt={type:'compound',value:root};return result;
}
export function validateWirelessTerminalRecipe(r:Recipe,items?:ReadonlyMap<string,Item>):void{
  const p=r.process;if(p?.kind!=='wirelessTerminalUpgrade')return;
  if(p.version!=='1.4.120-gtnh'||p.wirelessVersion!=='1.12.7'||p.nativeRecipe!=='com.glodblock.github.loader.recipe.WirelessTerminalRecipe'
    ||p.flag!=='infinityBoosterCard'||r.source.owner!=='NEI'||r.source.handler!=='codechicken.nei.recipe.ShapelessRecipeHandler'
    ||r.duration!=null||r.energy!=null||r.magic!=null||Object.keys(r.properties).length!==0
    ||r.inputs.length!==2||r.outputs.length!==1||r.grid?.width!==3||r.grid.height!==3||r.grid.mirror
    ||canonical(r.grid.cells)!==canonical([0,1,null,null,null,null,null,null,null]))invalid();
  for(const names of [p.terminals,p.boosters])if(!names.length||names.length>65536
    ||names.some((name,i)=>!name||name.length>512||!name.includes(':')||i>0&&names[i-1]!>=name))invalid();
  if(p.terminals.some(name=>p.boosters.includes(name)))invalid();
  for(const [slot,input]of r.inputs.entries()){
    if(input.kind!=='item'||input.slot!==slot||input.choices.length===0)invalid();
    for(const c of input.choices){
      if(c.amount!=='1'||c.rule.kind!=='wildcard'||!c.rule.meta||!c.rule.nbt
        ||!['consume','keep','damage','gtTool','nativeContainer'].includes(c.consume.kind))invalid();
      if(items){
        const item=items.get(c.id)??invalid();
        if(!(slot===0?p.terminals:p.boosters).includes(item.registry)||slot===0&&(nativeNbtInt(tags(item)[p.flag])<<24>>24)!==0)invalid();
      }
    }
  }
  const out=r.outputs[0]??invalid(),change=out.change??invalid();
  if(out.kind!=='item'||out.role!=='result'||out.slot!==0||out.amount!=='1'||out.quantity!=null||out.chance.numerator!=='1'||out.chance.denominator!=='1'
    ||change.input!==0||change.bindings!=null||change.samples.length!==r.inputs[0]!.choices.length||change.samples.some(s=>s.amount!=='1')
    ||out.id!==change.samples[0]?.id||change.action.kind!=='patch'||Object.keys(change.action.limits).length!==0
    ||canonical(change.action.set)!==canonical({[p.flag]:{type:'byte',value:'1'}}))invalid();
  if(!(r.notes??[]).some(n=>n.key==='ae2fc:wirelessUpgrade'&&n.source===p.nativeRecipe+'#matches/getCraftingResult'))invalid();
  if(items)for(const [at,c]of r.inputs[0]!.choices.entries()){
    const input=items.get(c.id)??invalid(),result=items.get(change.samples[at]!.id)??invalid();
    const expected=wirelessTerminalResult(p,input);
    if(result.registry!==expected.registry||result.meta!==expected.meta||canonical(result.nbt)!==canonical(expected.nbt))invalid();
  }
}
export function wirelessTerminalNote(_p:Process,locale:'zh-CN'|'en-US'='zh-CN'):string{
  return locale==='en-US'
    ? 'Only physical cells 0 and 1 are matched: an uninstalled native wireless terminal followed by an infinity booster. Other cells are ignored by matching but still consume one item and apply native container rules when occupied. Metadata and counts do not restrict matching. The output copies the actual terminal, complete NBT and stack count, and sets the booster flag. The displayed one-item result is a specimen.'
    : '仅匹配实际第 0、1 格：未装增幅卡的原生无线终端、无限增幅卡。其余格在匹配时忽略，但占用时仍消耗一件并执行原生容器规则。不以元数据和数量限制匹配；产物复制实际终端、完整 NBT 和堆叠数，再写入增幅标志。展示的一件产物仅是样本。';
}
