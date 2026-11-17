import type {Item,Recipe} from '@elysium/contracts';
import {nativeNbtEqual} from './native-nbt.ts';
type Process=Extract<NonNullable<Recipe['process']>,{kind:'creativeCoreCrafting'}>;
type Predicate=NonNullable<Process['predicates'][number]>;
type Offered={item:Pick<Item,'registry'|'meta'|'nbt'>;count:number}|null;
const invalid=():never=>{throw new Error('Invalid native CreativeCore stock, predicate or matching law');};
function active(p:Process):number{
  if(p.predicates.length>65536)invalid();
  if(!p.shaped){if(p.height!=null||p.predicates.length>9||p.predicates.some(v=>v==null)||p.matching!=='rowMajorFirstMatchRemoveFirstEqual')invalid();return p.predicates.length;}
  if(p.height==null||p.width<0||p.width>3||p.height<0||p.height>3||p.width*p.height>p.predicates.length||p.matching!=='columnOffsetsUnmirroredThenMirror')invalid();
  return p.width*(p.height??invalid());
}
export function validateCreativeCoreRecipe(r:Recipe):void{
  const p=r.process;if(p?.kind!=='creativeCoreCrafting')return;
  const count=active(p),predicates=p.predicates.slice(0,count).map((v,i)=>v?i:null).filter((v):v is number=>v!=null);
  if(p.version!=='1.5.14-GTNH'||p.consumption!=='workbenchOnePerOccupiedCellThenNativeContainer'
    ||r.source.owner!=='creativecore'||r.source.handler!=='com.creativemd.creativecore.api.nei.NEIRecipeInfoHandler'
    ||r.duration!=null||r.energy!=null||r.magic!=null||Object.keys(r.properties).length!==0
    ||r.inputs.length!==predicates.length||r.outputs.length!==1||r.notes?.length!==1||r.notes[0]!.key!=='creativecore:matching')invalid();
  let slot=0;const cells=p.predicates.slice(0,count).map(v=>v?slot++:null);
  if(p.shaped&&p.width>0&&p.height!>0){if(r.grid?.width!==p.width||r.grid?.height!==p.height||!r.grid?.mirror||JSON.stringify(r.grid.cells)!==JSON.stringify(cells))invalid();}
  else if(r.grid!=null)invalid();
  for(const [index,input]of r.inputs.entries())if(input.kind!=='item'||input.slot!==index||input.choices.length===0
    ||input.choices.some(c=>c.amount!=='1'||c.consume.kind!=='consume'||c.rule.kind!=='creativeCore'||c.rule.input!==predicates[index]))invalid();
  const output=r.outputs[0]!;if(output.kind!=='item'||output.slot!==0||output.role!=='result'||output.amount==null||output.quantity!=null||output.change!=null||output.chance.numerator!=='1'||output.chance.denominator!=='1')invalid();
}
export function creativeCoreAccepts(p:Predicate,offered:Offered):boolean{
  if(!offered||!Number.isInteger(offered.count)||offered.count<-2147483648||offered.count>2147483647||offered.count<p.minimum)return false;
  const item=offered.item;
  switch(p.kind){
    case 'item':return item.registry===p.registry;
    case 'itemstack':return item.registry===p.registry&&item.meta===p.metadata&&(!p.needNBT||nativeNbtEqual(item.nbt,p.nbt));
    case 'ore':return p.selectors.some(s=>s.registry===item.registry&&(s.code===0||s.code===((item.meta+1)&65535)));
    case 'block':case 'material':return p.members.includes(item.registry);
  }
}
function equal(a:Predicate,b:Predicate):boolean{
  if(a.kind!==b.kind||a.minimum!==b.minimum)return false;
  switch(a.kind){
    case 'item':return b.kind==='item'&&a.registry===b.registry;
    case 'itemstack':return b.kind==='itemstack'&&a.registry===b.registry&&a.metadata===b.metadata&&(!b.needNBT||nativeNbtEqual(a.nbt,b.nbt));
    case 'ore':return b.kind==='ore'&&a.name===b.name;
    case 'block':case 'material':return (b.kind==='block'||b.kind==='material')&&JSON.stringify(a.identity)===JSON.stringify(b.identity);
  }
}
/** Physical cell order is explicit. Return removed predicate indices, not merely selected indices. */
export function creativeCoreSelect(p:Process,offered:readonly Offered[]):(number|null)[]|null{
  const count=active(p);if(offered.length!==9)invalid();
  if(!p.shaped){
    const remaining=Array.from({length:count},(_,i)=>i),removed=Array<number|null>(9).fill(null);
    for(let cell=0;cell<9;cell++)if(offered[cell]){
      const selected=remaining.find(i=>creativeCoreAccepts(p.predicates[i]!,offered[cell]!));if(selected==null)return null;
      const at=remaining.findIndex(i=>equal(p.predicates[selected]!,p.predicates[i]!));if(at<0)invalid();
      removed[cell]=remaining.splice(at,1)[0]!;
    }
    return remaining.length===0?removed:null;
  }
  for(let x=0;x<=3-p.width;x++)for(let y=0;y<=3-p.height!;y++)for(const mirror of [false,true]){
    const selected=Array<number|null>(9).fill(null);let valid=true;
    for(let column=0;column<3;column++)for(let row=0;row<3;row++){
      const sx=column-x,sy=row-y,cell=column+row*3;
      const index=sx>=0&&sy>=0&&sx<p.width&&sy<p.height!?(mirror?p.width-sx-1:sx)+sy*p.width:null;
      const predicate=index==null?null:p.predicates[index];
      if(predicate?creativeCoreAccepts(predicate,offered[cell]!):offered[cell]==null)selected[cell]=predicate?index:null;else valid=false;
    }
    if(valid)return selected;
  }
  return null;
}
export function creativeCoreNote(p:Process,locale:'zh-CN'|'en-US'='zh-CN'):string{
  return locale==='en-US'
    ? `Quantity minima are stock thresholds; each occupied workbench cell consumes one item and returns its audited native container. ${p.shaped?'Try column offsets, then row offsets, with original orientation before mirror. Unused source-array tails do not occupy cells.':'Read physical cells row by row. Select the first matching remaining predicate, then remove the first predicate equal to it; those may be different instances. Changing offered order can change whether the recipe matches.'} Metadata 32767 is literal in stack predicates. Ore matching uses the baked Forge index, ignores NBT and retains native 16-bit metadata-key wrapping.`
    : `数量最小值是库存门槛；工作台每个占用格只扣一件，并返还已审查的原生容器。${p.shaped?'依次尝试列偏移、行偏移，每个位置先原形后镜像；源数组中未参与匹配的尾部不占网格。':'按物理格子逐行匹配，选择剩余列表中首个匹配谓词，再删除首个与它相等的谓词；删除的实例可能不同，调整摆放顺序可能改变匹配结果。'}堆叠谓词中的元数据 32767 是字面值。矿辞使用 Forge 烘焙索引，忽略 NBT，并保留原生 16 位元数据键回绕。`;
}
