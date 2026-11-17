import { canonical } from '@elysium/contracts';
import type { ProgramChunk, Recipe } from '@elysium/contracts';
import { Catalog, Fault } from './store.ts';

type Rows<K extends ProgramChunk['data']['kind']> = Extract<ProgramChunk['data'], { kind: K }>['rows'];
interface Program {
  materials: Rows<'xuMaterials'>; names: Rows<'xuNames'>; aliases: Rows<'xuAliases'>; settings: Rows<'xuSettings'>;
}
export interface XuInformation {
  program: string; materialId: number | null; lookup: 'ready' | 'unused'; knownNames: string[]; knownNameCount: number;
  aliases: 'singleHop'; missingAndUnknownUseZero: true;
}
const sections = ['xuMaterials', 'xuNames', 'xuAliases', 'xuSettings'] as const;
const keys = ['materials', 'names', 'aliases', 'settings'] as const;
function ensure(ok: unknown): asserts ok { if (!ok) throw new Fault('invalid_program', 'XU shared native material lookup is incomplete or inconsistent'); }
const integer = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= -2147483648 && value <= 2147483647;
async function identity(prefix: string, value: unknown): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(value)));
  return prefix + '_' + [...new Uint8Array(hash)].map(value => value.toString(16).padStart(2, '0')).join('');
}
/** The lookup is shared by all template witnesses; only a bounded name summary reaches the UI. */
export async function reconstructXu(program: string, chunks: readonly ProgramChunk[]): Promise<Program> {
  ensure(/^program_[0-9a-f]{64}$/.test(program) && chunks.length > 0);
  const rules: Program = { materials: [], names: [], aliases: [], settings: [] }, ids = new Set<string>();
  let bytes = 0;
  for (const section of sections) {
    const pieces = chunks.filter(chunk => chunk.data.kind === section).sort((a, b) => a.offset - b.offset);
    const target = rules[keys[sections.indexOf(section)]!]; let empty = false;
    ensure(pieces.length > 0);
    for (const piece of pieces) {
      const { id, ...record } = piece;
      const size = new TextEncoder().encode(canonical(piece)).byteLength; bytes += size;
      ensure(size <= 1024 * 1024 && bytes <= 32 * 1024 * 1024 && piece.program === program
        && piece.offset === target.length && piece.data.rows.length <= 128 && !empty && !ids.has(id)
        && id === program + '.' + await identity('chunk', record));
      ids.add(id); empty = piece.data.rows.length === 0; (target as unknown[]).push(...piece.data.rows);
    }
  }
  ensure(ids.size === chunks.length && rules.settings.length === 1 && rules.materials.length <= 65536
    && rules.names.length <= 262144 && rules.aliases.length <= 262144);
  const settings = rules.settings[0]!;
  ensure(settings.nativeRecipe === 'com.rwtema.extrautils.multipart.microblock.RecipeMicroBlocks'
    && settings.version === '1.2.12' && settings.fmpVersion === '1.7.2' && settings.microRegistry.length > 0
    && settings.aliasPolicy === 'singleHop' && settings.missingPolicy === 'idZero'
    && (settings.lookup === 'ready' || settings.lookup === 'unused' && !rules.materials.length && !rules.names.length && !rules.aliases.length));
  ensure(rules.materials.every((row, index) => row.id === index && /^item_[0-9a-f]{64}$/.test(row.block) && row.name.length <= 65535)
    && new Set(rules.materials.map(row => row.name)).size === rules.materials.length
    && rules.names.every((row, index) => integer(row.id) && row.name.length <= 65535 && (!index || rules.names[index - 1]!.name < row.name))
    && rules.aliases.every((row, index) => row.name.length <= 65535 && row.target.length <= 65535 && (!index || rules.aliases[index - 1]!.name < row.name)));
  ensure(await identity('program', { kind: 'xuMicroblock', rules }) === program);
  return rules;
}

export class XuQuery {
  private readonly pending = new Map<string, Promise<{ rules: Program; known: Map<number, string[]> }>>();
  private readonly catalog: Pick<Catalog, 'all'> & Partial<Pick<Catalog, 'program'>>;
  constructor(catalog: Pick<Catalog, 'all'> & Partial<Pick<Catalog, 'program'>>) { this.catalog = catalog; }
  private read(id: string): Promise<{ rules: Program; known: Map<number, string[]> }> {
    const prior = this.pending.get(id); if (prior) return prior;
    if (this.pending.size >= 2) this.pending.delete(this.pending.keys().next().value!);
    const result = (async () => {
      const rules = await reconstructXu(id, this.catalog.program ? await this.catalog.program(id)
        : (await this.catalog.all('programs')).filter(chunk => chunk.program === id));
      const names = new Map(rules.names.map(row => [row.name, row.id])), aliases = new Map(rules.aliases.map(row => [row.name, row.target]));
      const known = new Map<number, string[]>();
      for (const key of [...new Set([...names.keys(), ...aliases.keys()])].sort()) {
        const resolved = names.get(aliases.get(key) ?? key) ?? 0, group = known.get(resolved) ?? [];
        group.push(key); known.set(resolved, group);
      }
      return { rules, known };
    })();
    this.pending.set(id, result); void result.catch(() => { if (this.pending.get(id) === result) this.pending.delete(id); }); return result;
  }
  async information(recipe: Recipe): Promise<XuInformation> {
    const process = recipe.process; ensure(process?.kind === 'xuMicroblock');
    const { rules, known } = await this.read(process.program), names = process.materialId == null ? [] : known.get(process.materialId) ?? [];
    const shown: string[] = []; let bytes = 0;
    for (const name of names) { bytes += new TextEncoder().encode(name).byteLength; if (shown.length === 16 || bytes > 8192) break; shown.push(name); }
    return { program: process.program, materialId: process.materialId ?? null, lookup: rules.settings[0]!.lookup,
      knownNames: shown, knownNameCount: names.length, aliases: 'singleHop', missingAndUnknownUseZero: true };
  }
}

export function readXuInformation(value: unknown): XuInformation[] {
  ensure(Array.isArray(value) && value.length <= 100);
  return value.map(raw => {
    ensure(raw !== null && typeof raw === 'object' && !Array.isArray(raw));
    const row = raw as Record<string, unknown>, fields = ['program', 'materialId', 'lookup', 'knownNames', 'knownNameCount', 'aliases', 'missingAndUnknownUseZero'];
    let materialId: number | null;
    if(row.materialId === null) materialId = null;
    else { ensure(integer(row.materialId) && row.materialId !== 0); materialId = row.materialId; }
    ensure(Object.keys(row).length === fields.length && fields.every(key => Object.prototype.hasOwnProperty.call(row, key))
      && typeof row.program === 'string' && /^program_[0-9a-f]{64}$/.test(row.program)
      && (row.materialId === null || integer(row.materialId) && row.materialId !== 0) && (row.lookup === 'ready' || row.lookup === 'unused')
      && integer(row.knownNameCount) && row.knownNameCount >= 0 && row.knownNameCount <= 524288
      && Array.isArray(row.knownNames) && row.knownNames.length <= 16 && row.knownNames.length <= row.knownNameCount
      && row.aliases === 'singleHop' && row.missingAndUnknownUseZero === true);
    const knownNames = row.knownNames.map(name => { ensure(typeof name === 'string' && name.length <= 65535); return name; });
    ensure(new TextEncoder().encode(knownNames.join('')).byteLength <= 8192
      && (row.lookup === 'ready' || row.materialId === null && row.knownNameCount === 0));
    return { program: row.program, materialId, lookup: row.lookup, knownNames,
      knownNameCount: row.knownNameCount, aliases: 'singleHop', missingAndUnknownUseZero: true };
  });
}

export function xuNote(info: XuInformation, locale: 'zh-CN' | 'en-US' = 'zh-CN'): string {
  return locale === 'en-US' ? info.materialId === null ? 'Literal-only native template; no material lookup is used.'
    : `Native material ID ${info.materialId}: one alias hop; missing or unknown names resolve to ID 0 and cannot satisfy numeric microblock cells.`
    : info.materialId === null ? '纯固定物品模板，不使用材料查找表。'
    : `原生材质编号 ${info.materialId}：别名只解析一次；缺失或未知名称归入编号 0，不能匹配整数微方块槽。`;
}
