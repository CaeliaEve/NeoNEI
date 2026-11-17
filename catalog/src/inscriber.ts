import type {Item,Recipe} from '@elysium/contracts';
type Process=Extract<NonNullable<Recipe['process']>,{kind:'inscriber'}>;
const handler='appeng.integration.modules.NEIHelpers.NEIInscriberRecipeHandler';
const invalid=():never=>{throw new Error('Invalid native Inscriber plate, rename or consumption semantics');};

/** Retain the native machine boundary even when a structurally valid row strips its process. */
export function validateInscriberRecipe(r:Recipe,items?:ReadonlyMap<string,Item>):void{
  const p=r.process;
  if(p?.kind!=='inscriber'){
    if(r.source.handler===handler||r.inputs.some(i=>i.choices.some(c=>c.rule.kind==='ae')))invalid();
    return;
  }
  if(!['press','inscribe'].includes(p.mode)||r.duration!=null||r.energy!=null||r.grid!=null||r.magic!=null)invalid();
  const required=new Map<number,string|null>([[2,null]]);
  if(p.top!=null){required.set(0,p.top);if(p.bottom!=null)required.set(1,p.bottom);}
  if(r.inputs.length!==required.size||new Set(r.inputs.map(i=>i.slot)).size!==required.size)invalid();
  for(const input of r.inputs){
    const anchor=required.get(input.slot);
    if(input.kind!=='item'||anchor===undefined||input.choices.length===0||input.slot!==2&&input.choices.length!==1)invalid();
    for(const c of input.choices){
      if(c.amount!=='1'||c.returns.length!==0||c.rule.kind!=='ae'||anchor!=null&&c.id!==anchor
        ||c.consume.kind!==(input.slot===2||p.mode==='press'?'consume':'keep'))invalid();
      if(items&&!items.has(c.id))invalid();
    }
  }
  if(items){
    for(const id of [p.top,p.bottom,p.namePress])if(id!=null&&!items.has(id))invalid();
    if(p.top!=null&&p.namePress!=null){
      const name=items.get(p.namePress)!,same=(id:string)=>{const s=items.get(id)??invalid();return s.registry===name.registry&&s.meta===name.meta;};
      if(same(p.top)&&(p.bottom==null||same(p.bottom)))invalid();
    }
  }
  const out=r.outputs[0];
  if(r.outputs.length!==1||out?.kind!=='item'||out.slot!==0||out.role!=='result'||out.quantity!=null||out.change!=null
    ||out.amount==null||!/^\d+$/.test(out.amount)||BigInt(out.amount)<=0n||out.chance.numerator!=='1'||out.chance.denominator!=='1')invalid();
}

export function inscriberNote(p:Process,locale:'zh-CN'|'en-US'='zh-CN'):string{
  if(locale==='en-US')return 'Conditional result: the first matching native registry row wins. '
    +(p.top==null?'At least one plate slot must be empty; the declared bottom plate is not required. ':'Plates may be swapped; a missing second plate requires an empty slot. ')
    +(p.mode==='press'?'Both plate slots and the center slot are cleared. ':'Plates are retained and the center slot is cleared. ')
    +(p.namePress==null?'':'Name presses take priority. ')
    +'Each occupied input slot allows at most one item. Power and output space are required; the task is checked again at output.';
  return '条件产物：由原生注册顺序中第一条匹配配方决定。'
    +(p.top==null?'至少一个模板槽必须为空，注册的下模板不是必需材料。':'模板可以上下互换，缺少第二模板时对应槽必须为空。')
    +(p.mode==='press'?'清空两个模板槽和中间材料槽。':'保留模板，清空中间材料槽。')
    +(p.namePress==null?'':'命名模板优先处理。')
    +'每个非空输入槽最多一件，还需供能与产物空间；输出时重新检查材料。';
}
