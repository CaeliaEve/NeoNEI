import type {Recipe} from '@elysium/contracts';
type Process=Extract<NonNullable<Recipe['process']>,{kind:'bloodCalcinator'}>;
const invalid=():never=>{throw new Error('Invalid native Blood Magic internal reagent process');};
export function validateBloodCalcinatorRecipe(r:Recipe):void{
  const p=r.process;if(p?.kind!=='bloodCalcinator'){if(r.source.handler==='WayofTime.alchemicalWizardry.client.nei.NEICalcinatorHandler')invalid();return;}
  if(p.version!=='1.7.52'||r.source.owner!=='AWWayofTime'||r.source.handler!=='WayofTime.alchemicalWizardry.client.nei.NEICalcinatorHandler'
    ||p.input!==1||p.orb!==0||!p.reagent||p.reagent.length>512||!p.name||p.name.length>16384||p.color.length!==4
    ||p.workTicks!==200||p.lpPerTick!==10||p.bufferCapacity!==2000||p.mainCapacity!==4000||p.transferPerTick!==20
    ||r.inputs.length!==2||r.outputs.length!==0||r.grid!=null||r.magic!=null||r.duration!=null||r.energy!=null||Object.keys(r.properties).length)invalid();
  const slots=new Set<number>();for(const input of r.inputs){if(input.kind!=='item'||![0,1].includes(input.slot)||slots.has(input.slot)||!input.choices.length)invalid();slots.add(input.slot);
    for(const c of input.choices)if(c.amount!=='1'||c.returns.length||c.rule.kind!=='wildcard'||!c.rule.nbt||c.rule.meta!==(input.slot===p.orb)||c.consume.kind!==(input.slot===p.orb?'keep':'consume'))invalid();
  }
}
export function bloodCalcinatorNote(p:Process,locale:'zh-CN'|'en-US'='zh-CN'):string{
  return locale==='en-US'
    ?`Internal reagent: ${p.name} (${p.reagent}), signed amount ${p.amount}. Consumes one material and retains the blood orb. Requires a valid soul-network owner, 10 LP per successful work tick and compatible space for the complete amount in the 2000-unit buffer. Completion at 200 progress adds reagent, not an item. Missing power/space pauses progress; no material resets it. Changing valid material can retain progress. Up to 20 units transfer to the 4000-unit main tank per tick. Signed/nonpositive values retain native tank behavior; no fixed elapsed duration or guaranteed item yield is implied.`
    :`内部试剂：${p.name}（${p.reagent}），有符号数量 ${p.amount}。取用一件原料并保留血之宝珠，需要有效灵魂网络所有者、每个成功工作 tick 的 10 LP，以及 2000 容量缓冲中的完整兼容空间。进度达到 200 时加入试剂，不产出物品。缺能量／空间暂停进度，无原料才归零，换有效原料可保留进度。每 tick 最多向 4000 容量主罐转移 20 单位。非正值保留原生储罐行为，不代表固定墙钟时间或保证物品产量。`;
}
