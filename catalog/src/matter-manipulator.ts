import type {Item,Nbt,Recipe} from '@elysium/contracts';
import {nativeNbtEqual} from './native-nbt.ts';
type Process=Extract<NonNullable<Recipe['process']>,{kind:'matterManipulatorUpgrade'}>;
type Upgrade=Process['upgrade'];
function invalid(text='Invalid native Matter Manipulator upgrade'):never {throw new Error(text);}
const int=(n:number)=>Number.isInteger(n)&&n>=-2147483648&&n<=2147483647;
const tags=(nbt:Nbt|null|undefined):Readonly<Record<string,Nbt>>=>nbt==null?{}:nbt.type==='compound'?nbt.value:invalid('Matter root is not a compound');
const starts=[0x30,0x660,0x6f0,0x7c0,0x966,0x9e6,0xa66,0xae6,0xb66,0xbe6,0xc66,0xce6,0xd66,0xe50,0xed0,0xf20,0x1040,0x1090,
  0x17e0,0x1810,0x1946,0x19d0,0x1a80,0x1a90,0x1b50,0x1bb0,0x1c40,0x1c50,0xa620,0xa8d0,0xa900,0xa9d0,0xaa50,0xabf0,0xff10];
function javaInt(s:string):number{
  if(!s||s.length>65535)invalid('Invalid Matter BitSet integer');
  const negative=s[0]==='-',offset=negative||s[0]==='+'?1:0;if(offset===s.length)invalid('Invalid Matter BitSet integer');
  let value=0;for(let at=offset;at<s.length;at++){
    const code=s.charCodeAt(at),start=starts.find(first=>code>=first&&code<first+10);
    if(start==null)invalid('Invalid Matter BitSet integer');value=value*10+code-start;
    if(value>2147483647+Number(negative))invalid('Matter BitSet integer overflow');
  }return negative?-value:value;
}
function integer(nbt:Nbt):number{
  if(nbt.type==='byte'||nbt.type==='short'||nbt.type==='int'||nbt.type==='long')return Number(BigInt.asIntN(32,BigInt(nbt.value)));
  if(nbt.type==='string')return javaInt(nbt.value);
  if(nbt.type==='float'||nbt.type==='double'){
    const view=new DataView(new ArrayBuffer(8));let n:number;
    if(nbt.type==='float'){view.setUint32(0,Number.parseInt(nbt.value,16));n=view.getFloat32(0);}
    else{view.setBigUint64(0,BigInt('0x'+nbt.value));n=view.getFloat64(0);}
    return Number.isNaN(n)?0:Math.max(-2147483648,Math.min(2147483647,Math.trunc(n)));
  }return invalid('Matter BitSet expects primitive flags');
}
function bits(nbt:Nbt|null|undefined):boolean[]{
  const raw=tags(nbt).installedUpgrades;if(!raw)return [];
  let result:boolean[];
  if(raw.type==='byte_array')result=Array.from(atob(raw.value),n=>n.charCodeAt(0)!==0);
  else if(raw.type==='int_array')result=raw.value.map(n=>BigInt(n)!==0n);
  else if(raw.type==='list')result=raw.value.map(n=>integer(n)!==0);
  else return invalid('Matter BitSet expects an array, not base64 text');
  if(result.length>65536)invalid('Matter BitSet exceeds state budget');while(result.at(-1)===false)result.pop();return result;
}
const sameUpgrade=(a:Upgrade|null|undefined,b:Upgrade)=>a!=null&&a.ordinal===b.ordinal&&a.name===b.name&&a.id===b.id&&a.bit===b.bit&&a.providesCaps===b.providesCaps;
function lookup(p:Process,metadata:number):Upgrade|null{
  const entry=p.mappings.find(m=>m.metadata===metadata);return (entry?entry.upgrade:p.defaultUpgrade)??null;
}
export function matterManipulatorSelect(p:Process,inventory:readonly (Item|null)[]):{status:'observed'|'unobserved';center:Item;component:Item}|null{
  if(inventory.length>65536)invalid('Matter inventory exceeds state budget');
  const occupied=inventory.filter((i):i is Item=>i!=null);if(occupied.length!==2)return null;
  const center=occupied.find(i=>i.registry===p.manipulator);if(!center)return null;
  const component=occupied.find(i=>i!==center);if(!component||!p.metaItems.includes(component.registry)||!sameUpgrade(lookup(p,component.meta),p.upgrade)
    ||bits(center.nbt)[p.upgrade.bit])return null;
  return {status:p.states.some(s=>s.id===center.id)?'observed':'unobserved',center,component};
}
/** Only recorded native normalizations can produce an exact NBT preview. */
export function matterManipulatorResult(p:Process,input:Item):Nbt|null{
  const state=p.states.find(s=>s.id===input.id);if(!state)return null;
  const flags=bits(state.normalized);if(flags[p.upgrade.bit])invalid('Matter upgrade already installed');
  while(flags.length<=p.upgrade.bit)flags.push(false);flags[p.upgrade.bit]=true;
  const encoded=btoa(flags.map(flag=>String.fromCharCode(Number(flag))).join(''));
  return {type:'compound',value:{...structuredClone(tags(state.normalized)),installedUpgrades:{type:'byte_array',value:encoded}}};
}
function compact(n:number):Nbt{return {type:n>=-128&&n<=127?'byte':n>=-32768&&n<=32767?'short':'int',value:String(n)};}
function scalar(root:Nbt|null|undefined,key:string,fallback:number):number{const value=tags(root)[key];return value?integer(value):fallback;}
function jsonInt(nbt:Nbt,depth=0):number{
  if(depth>48)invalid('Matter version nesting exceeds budget');
  if(nbt.type==='list'&&nbt.value.length===1)return jsonInt(nbt.value[0]!,depth+1);
  if(nbt.type==='int_array'&&nbt.value.length===1)return Number(nbt.value[0]);
  if(nbt.type==='byte_array'){const data=atob(nbt.value);if(data.length!==1)invalid('Matter version array is not singleton');const b=data.charCodeAt(0);return b>127?b-256:b;}
  return integer(nbt);
}
export function validateMatterManipulatorRecipe(r:Recipe,items?:ReadonlyMap<string,Item>):void{
  const p=r.process;
  if(p?.kind!=='matterManipulatorUpgrade'){
    if(r.source.handler==='com.recursive_pineapple.matter_manipulator.client.nei.UpdateRecipeNEIHandler'
      ||r.outputs.some(o=>o.change?.action.kind==='matterManipulator')||r.inputs.some(i=>i.choices.some(c=>c.rule.kind==='matterManipulatorInput'||c.rule.kind==='matterManipulatorUpgrade')))invalid();return;
  }
  if(r.source.handler!=='com.recursive_pineapple.matter_manipulator.client.nei.UpdateRecipeNEIHandler'
    ||p.nativeRecipe!=='com.recursive_pineapple.matter_manipulator.common.items.RecipeInstallUpgrade'||p.version!=='0.0.51-GTNH'||p.codec!=='mm0051GsonV1'
    ||!Number.isInteger(p.tier)||p.tier<0||p.tier>3||r.grid!=null||r.duration!=null||r.energy!=null||r.magic!=null
    ||Object.keys(r.properties).length||r.inputs.length!==2||r.outputs.length!==1||!p.manipulator)invalid();
  const valid=(u:Upgrade)=>p.upgrades.some(n=>sameUpgrade(n,u));
  if(!p.upgrades.length||p.upgrades.length>16||p.upgrades.some((u,i)=>u.ordinal!==i||!u.name||u.name.length>256||!int(u.id)||!int(u.providesCaps)||!Number.isInteger(u.bit)||u.bit<0||u.bit>65535)
    ||new Set(p.upgrades.map(u=>u.bit)).size!==p.upgrades.length||!valid(p.upgrade)||!p.allowed.length||p.allowed.length>16||!p.allowed.some(u=>sameUpgrade(u,p.upgrade))
    ||p.allowed.some((u,i)=>!valid(u)||i>0&&p.allowed[i-1]!.ordinal>=u.ordinal)||!p.metaItems.length||p.metaItems.length>65536
    ||p.metaItems.some((n,i)=>!n||n===p.manipulator||i>0&&p.metaItems[i-1]!>=n)||p.mappings.length>65536
    ||p.mappings.some((m,i)=>!int(m.metadata)||m.upgrade!=null&&!valid(m.upgrade)||i>0&&p.mappings[i-1]!.metadata>=m.metadata)
    ||p.defaultUpgrade!=null&&!valid(p.defaultUpgrade)||p.states.length!==r.inputs[0]!.choices.length||p.states.length>65536)invalid();
  for(const [slot,input]of r.inputs.entries()){
    if(input.kind!=='item'||input.slot!==slot||!input.choices.length)invalid();
    for(const c of input.choices)if(c.amount!=='1'||!['consume','keep','damage','gtTool','nativeContainer'].includes(c.consume.kind)
      ||c.rule.kind!==(slot===0?'matterManipulatorInput':'matterManipulatorUpgrade'))invalid();
  }
  for(const [index,s]of p.states.entries())if(s.id!==r.inputs[0]!.choices[index]!.id||s.normalized.type!=='compound'
    ||!['nativeItemList','registeredItemClass','declaredBitsetWitness'].includes(s.origin))invalid();
  const out=r.outputs[0]!,change=out.change;
  if(out.kind!=='item'||out.slot!==0||out.role!=='result'||out.quantity!=null||out.amount!=='1'||out.chance.numerator!=='1'||out.chance.denominator!=='1'
    ||change?.action.kind!=='matterManipulator'||change.input!==0||change.bindings!=null||change.samples.length!==p.states.length||change.samples[0]?.id!==out.id
    ||change.samples.some(s=>s.amount!=='1'))invalid();
  if(!items)return;
  for(const c of r.inputs[1]!.choices){const item=items.get(c.id)??invalid();if(!p.metaItems.includes(item.registry)||!sameUpgrade(lookup(p,item.meta),p.upgrade))invalid();}
  let size=0;
  for(const [index,state]of p.states.entries()){
    const item=items.get(state.id)??invalid(),flags=bits(item.nbt),normalized=tags(state.normalized);
    const canonicalFlags:Nbt=flags.length?{type:'byte_array',value:btoa(flags.map(flag=>String.fromCharCode(Number(flag))).join(''))}:{type:'list',element:'end',value:[]};
    if(item.registry!==p.manipulator||flags[p.upgrade.bit]||!nativeNbtEqual(normalized.installedUpgrades,canonicalFlags)
      ||['jv','dv','config','charge','installedUpgrades','upgradeProvidedCapabilities'].some(key=>!Object.hasOwn(normalized,key))
      ||normalized.config?.type!=='compound'||Object.keys(normalized).some(k=>!['jv','dv','config','encKey','uplinkAddress','charge','installedUpgrades','upgradeProvidedCapabilities'].includes(k)))invalid();
    size+=new TextEncoder().encode(JSON.stringify(state.normalized)).byteLength;if(size>32*1024*1024)invalid();
    const versionTag=tags(item.nbt).jv,version=versionTag?jsonInt(versionTag):0;let capabilities=scalar(item.nbt,'upgradeProvidedCapabilities',0);
    for(const u of p.upgrades)if(flags[u.bit])capabilities|=u.providesCaps;
    if(!nativeNbtEqual(normalized.jv,compact(version===0?1:version))||!nativeNbtEqual(normalized.dv,compact(scalar(item.nbt,'dv',0)))
      ||!nativeNbtEqual(normalized.upgradeProvidedCapabilities,compact(capabilities)))invalid();
    const sample=change.samples[index]!,result=items.get(sample.id)??invalid();
    if(result.registry!==item.registry||result.meta!==item.meta||!nativeNbtEqual(result.nbt,matterManipulatorResult(p,item)))invalid();
  }
}
export function matterManipulatorNote(p:Process,locale:'zh-CN'|'en-US'='zh-CN'):string{
  return locale==='en-US'
    ?'The native recipe scans the entire crafting inventory and allows two occupied cells, ignoring stack size for matching. A registered MetaItem is looked up by literal metadata, including native null/default mappings; component NBT is ignored. The target upgrade must be allowed for tier '+p.tier+' and absent from the decoded BitSet. Matching may attach an empty compound to an untagged input. The output copies its item, metadata and offered count. Version 0.0.51 then replaces the entire NBT root through its native Gson state codec; it does not preserve unknown root fields. Version migration and capability accumulation happen before the new bit is installed. Recorded native normalization supplies exact state previews; unobserved NBT still requires successful full native decoding and encoding. Generated bitset witnesses do not prove obtainability. Workbench registration priority and audited per-cell container/tool rules remain conditions.'
    :'原生配方检查整个合成库存，只允许两个占用格；匹配时忽略堆叠数量。按已注册 MetaItem 类型和字面元数据查真实映射，保留 null／默认映射语义，忽略材料 NBT。目标升级必须属于等级 '+p.tier+' 的许可表，且尚未写入解码后的位集。原生匹配可能给无标签输入附加空复合标签。产物复制物品、元数据和实际输入数量；0.0.51 再通过原生 Gson 状态编解码重写整个 NBT 根，不保留未知根字段。版本迁移与能力累加发生在新升级位写入之前。精确预览使用已记录的原生规范化结果；未观测 NBT 仍需完整原生解码与编码成功。生成的升级位样本不证明可获得性；仍需满足工作台注册优先级及每格的容器／工具规则。';
}
