import { canonical } from '@elysium/contracts';
import type { ProgramChunk, Recipe } from '@elysium/contracts';
import { Catalog, Fault } from './store.ts';

type Rows<K extends ProgramChunk['data']['kind']> = Extract<ProgramChunk['data'], { kind: K }>['rows'];
interface Program {
  materials: Rows<'fmpMaterials'>; names: Rows<'fmpNames'>; aliases: Rows<'fmpAliases'>;
  saws: Rows<'fmpSaws'>; settings: Rows<'fmpSettings'>;
}
export interface FmpInformation {
  program: string; materialId: number; name: string; block: string; cutterStrength: number; maxSawStrength: number;
  knownNames: string[]; knownNameCount: number; missingAndUnknownUseZero: true; aliases: 'singleHop';
  saws: Rows<'fmpSaws'>;
}
const sections = ['fmpMaterials', 'fmpNames', 'fmpAliases', 'fmpSaws', 'fmpSettings'] as const;
const keys = ['materials', 'names', 'aliases', 'saws', 'settings'] as const;
function ensure(ok: unknown): asserts ok { if (!ok) throw new Fault('invalid_program', 'FMP shared native lookup is incomplete or inconsistent'); }
async function identity(prefix: string, value: unknown): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(value)));
  return prefix + '_' + [...new Uint8Array(hash)].map(value => value.toString(16).padStart(2, '0')).join('');
}
/** Used by the same catalog query online and offline; no material table in recipe rows. */
export async function reconstructFmp(program: string, chunks: readonly ProgramChunk[]): Promise<Program> {
  ensure(/^program_[0-9a-f]{64}$/.test(program) && chunks.length > 0);
  const result: Program = { materials: [], names: [], aliases: [], saws: [], settings: [] };
  const seen = new Set<string>(), identifiers = new Set<string>();
  let bytes = 0;
  for (const section of sections) {
    const rows = chunks.filter(chunk => chunk.data.kind === section).sort((a, b) => a.offset - b.offset);
    ensure(rows.length > 0);
    const target = result[keys[sections.indexOf(section)]!];
    let empty = false;
    for (const chunk of rows) {
      bytes += new TextEncoder().encode(canonical(chunk)).byteLength;
      ensure(bytes <= 32 * 1024 * 1024 && chunk.program === program && chunk.offset === target.length
        && chunk.data.rows.length <= 128 && !empty && !identifiers.has(chunk.id));
      const { id, ...record } = chunk;
      ensure(id === program + '.' + await identity('chunk', record));
      identifiers.add(id); seen.add(section); empty = chunk.data.rows.length === 0;
      // The section discriminant is checked before joining its typed rows.
      (target as unknown[]).push(...chunk.data.rows);
    }
  }
  ensure(identifiers.size === chunks.length && seen.size === 5 && result.settings.length === 1
    && result.materials.length <= 65536 && result.names.length <= 262144 && result.aliases.length <= 262144 && result.saws.length <= 4096);
  const settings = result.settings[0]!;
  ensure(settings.nativeRecipe === 'codechicken.microblock.MicroRecipe' && settings.version === '1.7.2'
    && settings.aliasPolicy === 'singleHop' && settings.missingPolicy === 'idZero' && settings.missingCompoundPolicy === 'readOnlyIdZero');
  ensure(result.materials.every((row, index) => row.id === index)
    && new Set(result.materials.map(row => row.name)).size === result.materials.length
    && result.names.every((row, index) => row.id >= 0 && row.id < result.materials.length && (!index || result.names[index - 1]!.name < row.name))
    && result.aliases.every((row, index) => !index || result.aliases[index - 1]!.name < row.name));
  ensure(await identity('program', { kind: 'fmpMicroblock', rules: result }) === program);
  return result;
}

export class FmpQuery {
  private readonly pending = new Map<string, Promise<{rules:Program;known:Map<number,string[]>}>>();
  private readonly catalog:Pick<Catalog, 'all'|'records'> & Partial<Pick<Catalog, 'program'>>;
  constructor(catalog:Pick<Catalog, 'all'|'records'> & Partial<Pick<Catalog, 'program'>>){this.catalog=catalog;}
  private read(id: string): Promise<{rules:Program;known:Map<number,string[]>}> {
    const previous = this.pending.get(id); if (previous) return previous;
    if (this.pending.size === 2) this.pending.delete(this.pending.keys().next().value!);
    const result = (async () => {
      const rules=await reconstructFmp(id, this.catalog.program ? await this.catalog.program(id)
        : (await this.catalog.all('programs')).filter(row => row.program === id));
      const names=new Map(rules.names.map(row=>[row.name,row.id])),aliases=new Map(rules.aliases.map(row=>[row.name,row.target]));
      const known=new Map<number,string[]>();
      for(const key of [...new Set([...names.keys(),...aliases.keys()])].sort()){
        const material=names.get(aliases.get(key)??key)??0,group=known.get(material)??[];group.push(key);known.set(material,group);
      }return {rules,known};
    })();
    this.pending.set(id, result); void result.catch(() => { if (this.pending.get(id) === result) this.pending.delete(id); });
    return result;
  }
  async information(recipe: Recipe): Promise<FmpInformation> {
    const process = recipe.process; ensure(process?.kind === 'fmpMicroblock');
    const prepared=await this.read(process.program),rules=prepared.rules,material = rules.materials[process.materialId]; ensure(material);
    const known=prepared.known.get(process.materialId)??[];
    const used = new Set(recipe.inputs.flatMap(input => input.choices.filter(choice => choice.consume.kind === 'wear').map(choice => choice.id)));
    const knownNames: string[] = []; let bytes = 0;
    for (const name of known) { bytes += new TextEncoder().encode(name).byteLength; if (knownNames.length === 16 || bytes > 8192) break; knownNames.push(name); }
    // Saws are small scalar policies; the full source remains a single cached program.
    const registries=new Set((await this.catalog.records('items',used)).map(item=>item.registry));
    const saws = rules.saws.filter(saw=>registries.has(saw.registry));
    return { program: process.program, materialId: process.materialId, name: material.name, block: material.block,
      cutterStrength: material.cutterStrength, maxSawStrength: rules.settings[0]!.maxSawStrength,
      knownNames, knownNameCount: known.length, missingAndUnknownUseZero: true, aliases: 'singleHop', saws };
  }
}

/** Strict boundary for compact HTTP/worker summaries, independent of image hydration. */
export function readFmpInformation(value:unknown):FmpInformation[]{
  ensure(Array.isArray(value)&&value.length<=100);
  const int=(v:unknown,min=-2147483648,max=2147483647):v is number=>typeof v==='number'&&Number.isInteger(v)&&v>=min&&v<=max;
  const object=(v:unknown):Record<string,unknown>=>{ensure(v!==null&&typeof v==='object'&&!Array.isArray(v));return v as Record<string,unknown>;};
  const exact=(row:Record<string,unknown>,names:string[])=>ensure(Object.keys(row).length===names.length&&names.every(name=>Object.prototype.hasOwnProperty.call(row,name)));
  return value.map(raw=>{
    const row=object(raw);exact(row,['program','materialId','name','block','cutterStrength','maxSawStrength','knownNames','knownNameCount','missingAndUnknownUseZero','aliases','saws']);
    ensure(typeof row.program==='string'&&/^program_[0-9a-f]{64}$/.test(row.program)&&int(row.materialId,0,65535)
      &&typeof row.name==='string'&&row.name.length<=65535&&typeof row.block==='string'&&/^item_[0-9a-f]{64}$/.test(row.block)
      &&int(row.cutterStrength)&&int(row.maxSawStrength)&&int(row.knownNameCount,0,524288)
      &&Array.isArray(row.knownNames)&&row.knownNames.length<=16&&row.knownNameCount>=row.knownNames.length
      &&row.missingAndUnknownUseZero===true&&row.aliases==='singleHop'&&Array.isArray(row.saws)&&row.saws.length<=4096);
    const knownNames=row.knownNames.map(value=>{ensure(typeof value==='string'&&value.length<=65535);return value;});
    ensure(new TextEncoder().encode(knownNames.join('')).byteLength<=8192);
    const saws=row.saws.map((raw):FmpInformation['saws'][number]=>{const saw=object(raw);exact(saw,['registry','owner','strength','maxStrength','durability','damageable','nbt']);
      ensure(typeof saw.registry==='string'&&typeof saw.owner==='string'&&int(saw.strength)&&saw.strength===saw.maxStrength&&int(saw.durability)
        &&typeof saw.damageable==='boolean'&&(saw.nbt==='freshWhenDamageable'||saw.nbt==='preserve')
        &&(saw.owner==='codechicken.microblock.ItemSaw'&&saw.nbt==='freshWhenDamageable'||saw.owner==='mrtjp.projectred.exploration.ItemGemSaw'&&saw.nbt==='preserve'));
      return {registry:saw.registry,owner:saw.owner,strength:saw.strength,maxStrength:saw.strength,durability:saw.durability,damageable:saw.damageable,nbt:saw.nbt};
    });
    return {program:row.program,materialId:row.materialId,name:row.name,block:row.block,cutterStrength:row.cutterStrength,maxSawStrength:row.maxSawStrength,
      knownNames,knownNameCount:row.knownNameCount,missingAndUnknownUseZero:true,aliases:'singleHop',saws};
  });
}

export function fmpNote(info: FmpInformation, locale: 'zh-CN' | 'en-US' = 'zh-CN'): string {
  return locale === 'en-US'
    ? `Material ${info.name}: one alias hop; missing or unknown material names resolve to native ID 0. Shape and thickness are checked by the selected branch. Saw strength must meet ${info.cutterStrength} or equal the native cached maximum ${info.maxSawStrength}.`
    : `材质 ${info.name}：别名只解析一次；缺失或未知材质名按原生规则归入材质 0。形状与厚度由当前分支检查。锯子强度须达到 ${info.cutterStrength}，或等于原生缓存最大值 ${info.maxSawStrength}。`;
}

export function fmpSawNote(saw:FmpInformation['saws'][number],locale:'zh-CN'|'en-US'='zh-CN'):string{
  if(locale==='en-US')return saw.nbt==='preserve'?'Native gem saw remainder: damage +1; preserve count and NBT.'
    :saw.damageable?'Native saw remainder: one saw, damage +1; discard NBT.':'Native saw remainder: return the offered stack unchanged.';
  return saw.nbt==='preserve'?'原生宝石锯返还：耐久损耗 1，保留数量与 NBT'
    :saw.damageable?'原生锯返还：一把，耐久损耗 1，丢弃 NBT':'原生锯返还：原样保留所给堆叠';
}
