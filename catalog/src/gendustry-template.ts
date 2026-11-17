import type {Item,Recipe} from '@elysium/contracts';

const handler='net.bdew.gendustry.nei.TemplateCraftingHandler';
const invalid=():never=>{throw new Error('Invalid native Gendustry template matching or container returns');};

/** GeneRecipe has a dynamic sample count; its blank role examples are not successful crafts. */
export function validateGendustryTemplateRecipe(r:Recipe,items?:ReadonlyMap<string,Item>):void{
  const p=r.process;
  if(p?.kind!=='gendustryTemplate'){
    if(r.source.handler===handler)invalid();
    return;
  }
  if(r.source.handler!==handler||p.operation!=='merge'||p.minimumSamples!==1||p.maximumSamples!==8
    ||p.scanOrder!=='columnMajor'||r.grid!=null||r.duration!=null||r.energy!=null||r.magic!=null
    ||p.samples.length<1||p.samples.length>8||new Set([p.template,...p.samples]).size!==p.samples.length+1
    ||r.inputs.length!==p.samples.length+1||new Set(r.inputs.map(i=>i.slot)).size!==r.inputs.length)invalid();
  if(p.roots.some(root=>root.mutations.some(mutation=>mutation.conditions.length!==0)))invalid();
  const roles=new Set([p.template,...p.samples]);
  let templateId:string|null=null;
  for(const input of r.inputs){
    if(input.kind!=='item'||!roles.has(input.slot)||input.choices.length!==1)invalid();
    const c=input.choices[0]!;
    if(c.amount!=='1'||c.consume.kind!=='consume'||c.rule.kind!=='wildcard'||!c.rule.meta||!c.rule.nbt)invalid();
    const template=input.slot===p.template;
    if(template){templateId=c.id;if(c.returns.length!==0)invalid();}
    else if(c.returns.length!==1||c.returns[0]!.kind!=='item'||c.returns[0]!.amount!=='1')invalid();
    if(items){
      const item=items.get(c.id)??invalid();
      if(item.registry!==(template?'gendustry:GeneTemplate':'gendustry:GeneSample')||item.meta!==0||item.nbt!=null)invalid();
      if(!template){
        const blank=items.get(c.returns[0]!.id)??invalid();
        if(blank.registry!=='gendustry:GeneSampleBlank'||blank.meta!==0||blank.nbt!=null)invalid();
      }
    }
  }
  const output=r.outputs[0],change=output?.change;
  if(r.outputs.length!==1||output?.kind!=='item'||output.slot!==0||output.role!=='result'
    ||output.id!==templateId||output.amount!=='1'||output.quantity!=null
    ||output.chance.numerator!=='1'||output.chance.denominator!=='1'
    ||change?.input!==p.template||change.action.kind!=='gendustryGeneTemplate'||change.action.operation!=='merge'
    ||change.action.slots.template!==p.template||Object.keys(change.action.slots).length!==1
    ||change.samples.length!==(change.bindings?.length??0))invalid();
}

export function gendustryTemplateNote(locale:'zh-CN'|'en-US'='zh-CN'):string{
  return locale==='en-US'
    ? 'Conditional gene template result: one template and 1–8 compatible tagged samples. Columns are scanned before rows; the last sample for a chromosome replaces earlier samples. The result copies the offered template count, metadata and other tags. Each occupied slot consumes one item and each sample returns one blank container. Blank role examples do not prove a successful craft or a fixed two-sample material cost.'
    : '条件基因模板产物：一个模板与 1～8 个同根、带有效标签的样本。按列再按行扫描，同染色体最后一个样本覆盖先前样本；复制投入模板的数量、元数据与其他标签。每个占用格消耗一件，每份样本返还一个空容器。空样本只说明物品角色，不代表成功合成或固定两份样本用量。';
}
