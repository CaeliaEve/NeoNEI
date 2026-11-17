import type {Item,Recipe} from '@elysium/contracts';
type Process=Extract<NonNullable<Recipe['process']>,{kind:'aeCrafting'}>;
type Offered=Pick<Item,'registry'|'meta'>|null;
const invalid=():never=>{throw new Error('Invalid native AE cell predicate or selection law');};
function cells(p:Process):void{
  if(p.predicates.length<1||p.predicates.length>9||p.predicates.some(group=>group!=null&&(group.length===0||group.length>65536)))invalid();
  if(p.shaped){if(p.width<1||p.width>3||p.height<1||p.height>3||p.predicates.length!==p.width*p.height||p.matching!=='columnOffsetsUnmirroredThenOptionalMirror')invalid();}
  else if(p.width!==0||p.height!==0||p.mirror||p.matching!=='rowMajorFirstRemainingPredicate'||p.predicates.some(group=>group==null))invalid();
}
function accepts(p:Process,index:number,item:Offered):boolean{
  const group=p.predicates[index];
  return group==null?item==null:item!=null&&group.some(s=>s.registry===item.registry&&(s.metadata===32767||s.metadata===item.meta));
}
/** Returns the native predicate index consumed by each physical workbench cell. */
export function aeCraftingSelect(p:Process,offered:readonly Offered[]):(number|null)[]|null{
  cells(p);if(offered.length!==9)invalid();
  if(!p.shaped){
    const remaining=p.predicates.map((_,i)=>i),selected=Array<number|null>(9).fill(null);
    for(let cell=0;cell<9;cell++)if(offered[cell]){
      const at=remaining.findIndex(index=>accepts(p,index,offered[cell]!));
      if(at<0)return null;selected[cell]=remaining.splice(at,1)[0]!;
    }
    return remaining.length===0?selected:null;
  }
  for(let x=0;x<=3-p.width;x++)for(let y=0;y<=3-p.height;y++)for(const mirror of p.mirror?[false,true]:[false]){
    const selected=Array<number|null>(9).fill(null);let matches=true;
    for(let column=0;column<3;column++)for(let row=0;row<3;row++){
      const sx=column-x,sy=row-y,cell=column+row*3;
      const index=sx>=0&&sy>=0&&sx<p.width&&sy<p.height?(mirror?p.width-sx-1:sx)+sy*p.width:null;
      if(index==null||p.predicates[index]==null){if(offered[cell]!=null)matches=false;}
      else if(!accepts(p,index,offered[cell]!))matches=false;else selected[cell]=index;
    }
    if(matches)return selected;
  }
  return null;
}
export function validateAeCraftingRecipe(r:Recipe,items?:ReadonlyMap<string,Item>):void{
  const p=r.process;
  const handlers=['appeng.integration.modules.NEIHelpers.NEIAEShapedRecipeHandler','appeng.integration.modules.NEIHelpers.NEIAEShapelessRecipeHandler','net.p455w0rd.wirelesscraftingterminal.integration.modules.NEIHelpers.NEIAEShapedRecipeHandler'];
  if(p?.kind!=='aeCrafting'){if(handlers.includes(r.source.handler))invalid();return;}
  cells(p);
  const index=handlers.indexOf(r.source.handler);
  const natives=['appeng.recipes.game.ShapedRecipe','appeng.recipes.game.ShapelessRecipe','net.p455w0rd.wirelesscraftingterminal.api.recipes.game.ShapedRecipe'];
  if(index<0||p.nativeRecipe!==natives[index]||p.version!==(index===2?'1.12.7':'rv3-beta-695-GTNH')||r.source.owner!==(index===2?'ae2wct':'appliedenergistics2')||p.shaped!==(index!==1)
    ||p.consumption!=='workbenchOnePerOccupiedCellThenNativeContainer'||r.duration!=null||r.energy!=null||r.magic!=null||Object.keys(r.properties).length!==0)invalid();
  const groups=p.predicates.map((group,index)=>group==null?null:index).filter((index):index is number=>index!=null);
  let slot=0;const layout=p.predicates.map(group=>group==null?null:slot++);
  if(r.inputs.length!==groups.length||r.outputs.length!==1)invalid();
  if(p.shaped){if(r.grid?.width!==p.width||r.grid?.height!==p.height||r.grid?.mirror!==p.mirror||JSON.stringify(r.grid?.cells)!==JSON.stringify(layout))invalid();}
  else if(r.grid!=null)invalid();
  for(const [slot,input]of r.inputs.entries()){
    if(input.kind!=='item'||input.slot!==slot||input.choices.length===0)invalid();
    for(const choice of input.choices){
      if(choice.amount!=='1'||choice.rule.kind!=='wildcard'||!choice.rule.nbt||!['consume','keep','damage','gtTool','nativeContainer'].includes(choice.consume.kind))invalid();
      if(items){
        const item=items.get(choice.id)??invalid(),group=p.predicates[groups[slot]!]!;
        if(!accepts(p,groups[slot]!,item)||!group.some(s=>s.registry===item.registry&&(choice.rule.kind==='wildcard'&&choice.rule.meta?s.metadata===32767:s.metadata===item.meta)))invalid();
      }
    }
    if(items&&p.predicates[groups[slot]!]!.some(s=>!input.choices.some(choice=>{const item=items.get(choice.id)??invalid();return item.registry===s.registry&&(s.metadata===32767||s.metadata===item.meta);})))invalid();
  }
  const out=r.outputs[0]!;if(out.kind!=='item'||out.role!=='result'||out.slot!==0||out.amount==null||out.quantity!=null||out.change!=null||out.chance.numerator!=='1'||out.chance.denominator!=='1')invalid();
}
export function aeCraftingNote(p:Process,locale:'zh-CN'|'en-US'='zh-CN'):string{
  return locale==='en-US'
    ? `${p.shaped?'Checks column offsets, then row offsets; original orientation precedes an allowed mirror. All other cells must be empty.':'Reads physical cells row by row and chooses the first matching remaining predicate. This greedy order can reject a different permutation of the same materials.'} Item type and metadata match literally, with 32767 as a wildcard. Input counts and NBT are ignored. Each occupied workbench cell takes one item; audited container/tool behavior is separate. The shown result requires this native match; earlier workbench registrations may take priority.`
    : `${p.shaped?'依次检查列偏移和行偏移，先原形后允许的镜像；其他格子必须为空。':'逐行读取实际格子，每次选择首个匹配的剩余谓词；这种贪心顺序可能拒绝相同材料的另一种排列。'}按物品与元数据匹配，32767 为通配值，忽略输入数量与 NBT。工作台每个占用格取用一件，已审查的容器与工具行为另计。所示产物需要满足此原生匹配；工作台中较早注册的配方可能优先。`;
}
