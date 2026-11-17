import type {Fluid,Item,Recipe} from '@elysium/contracts';

type FluidProcess=Extract<NonNullable<Recipe['process']>,{kind:'gendustryFluid'}>;
function invalid():never{throw new Error('Invalid native Gendustry fluid source or complete-batch process');}
const handlers=new Set(['net.bdew.gendustry.nei.LiquifierHandler','net.bdew.gendustry.nei.MutagenProducerHandler']);

/** One native unit from a complete source table. Excluded exact keys still block the wildcard. */
export function validateGendustryFluidRecipe(r:Recipe,items?:ReadonlyMap<string,Item>,fluids?:ReadonlyMap<string,Fluid>):void{
  const p=r.process;
  if(p?.kind!=='gendustryFluid'){if(handlers.has(r.source.handler))invalid();return;}
  if(p.version!=='1.9.4-GTNH'||r.source.handler!==`net.bdew.gendustry.nei.${p.machine==='protein'?'Liquifier':'MutagenProducer'}Handler`
    ||r.duration!=null||r.energy!=null||r.grid!=null||r.magic!=null||r.inputs.length!==1||r.outputs.length!==1
    ||p.sources.length>65536||p.config.mjPerItem<=0||p.config.powerUseRate<0||p.config.activationEnergy<0||p.config.tankSize<=0)invalid();
  const input=r.inputs[0]!,output=r.outputs[0]!;
  if(input.kind!=='item'||input.slot!==p.input||input.choices.length!==1||output.kind!=='fluid'||output.id!==p.fluid
    ||output.slot!==0||output.role!=='result'||output.quantity!=null||output.change!=null
    ||output.chance.numerator!=='1'||output.chance.denominator!=='1')invalid();
  const choice=input.choices[0]!;
  if(choice.amount!=='1'||choice.consume.kind!=='consume'||choice.returns.length!==0)invalid();
  const keys=new Set(p.sources.map(s=>JSON.stringify([s.registry,s.meta])));
  if(keys.size!==p.sources.length||p.sources.some(s=>!s.registry))invalid();
  if(items){
    const item=items.get(choice.id)??invalid();
    const source=p.sources.find(s=>s.registry===item.registry&&s.meta===item.meta)
      ??p.sources.find(s=>s.registry===item.registry&&s.meta===32767)??invalid();
    if(source.amount<=0||source.amount>p.config.tankSize||output.amount!==String(source.amount))invalid();
    const wild=(rule:typeof choice.rule,meta:boolean)=>rule.kind==='wildcard'&&rule.meta===meta&&rule.nbt;
    if(source.meta!==32767){if(!wild(choice.rule,false))invalid();}
    else {
      const overrides=p.sources.filter(s=>s.registry===source.registry&&s.meta!==32767);
      if(!overrides.length){if(!wild(choice.rule,true))invalid();}
      else{
        const rule=choice.rule;if(rule.kind!=='except'||!wild(rule.base,true)||rule.exclude.length!==overrides.length)invalid();
        const metadata=new Set<number>();for(const excluded of rule.exclude){
          const actual=items.get(excluded.id)??invalid();
          if(actual.registry!==source.registry||metadata.has(actual.meta)||!overrides.some(s=>s.meta===actual.meta)||!wild(excluded.rule,false))invalid();
          metadata.add(actual.meta);
        }
      }
    }
  }
  if(fluids){const fluid=fluids.get(p.fluid)??invalid();if(fluid.registry!==p.machine||fluid.nbt!=null)invalid();}
}

export function gendustryFluidNote(p:FluidProcess,locale:'zh-CN'|'en-US'='zh-CN'):string{
  const c=p.config;
  return locale==='en-US'
    ?`Exact metadata overrides 32767, including zero/negative blockers. A normal start consumes one item without a crafting return. The full pending fluid batch waits for output space (${c.tankSize} mB tank); no overflow is discarded. Native energy: ${c.mjPerItem} MJ per item, power use rate ${c.powerUseRate}, activation ${c.activationEnergy}, stored/received limits ${c.maxStoredEnergy}/${c.maxReceivedEnergy}. Stored energy governs progress; no fixed duration or guaranteed completed batch is asserted.`
    :`精确元数据优先于 32767，包括零／负值阻断项。正常启动取用一件，不返还合成容器。完整待输出流体批次会等待产物空间（罐容量 ${c.tankSize} mB），不丢弃溢出。原生每件能量 ${c.mjPerItem} MJ，用能速率 ${c.powerUseRate}，启动门槛 ${c.activationEnergy}，储能／接收上限 ${c.maxStoredEnergy}/${c.maxReceivedEnergy}。进度依实际储能推进，没有固定时长，也不保证每次输入已完成产出。`;
}
