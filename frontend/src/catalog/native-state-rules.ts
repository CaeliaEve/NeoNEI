import type {Choice,Input,Output,Recipe} from '@elysium/contracts';
type Process=NonNullable<Recipe['process']>;
type Meteor=Extract<Process,{kind:'bloodmagic-meteor'}>;

/** Shared by the recipe details and the bill of materials; consumption tags alone do not identify a machine. */
export function nativeStateInputNote(p:Recipe['process'],input:Input,choice:Choice,locale:'zh-CN'|'en-US'):string|null{
  if(p?.kind==='witcheryKettle'&&input.kind==='item'&&input.slot===6)return locale==='en-US'?'Extraction uses one glass bottle per output item removed. The displayed one bottle is not a fixed batch cost.':'取出产物时每取出一件消耗一个玻璃瓶；显示一个瓶子不是固定整批费用。';
  if(p?.kind!=='binnie_genetics')return null;
  const text=(zh:string,en:string)=>locale==='en-US'?en:zh;
  if(choice.consume.kind==='buffer')return input.kind==='fluid'
    ? text('所示为最低存量门槛；按工作 tick 与内部浮点累计量取用，储量可跨周期保留，不是启动时清空液罐或固定批次费用。','The displayed quantity is a minimum tank gate. Work ticks use an internal float accumulator that can persist across cycles; starting does not empty the tank, and this is not a fixed batch cost.')
    : text('物品用于补充机器内部充量；按原生工作进度取用储量，不等于每批消耗显示数量。','Items replenish the machine’s internal charges. Native work progress uses those charges; the displayed quantity is not a fixed per-batch item cost.');
  if(choice.consume.kind==='wear'&&(p.machine==='splicer'||p.machine==='inoculator'))return text(
    `血清需要非零充量；完成时耐久损耗增加 ${p.serumDamage}，实际工作量取决于不匹配基因。`,
    `Serum requires nonzero charges. Completion increases its damage by ${p.serumDamage}; actual work depends on mismatched genes.`);
  if(choice.consume.kind!=='staged')return null;
  switch(p.machine){
    case 'acclimatiser':return input.slot===0
      ? text('每次原生尝试取走第一个物品与元数据相同的试剂，即使个体耐性未发生变化也会消耗。','Each native attempt takes the first item/meta-equal reagent, even when the individual’s tolerance does not change.')
      : text('尝试修改目标个体的耐性；试剂从有效占用槽均匀抽取。个体保留，显示数量不是每批销毁数量。','Attempts to change the target individual’s tolerance; a reagent is chosen uniformly from valid occupied slots. The individual remains; the displayed quantity is not a per-batch deletion count.');
    case 'genepool':return text('完成时清空整个输入堆叠，DNA 产量按个体类型与交配状态决定，不按显示数量推算固定批次用量。','Completion deletes the entire input stack. DNA yield depends on the individual’s type and mating state; the displayed count does not define a fixed batch cost.');
    case 'isolator':return input.kind==='fluid'
      ? text('按原生分离阶段检查并取用乙醇；是否得到序列及消耗个体仍取决于基因抽取与原生阈值。','The native isolation stage checks and uses ethanol. Sequence production and individual consumption still depend on gene selection and the native threshold.')
      : text('随机抽取有效染色体与同源基因后才可能消耗个体；无有效基因时不产出也不消耗个体，不能按批次固定扣一件。','Individual consumption is conditional on a valid chromosome/homolog roll and the native threshold. Invalid genomes produce no gene and consume no individual; there is no fixed one-item cost per batch.');
    case 'incubator':return text('按原生随机工作尝试与损失概率取料；先缓存首个物品和流体匹配项，不能把显示存量当作每批必定消耗。','Native random work attempts and loss probability govern consumption. The first item/fluid match is cached; the displayed stock is not guaranteed consumption per batch.');
    case 'analyser':return text('仅处理可分析且未分析的输入；完成时转换或重写个体分析数据，结果取决于实际输入 NBT。','Only analysable, unanalysed input is admitted. Completion converts or rewrites its analysis data; the result depends on actual input NBT.');
    case 'sequencer':return text('按品质与已存测序进度继续工作；需要所有者、染料充量及空瓶输出空间，不能把输入数量当作固定工作量。','Work resumes from stored sequencing progress and scales with grade. An owner, dye charges and empty-vial output room are required; input count is not a fixed amount of work.');
    case 'splicer':case 'inoculator':return text('对有效个体先分析再修改两套同源基因；需要同域血清与非零充量，实际工作量随不匹配基因数变化。','A valid individual is analysed before both homologs are modified. Same-root serum with nonzero charges is required; work scales with mismatched genes.');
    case 'polymeriser':return text('输入必须有正数耐久损耗；完成后损耗减少一，工作量随基因数与可选金催化变化，并非消耗一个输入物品。','Input must have positive damage. Completion reduces damage by one; work scales with gene count and optional gold catalysis, rather than consuming one input item.');
  }
}

export function nativeStateOutputNote(p:Recipe['process'],output:Output,locale:'zh-CN'|'en-US'):string|null{
  const q=output.quantity;
  if(p?.kind==='witcheryKettle')return locale==='en-US'?`Base yield ${p.baseOutput}; a witch hat adds ${p.hatBonus}. Each removed item requires a separate bottle. Altar, dimension and familiar conditions still apply.`:`基础产量 ${p.baseOutput}，巫师帽增加 ${p.hatBonus}；每取出一件需要单独的瓶子，仍须满足祭坛、维度与魔宠条件。`;
  if(p?.kind==='witcheryInfernal'&&output.slot===1)return locale==='en-US'?'Bonus count is the number of successful native bellows rolls, not a guaranteed four-item output.':'额外产量等于原生风箱抽取的成功次数，不是保证产出四件。';
  if(p?.kind!=='binnie_genetics'||q?.kind!=='potential'||q.stat!=='binnie:geneticTransform'||q.condition!=='nativeInputState')return null;
  return locale==='en-US'
    ? 'Conditional genetic result: actual genes, input NBT, machine progress and output room determine the result. The displayed specimen is not a guaranteed fixed yield.'
    : '条件基因结果：实际基因、输入 NBT、机器进度与输出空间共同决定结果；显示样本不是保证产量或固定标签结果。';
}
export interface NativeStateRules {
  title:string;paragraphs:string[];facts:{label:string;value:string}[];
  structure?:{label:string;columns:string[];stones:{x:number;y:number;z:number;stone:number}[]};
  pools?:{label:string;entries:Meteor['ores']}[];
}
function nativeFloat(value:number):string{
  for(let digits=1;digits<=9;digits++){
    const short=Number(value.toPrecision(digits));
    if(Math.fround(short)===Math.fround(value))return String(short);
  }
  return String(value);
}
/** Authored explanations of typed native laws. Game names remain selected Catalog data. */
export function nativeStateRules(p:Recipe['process'],locale:'zh-CN'|'en-US'):NativeStateRules|null{
  if(!p||!['bloodmagic-altar','bloodmagic-binding','bloodmagic-meteor','binnie_genetics','witcheryKettle','witcheryInfernal'].includes(p.kind))return null;
  const text=(zh:string,en:string)=>locale==='en-US'?en:zh;
  const panel:NativeStateRules={title:'',paragraphs:[],facts:[]};
  const fact=(zh:string,en:string,value:unknown)=>panel.facts.push({label:text(zh,en),value:String(value)});
  const float=(zh:string,en:string,value:number)=>fact(zh,en,nativeFloat(value));
  const note=(zh:string,en:string)=>panel.paragraphs.push(text(zh,en));
  if(p.kind==='witcheryKettle'){
    panel.title=text('巫术釜原生规则','Witchery kettle rules');float('祭坛能量门槛','Altar power threshold',p.power);
    fact('所需维度（0 为不限）','Required dimension (0 means any)',p.dimension);fact('魔宠种类（0 为不限）','Familiar type (0 means any)',p.familiarType);
    fact('基础产量','Base output',p.baseOutput);fact('巫师帽额外产量','Witch-hat bonus',p.hatBonus);fact('水 mB','Water mB',p.waterMillibuckets);fact('每件取出产物所需瓶子','Bottles per extracted item',p.bottlesPerItem);
    note('每条原生需求各匹配一个占用格，忽略物品 NBT；祭坛、世界维度和魔宠条件影响执行。产物先留在釜内，按每件一个玻璃瓶分别取出，不把展示的一个瓶子当成整批费用。','Each native requirement matches one occupied cell, ignoring item NBT. Altar, world dimension and familiar conditions affect execution. The result remains in the kettle and is extracted one glass bottle per item; the single bottle shown is not an entire batch cost.');return panel;
  }
  if(p.kind==='witcheryInfernal'){
    panel.title=text('炼狱高炉原生规则','Infernal blast furnace rules');fact('原料数量门槛','Input stock threshold',p.inputCount);fact('基础工作 tick','Base work ticks',p.baseTicks);
    fact('需要特殊燃料','Special fuel required',text(p.specialFuel?'是':'否',p.specialFuel?'Yes':'No'));fact('最多风箱数','Maximum bellows',p.maximumBellows);fact('每风箱时间减少','Ticks removed per bellows',p.ticksPerBellows);
    fact('无风箱副产物概率','Bonus chance without bellows',p.noBellowsChance);fact('每风箱独立概率','Independent chance per bellows',p.perBellowsChance);
    note('按原生顺序选择首条满足物品、元数据或矿辞及库存数量的配方。Vis 加速先将基础时间除以 2，之后每个风箱再减 40 tick。额外产物没有固定数量：无风箱时抽一次，有风箱时各抽一次，每次成功一件。仍须满足燃料和产物空间条件。','The first native entry matching item, metadata/ore and stock count wins. Vis acceleration divides base time by two before each bellows removes 40 ticks. Bonus yield is variable: one roll without bellows, or one roll per bellows, adding one item per success. Fuel and output space remain execution conditions.');return panel;
  }
  if(p.kind==='bloodmagic-altar'){
    panel.title=text('血魔法祭坛原生规则','Blood Magic altar rules');
    fact('最低祭坛等级','Minimum altar tier',p.tier);fact('基础生命源质','Base LP',p.lp);
    fact('基础消耗速率','Base LP per active tick',p.consumptionRate);fact('空罐衰减速率','Empty-tank progress decay',p.drainRate);
    if(p.canBeFilled){
      note('充能保留血球，不生成合成物品。需要血球有非空所有者，再向其灵魂网络补充生命源质。','Charging keeps the orb and creates no crafted item. A nonempty owner is required; accepted LP charges that owner’s soul network.');
      if(p.orb)fact('血球基础网络容量','Base orb network capacity',p.orb.maxEssence);
      note('容量符文将网络上限乘以 1 + 0.04 × 符文数量；只扣除网络实际接受的生命源质。','Orb runes multiply the network limit by 1 + 0.04 × rune count. Only LP accepted by the network is debited.');
    }else note('整个输入堆叠一起转化；配方数量是基础产量。空罐时进度衰减，完成时会重新按原生顺序查找匹配结果。','The entire input stack converts together; the output quantity is a base yield. An empty tank loses progress, and completion selects the first current native match again.');
    note('服务端有效祭坛结构与等级、正数生命源质是启动条件。较早的注册规则具有优先权。','Starting requires a valid server-side altar structure and tier and positive LP. Earlier registered matches take priority.');
    fact('较早的匹配规则数','Earlier matching predicates',p.earlier.length);
    if(p.nbt==='native-presence-no-compound-at-required-keys')note('需要输入带有 NBT；所列顶层键出现复合标签会使原生递归比较失败，缺键和叶值不作相等比较。','Offered NBT must exist. A compound at a listed top-level key fails the native recursive check; missing keys and leaf values are not compared for equality.');
    if(p.nbtKeys.length)fact('原生 NBT 键','Native NBT keys',p.nbtKeys.join(', '));
    note('速度符文每枚增加 0.25 消耗倍率；衰减按 0.8 的符文数次幂变化。更好容量、普通容量、加速与位移符文分别影响液罐、缓冲传输和检查间隔，实际速度不是固定配方时间。','Each speed rune adds 0.25 to the consumption multiplier; progress decay scales by 0.8 to the speed-rune count. Capacity, acceleration and displacement upgrades affect tank and buffer transfer and check intervals; this is not a fixed recipe duration.');
    return panel;
  }
  if(p.kind==='bloodmagic-binding'||p.kind==='bloodmagic-meteor'){
    panel.title=p.kind==='bloodmagic-binding'?text('绑定仪式原生规则','Binding ritual rules'):text('陨石仪式原生规则','Falling Tower ritual rules');
    fact('启动网络消耗','Activation network LP',p.activationCost);fact('最低激活水晶等级','Minimum activation crystal level',p.crystalLevel);
    fact('较早的匹配规则数','Earlier matching predicates',p.earlier.length);
    note('需要有效、激活且有所有者的仪式石与原生结构，事件仍可能阻止启动。将一个匹配物品丢在仪式石正上方，按注册顺序选择。','Requires an active, owned ritual stone and valid native structure; events may block activation. Drop a matching item directly above the stone; native registry order selects the match.');
    panel.structure={label:text('仪式石相对位置','Relative ritual stone positions'),columns:['X','Y','Z',text('符文类型','Rune type')],stones:p.components};
    if(p.kind==='bloodmagic-binding'){
      fact('每次刷新网络门槛','Network LP required each refresh',p.refreshCost);fact('成功刷新冷却步数','Affordable refresh cooldown steps',p.cooldown);
      note('忽略输入数量与 NBT，只扣一件。待处理结果期间仍需网络达到刷新费用，但费用只在空闲扫描分支扣除，即使该次没有匹配也会扣除。冷却降至零后生成结果实体并关闭仪式。','Matching ignores count and NBT and consumes one item. Pending results still require the refresh LP gate. Payment occurs only in the idle scan branch, including scans with no match. At nonpositive cooldown, the result entity spawns and the ritual deactivates.');
    }else{
      fact('陨石召唤消耗','Meteor summon LP',p.cost);fact('基础半径','Base radius',p.radius);fact('基础填充概率 %','Base filler probability %',p.fillerChance);fact('每种可用试剂消耗','Cost per available reagent',p.reagentCost);
      note('结果是在世界中放置的空间加权方块集合，展示数量不是保证产量。','The result is a spatial, weighted set of world blocks; displayed counts are not guaranteed yields.');
      note('落点只处理严格球形范围内、爆炸后为空气的位置。先抽填充池或矿物池，再按权重抽一个方块；试剂条件、非方块项和原生放置回调都会影响结果。','Only air sites inside the strict sphere after any explosion are eligible. Each site chooses a filler or ore pool and then one weighted block. Reagent conditions, non-block entries and native placement callbacks affect the outcome.');
      note('活跃试剂的最大正半径变化与最小负变化共同生效，半径至少为 1；填充概率按原生浮点顺序调整并限制在 0–100%。空池使用默认方块，试剂可覆盖填充池、关闭爆炸或反转破坏配置。','The greatest positive and most negative active radius changes combine, with radius at least 1. Filler probability follows native float adjustment order and is bounded to 0–100%. Empty pools use the default block; reagents may replace fillers, disable explosions or invert block-damage configuration.');
      panel.pools=[{label:text('矿物权重池','Ore weight pool'),entries:p.ores},{label:text('填充权重池','Filler weight pool'),entries:p.filler},{label:text('默认回退方块','Native fallback block'),entries:[p.fallback]},
        ...p.reagents.map(r=>({label:text('试剂填充池 ','Reagent filler pool ')+(p.reagentIdentities.find(i=>i.id===r.reagent)?.name??r.reagent),entries:r.filler}))];
      for(const r of p.reagents){const name=p.reagentIdentities.find(i=>i.id===r.reagent)?.name??r.reagent;
        fact('试剂修正 '+name,'Reagent modifier '+name,`${r.radiusChange} / ${r.fillerChanceChange} / ${r.rawFillerChanceChange}`);}
    }
    return panel;
  }
  if(p.kind!=='binnie_genetics')return null;
  const names={acclimatiser:['适应机','Acclimatiser'],sequencer:['测序机','Sequencer'],analyser:['分析机','Analyser'],splicer:['基因拼接机','Splicer'],isolator:['基因分离机','Isolator'],inoculator:['基因接种机','Inoculator'],genepool:['基因池','Genepool'],incubator:['培养箱','Incubator'],polymeriser:['聚合机','Polymeriser']} as const;
  panel.title=names[p.machine][locale==='en-US'?1:0]+text('原生状态规则',' native state rules');
  note('展示基因组是原生目录样本，真实运行处理插入的基因组、内部储量与机器状态；条件产物不是固定 NBT 或保证产量。','Displayed genomes are native catalogue specimens. Actual processing uses the inserted genome, internal buffers and machine state; conditional outputs do not promise fixed NBT or yield.');
  if('domain'in p){fact('原生物种域','Native species root',p.domain.root);fact('染色体数量','Chromosome count',p.domain.chromosomes.length);}
  if('baseTicks'in p)fact('基础工作步数','Base work steps',p.baseTicks);
  if('baseRf'in p)fact('基础能量 RF','Base energy RF',p.baseRf);
  if('rfPerTick'in p)fact('每工作步 RF','RF per work step',p.rfPerTick);
  if('attemptInterval'in p)fact('每工作步尝试概率','Attempt probability per work step','1 / '+p.attemptInterval);
  switch(p.machine){
    case 'acclimatiser':
      fact('染色体序号','Chromosome ordinal',p.chromosome);float('适应变化量','Tolerance effect',p.effect);
      note('先选第一个可用适应系统，再从有效占用槽均匀抽取试剂。按活跃耐性边界扩展、限制在五级后决定概率与被修改的同源染色体；即使没有变化，仍消耗第一个物品与元数据相同的试剂。','Selects the first valid tolerance system, then chooses a reagent uniformly from valid occupied slots. Active tolerance bounds expand and clamp to five before the probability and homolog roll. The first item/meta-equal reagent is consumed even when tolerance does not change.');break;
    case 'analyser':
      float('每工作步染料储量','Dye charge per work step',p.dyePerTick);
      note('只处理可分析且尚未分析的输入。优先使用原生育种系统转换；分析会按原生序列化重写个体 NBT，测序样本则更新分析标记。','Admits analysable, unanalysed input. Native breeding-system conversion takes priority. Individual analysis rewrites native serialized NBT; sequence samples update their analysis flag.');break;
    case 'sequencer':
      fact('序列品质级','Sequence grade',p.grade);float('每周期染料充量','Dye charge per cycle',p.dyeChargePerCycle);
      note('需要机器所有者，完成时登记其世界基因追踪记录。按品质缩放工作量，已存测序进度可继续，进度先截断再按有符号字节保存；空瓶输出槽须少于 64 件。','Requires a machine owner and records discovery in that owner’s world gene tracker. Grade scales the work; stored sequencing progress resumes. Progress is truncated and stored as a signed byte. The empty-vial output slot must contain fewer than 64 items.');break;
    case 'splicer':case 'inoculator':
      fact('血清耐久调整','Serum damage increment',p.serumDamage);
      note('需要可操作个体、同物种域的首个血清基因与非零血清充量；只有两个同源染色体都已具有全部目标基因时才失效。先分析再修改两套同源基因，部分比较按原生对象身份进行。','Requires a manipulable individual, the first serum gene in the same species root and nonzero serum charges. It is defunct only when every target gene already matches both homologs. Analysis precedes replacement of both homologs; some native comparisons use object identity.');
      if(p.machine==='inoculator')fact('每周期细菌储量 mB','Bacteria buffer per cycle mB',p.bacteria);
      note('工作量随实际不匹配基因数变化；接种液体以持续浮点储量取用，内部累积状态可跨周期保留。','Work scales with the actual mismatched gene count. Inoculator fluid uses a continuous float accumulator, whose state can persist across cycles.');break;
    case 'isolator':
      float('酶充量','Enzyme charge',p.enzymeCharge);fact('乙醇 mB','Ethanol mB',p.ethanol);float('个体消耗阈值','Individual consumption threshold',p.consumptionThreshold);
      note('从非空原生染色体与两套同源基因中均匀抽取，目标序列槽必须为空；无有效基因时不产出也不消耗个体。显示序列只是一个可能样本，个体是否消耗由原生阈值与随机数决定。','Uniformly selects a non-null native chromosome and active/inactive homolog. The sequence slot must be empty. Invalid genomes yield no gene and consume no individual. The displayed sequence is one possible specimen; the native threshold and RNG decide individual consumption.');break;
    case 'genepool':
      float('每 DNA 乙醇储量','Ethanol per DNA',p.ethanolPerDna);float('酶充量','Enzyme charge',p.enzymeCharge);
      note('完成时清空整个输入堆叠。蜜蜂雄蜂产 10 mB、其他蜜蜂 30 mB、已交配蜜蜂 50 mB、其他个体 10 mB DNA；液体按持续浮点累积量取用，不能将显示液体门槛当作整批费用。','Completion deletes the entire input stack. Drones yield 10 mB DNA, other bees 30 mB, mated bees 50 mB and other individuals 10 mB. Fluid uses a continuous float accumulator; a displayed tank gate is not the complete batch cost.');break;
    case 'incubator':
      float('产物尝试概率','Output attempt probability',p.recipe.chance);float('输入损失概率','Input loss probability',p.recipe.lossChance);
      note('先按原生注册顺序缓存第一个物品与流体匹配项。后续液体门槛只检查储量，输出空间按原生回调判断。幼虫转雄蜂保留原生基因变化与随机尝试，不表示固定转化。','Caches the first native item/fluid match in registry order. Subsequent fluid gating checks volume only, and native callbacks check output room. Larva-to-drone conversion retains native genome transformation and random attempts, rather than a fixed conversion.');break;
    case 'polymeriser':
      fact('每基因 DNA mB','DNA mB per gene',p.dnaPerGene);fact('每基因细菌 mB','Bacteria mB per gene',p.bacteriaPerGene);float('可选金催化时间倍率','Optional gold time multiplier',p.goldTimeScale);float('金催化充量','Gold catalyst charge',p.goldCharge);
      note('需要正数耐久损耗的序列或血清。工作量随基因数及可选金催化变化，完成后耐久损耗减少一；液罐最小门槛为 1 mB，持续浮点储量会跨周期保留。','Requires a sequence or serum with positive damage. Work scales with gene count and optional gold catalysis; completion reduces damage by one. The tank gate is 1 mB, and continuous float accumulator state persists across cycles.');break;
  }
  return panel;
}
