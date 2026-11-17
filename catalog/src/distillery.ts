import type {Item,Recipe} from '@elysium/contracts';
type Process=Extract<NonNullable<Recipe['process']>,{kind:'witcheryDistillery'}>;
type Reagent=Process['reagents'][number];

export function validateDistilleryRecipe(r:Recipe):void{
  const p=r.process;if(p?.kind!=='witcheryDistillery')return;
  const fail=()=>{throw new Error('Invalid native distillery priority, allocation or output law');};
  if(r.source.owner!=='WitcheryExtras'||r.source.handler!=='alkalus.main.nei.NEI_Handler_Distillery'
    ||p.nativeTile!=='com.emoniph.witchery.blocks.BlockDistillery$TileEntityDistillery'
    ||p.nativeCount<=0||p.nativeCount>65536||p.nativeIndex<0||p.nativeIndex>=p.nativeCount
    ||p.earlier.length!==p.nativeIndex||p.nativeCount*p.nativeCount>4194304
    ||!p.reagents.some(Boolean)||p.cookTicks!==800||p.powerPerWorkTickBits!=='3f19999a'
    ||p.matching!=='subtypeMetadataIgnoreCountAndTagsEitherOrder'||p.jarPolicy!=='runtimeCountOnlyClayJarAdmission'
    ||p.debit!=='oneEachOccupiedSignedJarDeltaNoContainers'||p.outputPolicy!=='emptyCopyMatchingMergeKeepsTagsMismatchedSkipThenDebit'
    ||p.workPolicy!=='successTicksPauseOnPowerResetBlockedCarryRecipeChanges'
    ||r.duration!=null||r.energy!=null||r.grid!=null||r.magic!=null||Object.keys(r.properties).length!==0
    ||r.inputs.length!==p.reagents.filter(Boolean).length+(p.jars===0?0:1))fail();
  for(const prototype of p.outputs)if(prototype&&(!/^(0|-?[1-9][0-9]*)$/.test(prototype.amount)||BigInt(prototype.amount)<-2147483648n||BigInt(prototype.amount)>2147483647n))fail();
  if(r.outputs.length!==p.outputs.filter(prototype=>prototype&&BigInt(prototype.amount)>0n).length)fail();
  for(const input of r.inputs){
    const c=input.choices[0];if(input.kind!=='item'||input.choices.length!==1||!c||c.consume.kind!=='allocated'||c.returns.length!==0)fail();
    if(input.slot===2){if(p.jars===0||c!.id!==p.jar||c!.amount!==String(Math.max(1,p.jars))||c!.rule.kind!=='distilleryJar')fail();}
    else{
      const reagent=p.reagents[input.slot];
      if(!reagent||c!.id!==reagent.item||c!.amount!=='1'||c!.rule.kind!=='wildcard'||!c!.rule.nbt||c!.rule.meta!==(reagent.metadata==='ignored'))fail();
    }
  }
  for(const output of r.outputs){
    const proto=p.outputs[output.slot],q=output.quantity;
    if(!proto||output.kind!=='item'||output.id!==proto.id||output.amount!=null||output.change!=null||output.role!=='result'
      ||output.chance.numerator!=='1'||output.chance.denominator!=='1'||q?.kind!=='potential'
      ||q.stat!=='witchery:distilleryOutputState'||q.condition!=='nativeDistillerySlotAccepts'
      ||q.nominal!==proto.amount||q.sample!==q.nominal||q.parameters!=null)fail();
  }
}

export function distillerySelected(p:Process,offered:readonly [Item|null,Item|null],jars:number|null,items:ReadonlyMap<string,Item>):boolean{
  const one=(actual:Item|null,expected:Reagent)=>actual==null?expected==null:expected!=null&&items.get(expected.item)?.registry===actual.registry
    &&(expected.metadata==='ignored'||items.get(expected.item)?.meta===actual.meta);
  const matches=(reagents:Process['reagents'],count:number)=>(count===0||jars!=null&&jars>=count)
    &&(one(offered[0],reagents[0])&&one(offered[1],reagents[1])||one(offered[0],reagents[1])&&one(offered[1],reagents[0]));
  return offered.some(Boolean)&&matches(p.reagents,p.jars)&&!p.earlier.some(prior=>matches(prior.reagents,prior.jars));
}

export function distilleryNote(p:Process,locale:'zh-CN'|'en-US'='zh-CN'):string{
  return locale==='en-US'
    ? `The first matching native recipe wins, including its jar threshold. Reagent slots can be swapped; a null slot must stay empty. Item and subtype metadata match, ignoring count and NBT. Every occupied reagent slot loses one item; the jar stack is adjusted by signed count ${p.jars}, without container returns. Insertion admits clay jars, while the runtime matcher only checks jar-stack presence and count. Empty output slots copy their prototypes. Matching item/meta slots merge counts while keeping existing NBT; incompatible output slots skip placement but reagents and jars are still debited. Only matching occupied outputs can block on stack capacity, using signed-int addition. Work needs 800 successful altar-power ticks at native float0.6 per tick; missing power pauses progress, blocked processing resets it, and eligible recipe changes retain progress. Outputs are conditional inventory prototypes, not guaranteed results.`
    : `按注册顺序选择首个匹配配方，罐子数量门槛也参与优先级。两个原料槽可互换，空槽须留空；按物品与原生子类型元数据匹配，忽略数量和 NBT。每个占用的原料槽扣一件，罐子按有符号数量 ${p.jars} 调整，不产生合成容器返还。正常插入只接收空陶罐，运行时匹配仅检查罐子槽的存在与数量。空输出槽复制产物原型；相同物品与元数据合并时保留已有 NBT；不兼容输出槽跳过放入，原料和罐子仍会扣除。仅相同物品的已有输出会因堆叠容量阻断，数量按原生有符号整数相加。需要 800 个成功供给祭坛能量的工作 tick，每步消耗原生 float0.6；缺能暂停，不能加工时归零，仍可加工的配方切换会保留进度。所示为条件产物原型，不保证实际库存一定取得。`;
}
