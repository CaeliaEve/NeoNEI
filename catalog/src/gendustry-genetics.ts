import type {Fluid,Input,Item,Recipe} from '@elysium/contracts';

type Genetics=Extract<NonNullable<Recipe['process']>,{kind:'gendustryGenetics'}>;
const machines:Record<string,string>={imprint:'Imprinter',sample:'Sampler',transposeSample:'Transposer',transposeTemplate:'Transposer',mutate:'Mutatron',replicate:'Replicator',extract:'Extractor'};
const roles:Record<string,string[]>={imprint:['individual','template','labware'],sample:['individual','blank','labware'],
  transposeSample:['template','blank','labware'],transposeTemplate:['template','blank','labware'],mutate:['parent0','parent1','labware'],replicate:['template'],extract:['individual','labware']};
const handler=(machine:string)=>`net.bdew.gendustry.nei.${machine}Handler`;
function invalid():never{throw new Error('Invalid native Gendustry genetics process or source partition');}
const threshold=(value:number)=>Math.max(0,Math.min(100,Math.ceil(value)));

/** Machine-owned rules and prototypes, never a generic guaranteed craft inferred from the GUI. */
export function validateGendustryGeneticsRecipe(r:Recipe,items?:ReadonlyMap<string,Item>,fluids?:ReadonlyMap<string,Fluid>):void{
  const p=r.process;
  if(p?.kind!=='gendustryGenetics'){
    if(Object.values(machines).some(machine=>r.source.handler===handler(machine)))invalid();
    return;
  }
  const required=roles[p.operation];
  if(p.roots.some(root=>root.mutations.some(mutation=>mutation.conditions.length!==0)))invalid();
  if(!required||r.source.handler!==handler(machines[p.operation]!)||r.grid!=null||r.duration!=null||r.energy!=null||r.magic!=null
    ||p.rngBound!==100||p.config.mjPerItem<=0||p.config.powerUseRate<0||p.config.activationEnergy<0
    ||Object.keys(p.slots).length!==required.length||required.some(role=>p.slots[role]==null)
    ||new Set(Object.values(p.slots)).size!==required.length
    ||r.inputs.filter(i=>i.kind==='item').length!==required.length||r.outputs.length!==1)invalid();
  for(const [role,slot] of Object.entries(p.slots)){
    const input=r.inputs.find(i=>i.kind==='item'&&i.slot===slot)??invalid();
    if(input.choices.length!==1)invalid();
    for(const c of input.choices){
      if(c.amount!=='1'||c.returns.length!==0||(!(p.operation==='extract'&&role==='individual')
        &&(c.rule.kind!=='wildcard'||!c.rule.nbt)))invalid();
      const keep=role==='template'&&['imprint','transposeSample','transposeTemplate','replicate'].includes(p.operation);
      if(role==='labware'){
        const raw=p.labwareThreshold;if(raw==null||!Number.isFinite(raw)||raw!==p.config.labwareConsumeChance)invalid();
        const successes=threshold(raw);
        if(c.consume.kind==='keep'?successes!==0:c.consume.kind==='consume'?successes!==100
          :c.consume.kind==='chance'?BigInt(c.consume.chance.denominator)<=0n
            ||BigInt(c.consume.chance.numerator)*100n!==BigInt(successes)*BigInt(c.consume.chance.denominator):true)invalid();
      }else if(c.consume.kind!==(keep?'keep':'consume'))invalid();
      if(items&&!items.has(c.id))invalid();
    }
  }
  if(p.operation==='replicate'){
    if(p.labwareThreshold!=null||p.config.labwareConsumeChance!=null||p.config.makePristineBees==null)invalid();
  }
  const stocks=r.inputs.filter(i=>i.kind==='fluid');
  const amounts=p.operation==='replicate'?[p.config.dnaPerItem,p.config.proteinPerItem]:p.operation==='mutate'?[p.config.mutagenPerItem]:[];
  if(stocks.length!==amounts.length||stocks.some((i,index)=>amounts[index]==null||i.choices.length!==1
    ||i.choices.some(c=>c.amount!==String(amounts[index])||c.consume.kind!=='consume'||c.returns.length!==0)))invalid();
  const output=r.outputs[0]!;
  if(output.role!=='result'||output.quantity!=null||output.chance.numerator!=='1'||output.chance.denominator!=='1')invalid();
  if(p.operation==='extract'){
    if(output.kind!=='fluid'||output.change!=null||!p.sources||p.sources.length>65536)invalid();
    const keys=new Set(p.sources.map(s=>JSON.stringify([s.registry,s.meta])));
    if(keys.size!==p.sources.length||p.sources.some(s=>!s.registry))invalid();
    if(items){
      const c=r.inputs.find(i=>i.kind==='item'&&i.slot===p.slots.individual)!.choices[0]!;
      const item=items.get(c.id)??invalid();
      const source=p.sources.find(s=>s.registry===item.registry&&s.meta===item.meta)
        ??p.sources.find(s=>s.registry===item.registry&&s.meta===32767)??invalid();
      if(source.amount<=0||output.amount!==String(source.amount)||p.config.tankSize==null||source.amount>p.config.tankSize)invalid();
      const wild=(rule:typeof c.rule,meta:boolean)=>rule.kind==='wildcard'&&rule.nbt&&rule.meta===meta;
      if(source.meta!==32767){if(!wild(c.rule,false))invalid();}
      else {
        const overrides=p.sources.filter(s=>s.registry===item.registry&&s.meta!==32767);
        if(overrides.length===0){if(!wild(c.rule,true))invalid();}
        else {
          if(c.rule.kind!=='except'||!wild(c.rule.base,true)||c.rule.exclude.length!==overrides.length)invalid();
          const excluded=new Set<number>();
          for(const entry of c.rule.exclude){
            const other=items.get(entry.id)??invalid();
            if(other.registry!==item.registry||!overrides.some(s=>s.meta===other.meta)||excluded.has(other.meta)||!wild(entry.rule,false))invalid();
            excluded.add(other.meta);
          }
        }
      }
    }
    if(fluids){const dna=fluids.get(output.id)??invalid();if(dna.registry!=='liquiddna'||dna.nbt!=null)invalid();}
  } else {
    if(p.sources!=null||output.kind!=='item'||output.amount!=='1')invalid();
    const change=output.change??invalid();
    const edit=change.action;
    const action=p.operation==='imprint'?'gendustryGenome':p.operation==='sample'?'gendustryGeneSample':p.operation==='replicate'?'gendustryReplication':p.operation==='mutate'?'gendustryMutation':'gendustryGeneTemplate';
    const primary=p.operation==='imprint'||p.operation==='sample'?'individual':p.operation==='mutate'?'parent0':'template';
    if(edit.kind!==action||!('operation'in edit)||edit.operation!==p.operation
      ||change.input!==p.slots[primary]||!('slots'in edit))invalid();
    if(Object.keys(edit.slots).length!==required.length||required.some(role=>edit.slots[role]!==p.slots[role])
      ||change.bindings==null||change.samples.length!==change.bindings.length)invalid();
  }
  const policy=p.outputPolicy;
  if(p.operation==='imprint'?policy.kind!=='imprinter':p.operation==='sample'?policy.kind!=='sampler':p.operation==='mutate'?policy.kind!=='mutatron':policy.kind!=='direct')invalid();
}

export function gendustryGeneticsNotes(p:Genetics,locale:'zh-CN'|'en-US'='zh-CN'):string[]{
  const en=locale==='en-US',c=p.config;
  const rules:Record<string,[string,string]>={
    imprint:['保留模板，取用一个个体；替换所列染色体的两条等位基因，保留个体的其他标签。非雄蜂先进行自然／人工个体死亡抽取，死亡产出废料。',
      'Retain the template and use one individual. Replace both alleles of each listed chromosome and retain other individual tags. Non-drone bees first draw natural/artificial mortality; death produces waste.'],
    sample:['取用一个个体和一个空容器；从所有非空染色体的两条等位基因中等机会抽取，重复基因仍占各自抽取位置。所示样本不保证获得。',
      'Use one individual and one blank sample. Draw equally from both alleles of every non-null chromosome; duplicate alleles keep their separate draw positions. The displayed sample is not guaranteed.'],
    transposeSample:['保留来源样本，取用空容器；复制实际投入样本的数量、元数据与完整标签，输出空间仍可能阻断完成。',
      'Retain the source sample and use a blank. Copy the offered sample count, metadata and full tags; output space can still block completion.'],
    transposeTemplate:['保留来源模板，取用相容的空模板；在空模板副本上逐项合并来源基因，保留空模板的其他标签。',
      'Retain the source template and use a compatible blank template. Merge source genes into a copy of the blank, retaining its other tags.'],
    mutate:['蜂亲本为公主蜂与雄蜂，树木为树苗与花粉。按原生突变集合、覆盖设置与世界条件筛选；秘密分支、退化及死亡抽取互相关联，空候选可无结果。',
      'Bee parents are princess and drone; tree parents are sapling and pollen. Native mutations, overrides and world conditions filter candidates. Secret selection, degradation and mortality are correlated; no candidates can return no result.'],
    replicate:['保留完整模板，按根的默认基因与模板构造已分析个体；蜂产物为自交蜂后，寿命取所选基因，天然属性按配置。',
      'Retain a complete template and construct an analyzed individual from root defaults and offered genes. Bees become self-mated queens; lifespan follows the selected allele and pristine status follows configuration.'],
    extract:['DNA 源先匹配精确元数据，再回退 32767；精确零值或负值会阻断通配。每批取用一件，完整批量必须能放入液体 DNA 输出罐。',
      'DNA sources match exact metadata before 32767 fallback. Exact zero or negative values block the wildcard. Use one item per batch; the full liquid DNA batch must fit the output tank.'],
  };
  const result=[rules[p.operation]![en?1:0],en
    ? `Native energy: ${c.mjPerItem} MJ per item; power use rate ${c.powerUseRate}; activation ${c.activationEnergy}; stored/received limits ${c.maxStoredEnergy}/${c.maxReceivedEnergy}. Progress depends on stored energy; no fixed duration is asserted.`
    : `原生能量：每件 ${c.mjPerItem} MJ；用能速率 ${c.powerUseRate}；启动门槛 ${c.activationEnergy}；储能／接收上限 ${c.maxStoredEnergy}/${c.maxReceivedEnergy}。进度取决于实际储能，没有固定时长。`];
  if(p.labwareThreshold!=null)result.push(en?`Labware must be present. Native nextInt(100) < ${p.labwareThreshold} consumes it on ${threshold(p.labwareThreshold)}/100 draws; unused labware remains.`
    :`实验耗材必须在槽；原生 nextInt(100) < ${p.labwareThreshold} 对应 ${threshold(p.labwareThreshold)}/100 的消耗抽取，未消耗时保留。`);
  if(p.operation==='imprint')result.push(en?`Natural/artificial mortality thresholds: ${c.deathChanceNatural}/${c.deathChanceArtificial}; drones are exempt.`:`自然／人工个体死亡阈值：${c.deathChanceNatural}/${c.deathChanceArtificial}；雄蜂豁免。`);
  if(p.operation==='mutate')result.push(en?`Mutagen stock ${c.mutagenPerItem} mB; tank ${c.tankSize} mB. Secret/degradation/artificial mortality thresholds ${c.secretChance}/${c.degradeChanceNatural}/${c.deathChanceArtificial}; they are not independent output probabilities.`
    :`诱变剂存量 ${c.mutagenPerItem} mB，罐容量 ${c.tankSize} mB；秘密／自然退化／人工死亡阈值 ${c.secretChance}/${c.degradeChanceNatural}/${c.deathChanceArtificial}，不是各产物独立概率。`);
  if(p.operation==='replicate')result.push(en?`Stock gates: DNA ${c.dnaPerItem} mB and protein ${c.proteinPerItem} mB; tank capacities ${c.dnaTankSize}/${c.proteinTankSize} mB.`
    :`存量门槛：DNA ${c.dnaPerItem} mB、蛋白质 ${c.proteinPerItem} mB；罐容量 ${c.dnaTankSize}/${c.proteinTankSize} mB。`);
  return result;
}

export function gendustryGeneticsOutputNote(locale:'zh-CN'|'en-US'='zh-CN'):string{
  return locale==='en-US'?'Conditional native result prototype; actual genes, inventory, random draws and machine/world state determine the result. This is not an observed or guaranteed batch yield.'
    :'条件原生产物原型；实际基因、库存、随机抽取及机器／世界状态决定结果，不是已观测或保证获得的批次产量。';
}

export function gendustryGeneticsInputNote(p:Genetics,input:Input,locale:'zh-CN'|'en-US'='zh-CN'):string{
  const en=locale==='en-US';
  if(input.kind==='fluid')return en?`Stock gate ${input.choices[0]?.amount} mB; used when the native machine starts successfully. Completion still requires output space.`
    :`存量门槛 ${input.choices[0]?.amount} mB，原生机器成功启动时取用；完成仍需产物空间。`;
  const role=Object.entries(p.slots).find(([,slot])=>slot===input.slot)?.[0]??invalid();
  if(role==='labware')return en?`Keep one labware in the slot; consume it on ${threshold(p.labwareThreshold!)}/100 integer draws. Total batch consumption is conditional.`
    :`槽内须有一件实验耗材，以 ${threshold(p.labwareThreshold!)}/100 的整数抽取概率消耗；批次总消耗不确定。`;
  if(role==='template')return en?'Retain the offered gene sample/template. Root compatibility, required genes and native machine conditions must hold.'
    :'保留投入的基因样本／模板；仍须满足根相容、所需基因与原生机器条件。';
  return en?'Use one item on a successful native start. The actual genome, compatible counterpart and machine state determine whether the operation can start.'
    :'原生机器成功启动时取用一件；实际基因组、相容的配对材料及机器状态决定能否启动。';
}
