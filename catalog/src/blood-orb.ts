import type {Item,Recipe} from '@elysium/contracts';
type Process=Extract<NonNullable<Recipe['process']>,{kind:'bloodOrbCrafting'}>;
type Predicate=NonNullable<Process['predicates'][number]>;
type Offered=Pick<Item,'registry'|'meta'>|null;
const handlers=['WayofTime.alchemicalWizardry.client.nei.NEIBloodOrbShapedHandler','WayofTime.alchemicalWizardry.client.nei.NEIBloodOrbShapelessHandler'];
const invalid=():never=>{throw new Error('Invalid Blood Orb native workbench process');};
function accepts(p:Process,s:Predicate,item:Offered):boolean{
  if(!item)return false;
  return s.minimumOrb!=null?p.orbs.some(o=>o.registry===item.registry&&o.level>=s.minimumOrb!)
    :s.alternatives.some(a=>a.registry===item.registry&&(a.metadata===32767||a.metadata===item.meta));
}
/** Shaped translation/mirror or physical-first greedy removal with native integer early abort. */
export function bloodOrbSelect(p:Process,offered:readonly Offered[]):number[]|null{
  if(offered.length!==9)invalid();
  if(p.shaped){
    for(let x=0;x<=3-p.width;x++)for(let y=0;y<=3-p.height;y++)for(const mirror of p.mirror?[false,true]:[false]){
      let ok=true;const selected:number[]=[];
      for(let cx=0;cx<3&&ok;cx++)for(let cy=0;cy<3&&ok;cy++){
        const dx=cx-x,dy=cy-y,at=dx>=0&&dy>=0&&dx<p.width&&dy<p.height?(mirror?p.width-1-dx:dx)+dy*p.width:-1;
        const s=at<0?null:p.predicates[at]!,item=offered[cx+cy*3]!;
        if(s?!accepts(p,s,item):item!=null)ok=false;else if(s)selected.push(at);
      }
      if(ok)return selected;
    }return null;
  }
  const remaining=p.predicates.map((_,i)=>i),selected:number[]=[];
  for(const item of offered)if(item){
    let at=-1;
    for(let n=0;n<remaining.length;n++){
      const s=p.predicates[remaining[n]!]??invalid();
      if(s.minimumOrb!=null&&!accepts(p,s,item))return null;
      if(accepts(p,s,item)){at=n;break;}
    }
    if(at<0)return null;selected.push(remaining.splice(at,1)[0]!);
  }
  return remaining.length?null:selected;
}
export function validateBloodOrbRecipe(r:Recipe,items?:ReadonlyMap<string,Item>):void{
  const p=r.process;if(p?.kind!=='bloodOrbCrafting'){if(handlers.includes(r.source.handler))invalid();return;}
  if(p.version!=='1.7.52'||r.source.owner!=='AWWayofTime'||r.source.handler!==handlers[p.shaped?0:1]||p.predicates.length>9||p.orbs.length>4096
    ||r.magic!=null||r.duration!=null||r.energy!=null||Object.keys(r.properties).length||new Set(p.orbs.map(o=>o.registry)).size!==p.orbs.length)invalid();
  if(p.shaped){if(p.width<1||p.height<1||p.width>3||p.height>3||p.predicates.length!==p.width*p.height||r.grid?.width!==p.width||r.grid?.height!==p.height||r.grid?.mirror!==p.mirror)invalid();}
  else if(p.width!==0||p.height!==0||p.mirror||r.grid!=null||p.predicates.some(s=>s==null))invalid();
  let slot=0;for(const [cell,s]of p.predicates.entries()){
    if(!s){if(r.grid?.cells[cell]!=null)invalid();continue;}
    if(s.alternatives.length>65536||(s.minimumOrb!=null?s.alternatives.length!==0:s.alternatives.length===0))invalid();
    if(s.alternatives.some(a=>!a.registry||a.registry.length>512||a.metadata< -1))invalid();
    if(p.shaped&&r.grid?.cells[cell]!==slot)invalid();const input=r.inputs[slot++]??invalid();
    if(input.kind!=='item'||input.slot!==slot-1||!input.choices.length)invalid();
    for(const c of input.choices){if(c.amount!=='1'||!['consume','keep','damage','gtTool','nativeContainer'].includes(c.consume.kind)||c.rule.kind!=='wildcard'||!c.rule.nbt||s.minimumOrb!=null&&!c.rule.meta)invalid();
      if(items){const item=items.get(c.id)??invalid();if(!accepts(p,s,item))invalid();const orb=p.orbs.some(o=>o.registry===item.registry);
        if(orb&&(c.consume.kind!=='keep'||c.returns.length!==0))invalid();
        if(s.minimumOrb==null&&!s.alternatives.some(a=>a.registry===item.registry&&(c.rule.kind==='wildcard'&&c.rule.meta?a.metadata===32767:a.metadata===item.meta)))invalid();
      }
    }
  }
  if(slot!==r.inputs.length||r.outputs.length!==1)invalid();const o=r.outputs[0]!;
  if(o.kind!=='item'||o.slot!==0||o.role!=='result'||o.amount==null||o.change!=null||o.quantity!=null||o.chance.numerator!=='1'||o.chance.denominator!=='1')invalid();
}
export function bloodOrbNote(p:Process,locale:'zh-CN'|'en-US'='zh-CN'):string{
  return locale==='en-US'
    ?`${p.shaped?'Shaped recipe: translates in 3×3 and mirrors only when enabled.':'Shapeless: reads physical slots in order and removes the first matching remaining predicate. An integer tier requirement immediately rejects a non-orb or an insufficient tier, even if later predicates could match.'} Orb requirements retain an orb of at least the registered level. Other predicates compare item and template metadata, with 32767 wildcard, ignoring NBT/count. Overlap is evaluated with the native order. Each occupied cell uses native container/consumption behavior. Earlier workbench registrations may take priority.`
    :`${p.shaped?'有序配方：在 3×3 平移，只按原生设置镜像。':'无序配方：按实际格子顺序移除首个匹配的剩余谓词。遇到整数等级要求时，非宝珠或等级不足会立即失败，不尝试后续可能匹配的材料。'}宝珠要求保留达到最低等级的宝珠；其他谓词只比较物品／模板元数据（32767 通配），忽略 NBT／数量。重叠材料保留原生顺序，每个占用格按原生容器／扣料规则处理；更早工作台注册仍可能优先。`;
}
