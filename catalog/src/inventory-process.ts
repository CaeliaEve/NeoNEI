import type {Item,Recipe} from '@elysium/contracts';
type Alchemy=Extract<NonNullable<Recipe['process']>,{kind:'bloodAlchemy'}>;
type Soldering=Extract<NonNullable<Recipe['process']>,{kind:'logisticsSoldering'}>;
type Selector=NonNullable<Alchemy['templates'][number]>;
type Offered=Pick<Item,'registry'|'meta'>|null;
function invalid():never {throw new Error('Invalid native writing/soldering inventory process');}
const alchemyHandler='WayofTime.alchemicalWizardry.client.nei.NEIAlchemyRecipeHandler';
const solderingHandler='logisticspipes.nei.NEISolderingStationRecipeManager';
function selector(s:Selector):void{if(!s.registry||s.registry.length>512||!Number.isInteger(s.metadata)||s.metadata< -1||s.metadata>2147483647)invalid();}
function matches(s:Selector,item:Offered,wildcard:boolean):boolean{return !!item&&s.registry===item.registry&&(s.metadata===item.meta||wildcard&&s.metadata===32767);}
function assignment(templates:readonly (Selector|null)[],offered:readonly Offered[]):number[]|null{
  const used=new Set<number>(),selected:number[]=[];
  for(const s of templates)if(s){const at=offered.findIndex((item,cell)=>!used.has(cell)&&matches(s,item,true));if(at<0)return null;used.add(at);selected.push(at);}
  return selected;
}
/** Templates choose physical slots first. Surplus occupied slots do not reject alchemy. */
export function bloodAlchemySelect(p:Alchemy,offered:readonly Offered[],orbRegistry:string):number[]|null{
  if(offered.length!==5)invalid();const orb=p.orbs.find(o=>o.registry===orbRegistry);if(!orb||orb.level<p.minimumOrb)return null;
  const selected=assignment(p.templates,offered);if(!selected)return null;
  return p.earlier.some(prior=>orb.level>=prior.minimumOrb&&assignment(prior.templates,offered)!=null)?null:selected;
}
/** Soldering is absolute, literal, and first registration wins; slot 9 is any non-null item. */
export function logisticsSolderingSelect(p:Soldering,offered:readonly Offered[]):boolean{
  if(offered.length!==9)invalid();const selected=p.definitions.findIndex(d=>d.inputs.every((s,cell)=>s?matches(s,offered[cell]!,false):offered[cell]==null));
  return selected===p.selected;
}
function integer(s:string):bigint{if(s.length>11||!/^(0|-?[1-9][0-9]*)$/.test(s))invalid();const n=BigInt(s);if(n< -2147483648n||n>2147483647n)invalid();return n;}
function common(r:Recipe):void{if(r.magic!=null||r.duration!=null||r.energy!=null||Object.keys(r.properties).length)invalid();}
function output(r:Recipe,p:{result:{id:string;amount:string}},stat:string,items?:ReadonlyMap<string,Item>):void{
  const n=integer(p.result.amount);if(items&&!items.has(p.result.id)||r.outputs.length!==(n>0n?1:0))invalid();
  if(n>0n){const o=r.outputs[0]!;if(o.kind!=='item'||o.role!=='result'||o.slot!==0||o.id!==p.result.id||o.amount!=null||o.change!=null||o.chance.numerator!=='1'||o.chance.denominator!=='1'
    ||o.quantity?.kind!=='potential'||o.quantity.stat!==stat||o.quantity.nominal!==p.result.amount||o.quantity.sample!=null||!o.quantity.condition||o.quantity.parameters!=null)invalid();}
}
export function validateInventoryProcessRecipe(r:Recipe,items?:ReadonlyMap<string,Item>):void{
  const p=r.process;
  if(p?.kind!=='bloodAlchemy'&&p?.kind!=='logisticsSoldering'){if([alchemyHandler,solderingHandler].includes(r.source.handler))invalid();return;}
  common(r);
  if(p.kind==='bloodAlchemy'){
    if(p.version!=='1.7.52'||r.source.owner!=='AWWayofTime'||r.source.handler!==alchemyHandler||r.grid!=null||p.templates.length!==5||p.orb!==5||p.workProgress!==100||p.acceleratedStep!==5||p.earlier.length>65536||!p.orbs.length||p.orbs.length>4096)invalid();
    for(const s of p.templates)if(s)selector(s);for(const prior of p.earlier){if(prior.templates.length!==5)invalid();for(const s of prior.templates)if(s)selector(s);}
    const templates=p.templates.filter((s):s is Selector=>s!=null);if(r.inputs.length!==templates.length+1||p.containers.length!==templates.length)invalid();
    for(const [slot,s] of templates.entries()){const input=r.inputs[slot]!;if(input.kind!=='item'||input.slot!==slot||!input.choices.length||p.containers[slot]!.length!==input.choices.length)invalid();
      for(const [index,c] of input.choices.entries()){
        if(c.amount!=='1'||c.consume.kind!=='allocated'||c.returns.length||c.rule.kind!=='wildcard'||!c.rule.nbt||c.rule.meta!==(s.metadata===32767)||items&&!matches(s,items.get(c.id)??invalid(),true))invalid();
        const container=p.containers[slot]![index];if(container&&(integer(container.amount)<=0n||items&&!items.has(container.id)))invalid();
      }
    }
    if(new Set(p.orbs.map(o=>o.registry)).size!==p.orbs.length||p.orbs.some(o=>!o.registry||o.registry.length>512||o.level<p.minimumOrb))invalid();
    const orb=r.inputs.at(-1)!;if(orb.kind!=='item'||orb.slot!==5||!orb.choices.length)invalid();
    for(const c of orb.choices)if(c.amount!=='1'||c.consume.kind!=='keep'||c.returns.length||c.rule.kind!=='wildcard'||!c.rule.meta||!c.rule.nbt||items&&!p.orbs.some(o=>o.registry===items.get(c.id)?.registry))invalid();
    output(r,p,'bloodmagic:writingTable',items);
  }else{
    if(p.version!=='1.4.24-GTNH'||r.source.owner!=='LogisticsPipes'||r.source.handler!==solderingHandler||p.solderSlot!==9||p.solderPredicate!=='anyItem'||p.heat!==100||p.workProgress!==100||!p.definitions.length||p.definitions.length>65536||!['prototype','freshRandomUuid'].includes(p.resultTag))invalid();
    for(const d of p.definitions){if(d.inputs.length!==9)invalid();selector(d.result);for(const s of d.inputs)if(s)selector(s);}
    const d=p.definitions[p.selected]??invalid();const grid=r.grid;if(!grid||grid.width!==3||grid.height!==3||grid.mirror||grid.cells.length!==9)invalid();
    let slot=0;for(const [cell,s]of d.inputs.entries()){if(!s){if(grid.cells[cell]!=null)invalid();continue;}
      if(grid.cells[cell]!==slot)invalid();const input=r.inputs[slot++]??invalid();if(input.kind!=='item'||input.slot!==slot-1||input.choices.length!==1)invalid();
      const c=input.choices[0]!;if(c.amount!=='1'||c.consume.kind!=='allocated'||c.returns.length||c.rule.kind!=='wildcard'||c.rule.meta||!c.rule.nbt||items&&!matches(s,items.get(c.id)??invalid(),false))invalid();
    }
    if(slot!==r.inputs.length)invalid();if(items){const result=items.get(p.result.id)??invalid();if(!matches(d.result,result,false)||p.resultTag==='freshRandomUuid'&&result.nbt!=null)invalid();}
    output(r,p,'logisticspipes:solderingInventory',items);
  }
}
export function inventoryProcessNote(p:Alchemy|Soldering,locale:'zh-CN'|'en-US'='zh-CN'):string{
  if(p.kind==='bloodAlchemy')return locale==='en-US'
    ?`Writing-table branch: minimum orb tier ${p.minimumOrb}; signed LP per progress ${p.lpPerProgress}. Each template greedily takes the first remaining physical slot; NBT/count are ignored, template 32767 is wildcard, surplus stock can remain, and earlier matching registrations win. Requires the ordinary alchemy branch (no higher-priority flask modes). Work threshold 100, step 1 or 5. Cost is cached at start; changing valid recipes can retain progress and old cost. LP or output-space failure pauses; invalid recipes reset. A container replaces the entire offered stack. Output merging checks item only and uses the new result metadata/NBT. The result is a conditional prototype.`
    :`炼金台分支：最低宝珠等级 ${p.minimumOrb}，每点进度有符号 LP ${p.lpPerProgress}。每个模板贪心选择首个剩余实际槽，忽略 NBT／数量，模板 32767 为通配，可保留额外材料，较早匹配注册优先。需要进入普通炼金分支，不能触发更高优先级的烧瓶模式。进度门槛 100、步长 1 或 5；费用在开始时缓存，换有效配方可携带进度及旧费用。缺 LP／输出空间暂停，失配归零。有容器时替换整个材料堆。输出合并只比较物品，最终使用新产物的元数据／标签；产物为条件原型。`;
  return locale==='en-US'
    ?`Soldering: absolute 3×3 cells and empty holes, literal metadata including 32767, ignoring count/NBT. Slot 9 accepts any non-null item and loses one on success; no containers return. Heat/work threshold 100. Heating costs 50 energy for +5 heat unless disabled; working still needs adjacent pipe energy, 30/20/10 for 3/2/1 progress per pipe. No work resets; failed output insertion subtracts 50. Native removal scans and mutates all registrations, including earlier nonmatching rows sharing result item/metadata, so depletion is state-dependent. ${p.resultTag==='freshRandomUuid'?'Each attempt creates a fresh UUID tag; this icon is a prototype without an invented UUID.':'The result keeps its prototype tag.'}`
    :`焊接台：固定 3×3 格及必空位置，字面元数据（包括 32767），忽略数量／NBT。槽 9 接受任意非空物品，成功扣一件，无容器返还。热量／工作门槛均为 100；升温每 50 能量加 5 热量，配置可免升温费用，但工作仍需邻接管道按 30／20／10 能量每管推进 3／2／1。没有工作清进度，输出插入失败减 50。原生取料边遍历全部注册边修改库存，结果同物品／元数据的前序不匹配项也可能扣料，用量依赖实际状态。${p.resultTag==='freshRandomUuid'?'每次尝试生成新的 UUID 标签；图标仅为未伪造 UUID 的原型。':'结果保留原型标签。'}`;
}
