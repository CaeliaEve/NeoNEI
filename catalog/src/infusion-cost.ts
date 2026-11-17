import type {Recipe} from '@elysium/contracts';
type Process=Extract<NonNullable<Recipe['process']>,{kind:'nativeInfusion'}>;
type Random=NonNullable<Process['randomAspects']>;
export interface RandomAspectRange {aspect:string;min:number;max:number}
const invalid=():never=>{throw new Error('Invalid native randomized infusion cost');};

/** Inclusive ranges from native nextInt bounds, without sampling or advancing any RNG. */
export function randomInfusionCostRanges(p:Random):RandomAspectRange[]{
  if(p.kind!=='gadomancy'||p.semantics!=='gadomancyRandomCostsV1'||p.refreshMillis!==500||p.bases.length>4096)invalid();
  const seen=new Set<string>();
  return p.bases.map(a=>{
    if(!a.aspect||seen.has(a.aspect)||!/^[1-9][0-9]*$/.test(a.amount)||a.amount.length>10)invalid();
    seen.add(a.aspect);const base=Number(a.amount);
    if(base>2147483647)invalid();
    const bound=p.halfCap?Math.trunc(base/2):base,min=p.halfCap?bound:0;
    if(bound<=0)invalid();
    return {aspect:a.aspect,min,max:min+bound-1};
  });
}
export function randomInfusionCostNote(p:Random,locale:'zh-CN'|'en-US'='zh-CN'):string{
  randomInfusionCostRanges(p);
  return locale==='en-US'
    ? `Gadomancy caches one random aspect-cost table and refreshes it on native access after more than 500 ms. ${p.halfCap?'Each cost is floor(base/2) + nextInt(floor(base/2)).':'Each cost is nextInt(base).'} The inclusive ranges are possibilities, not a fixed price; zero-valued draws are omitted. Exporting this definition does not advance its random source.`
    : `Gadomancy 缓存一张随机要素费用表；间隔超过 500 毫秒后，原生读取会刷新。${p.halfCap?'各项费用为 floor(base/2) + nextInt(floor(base/2))。':'各项费用为 nextInt(base)。'}显示的闭区间为可能费用，并非固定价格；抽到零的项省略。导出规则不推进原生随机源。`;
}
