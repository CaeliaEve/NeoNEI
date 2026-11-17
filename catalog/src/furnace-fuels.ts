import type { GeneticReferenceRow, Item, Nbt } from '@elysium/contracts';
import { canonical } from '@elysium/contracts';
import { type Catalog, Fault, hash } from './store.ts';
import type { Related } from './query.ts';

type Row<K extends GeneticReferenceRow['data']['kind']> = Omit<GeneticReferenceRow, 'data'> & {
  data: Extract<GeneticReferenceRow['data'], { kind: K }>;
};
export type FuelDefinition = Row<'furnaceFuelDefinition'>;
export type FurnaceFuel = Row<'furnaceFuel'>;
export interface FuelSearch { query: string; item: string; offset: number; limit: number }
export interface FuelPage { definition: FuelDefinition | null; rows: FurnaceFuel[]; total: number; offset: number; limit: number; related: Related }
interface Index { definition: FuelDefinition | null; rows: FurnaceFuel[]; terms: string[]; items: Map<string, Set<number>> }
export const fuelItems = (row: FurnaceFuel): string[] => row.data.candidates.flatMap(candidate =>
  [candidate.item, ...(candidate.container ? [candidate.container.item] : []),
    ...(candidate.containerRule?.kind === 'railcraftFirestone'
      ? [candidate.containerRule.degradedBase, ...[candidate.containerRule.normalReturn, candidate.containerRule.degradedReturn].flatMap(value => value ? [value.item] : [])]
      : candidate.containerRule ? [candidate.containerRule.returned.item] : [])]);

/** Check the native sample's complete return branches, shared by HTTP and offline clients. */
export function validateFuelContainers(row: FurnaceFuel, items: ReadonlyMap<string, Item>): void {
  const invalid = (): never => { throw new Fault('invalid_reference', 'Native fuel container rule differs'); };
  const compound = (value: Nbt | null | undefined) => value?.type === 'compound' ? value.value : undefined;
  const numericByte = (value: Nbt | undefined): number => {
    if (!value) return 0;
    if (['byte', 'short', 'int', 'long'].includes(value.type)) return Number(BigInt.asIntN(8, BigInt(value.value as string)));
    if (value.type !== 'float' && value.type !== 'double') return 0;
    const view = new DataView(new ArrayBuffer(8));
    let number: number;
    if (value.type === 'float') { view.setUint32(0, parseInt(value.value, 16)); number = view.getFloat32(0); }
    else { view.setBigUint64(0, BigInt('0x' + value.value)); number = view.getFloat64(0); }
    const narrowed = Number.isNaN(number) ? 0 : Math.min(2147483647, Math.max(-2147483648, Math.trunc(number)));
    const integer = number < narrowed ? (narrowed - 1) | 0 : narrowed;
    return integer << 24 >> 24;
  };
  const check = (returned: { item: string; amount: string } | null | undefined, base: Item, meta: number, nbt: Nbt | null | undefined) => {
    const actual = returned && items.get(returned.item);
    if (!actual || returned?.amount !== '1' || actual.registry !== base.registry || actual.meta !== meta || canonical(actual.nbt ?? null) !== canonical(nbt ?? null)) invalid();
  };
  for (const candidate of row.data.candidates) {
    const rule = candidate.containerRule;
    if (!rule) continue;
    const source = items.get(candidate.item) ?? invalid(); if (candidate.container) invalid();
    if (rule.kind === 'bloodMagicLavaCrystal') { check(rule.returned, source, source.meta, source.nbt); continue; }
    if (rule.damageStep !== 1 || rule.sourceMaxDamage !== source.durability
      || !/^(?:NaN|-?Infinity|-?[0-9]+(?:\.[0-9]+)?(?:[Ee][+-]?[0-9]+)?)$/.test(rule.degradationThreshold)) invalid();
    const expected = source.meta / source.durability * 0.0001, actual = Number(rule.degradationThreshold);
    if (!(actual === expected || Number.isNaN(actual) && Number.isNaN(expected))) invalid();
    const tags = compound(source.nbt), unbreakable = numericByte(tags?.Unbreakable) !== 0;
    const normal = source.durability <= 0 || unbreakable ? source.meta : Math.max(0, (source.meta + 1) | 0);
    if (source.durability > 0 && !unbreakable && normal > source.durability) { if (rule.normalReturn) invalid(); }
    else check(rule.normalReturn, source, normal, source.nbt);
    const base = items.get(rule.degradedBase) ?? invalid(); if (base.meta !== 0 || base.nbt != null) invalid();
    let meta = 0, nbt: Nbt | null = null;
    if (rule.stage === 'refined') {
      const name = compound(tags?.display)?.Name;
      if (name?.type === 'string') nbt = { type: 'compound', value: { display: { type: 'compound', value: { Name: name } } } };
      const empty = Math.max(0, (base.durability - 1) | 0);
      meta = base.durability > 0 ? Math.max(0, (empty + 1) | 0) : empty;
    }
    check(rule.degradedReturn, base, meta, nbt);
  }
}

/** Bounded native ordering and shared HTTP/offline queries; no smelting demonstration recipe. */
export class FurnaceFuelQuery {
  private readonly catalog: Pick<Catalog, 'scan' | 'records'>;
  private pending?: Promise<Index>;
  constructor(catalog: Pick<Catalog, 'scan' | 'records'>) { this.catalog = catalog; }
  private index() { return this.pending ??= this.load().catch(error => { this.pending = undefined; throw error; }); }
  private async load(): Promise<Index> {
    let definition: FuelDefinition | null = null, bytes = 0, candidates = 0;
    const rows: FurnaceFuel[] = [];
    const account = (value: unknown) => {
      bytes += JSON.stringify(value).length * 2;
      if (bytes > 64 * 1024 * 1024) throw new Fault('reference_limit', 'Native fuel index exceeds byte budget');
    };
    for await (const row of this.catalog.scan('references')) {
      if (row.data.kind === 'furnaceFuelDefinition') {
        if (definition) throw new Fault('invalid_reference', 'Ambiguous native fuel definition');
        definition = { ...row, data: row.data }; account(row);
      } else if (row.data.kind === 'furnaceFuel') {
        rows.push({ ...row, data: row.data }); account(row);
        candidates += row.data.candidates.length;
        if (rows.length > 262144 || candidates > 262144) throw new Fault('reference_limit', 'Native fuel traversal budget exceeded');
      }
    }
    const items = new Map<string, Set<number>>();
    if (!definition) {
      if (rows.length) throw new Fault('invalid_reference', 'Native fuel definition missing');
      return { definition, rows, terms: [], items };
    }
    rows.sort((a, b) => a.order - b.order);
    const def = definition.data;
    if (definition.order !== 0 || !def.ready || def.consuming || def.source.handler !== 'codechicken.nei.recipe.FuelRecipeHandler'
      || def.scope !== 'nativePanelFuelSamples' || def.unitsPerBurn !== 1 || def.referenceSmeltTicks !== 200
      || def.containerPolicy !== 'exhaustedFuelStack' || rows.length !== def.fuels
      || rows.some((row, i) => row.domain !== definition!.domain || row.order !== i + 1 || row.data.burnTicks <= 0
        || !row.data.candidates.length || row.data.candidates.length > 4096))
      throw new Fault('invalid_reference', 'Incomplete native fuel table or furnace policy');
    if (definition.domain !== 'reference_' + await hash(canonical({ kind: 'furnaceFuels', records: [def, ...rows.map(row => row.data)] })))
      throw new Fault('invalid_reference', 'Native fuel table identity differs');
    for (const [index, row] of rows.entries()) for (const id of fuelItems(row)) {
      let members = items.get(id); if (!members) { members = new Set(); items.set(id, members); } members.add(index);
    }
    const names = new Map<string, { registry: string; meta: number; name: string }>(), texts = new Map<string, string>();
    for await (const item of this.catalog.scan('items')) if (items.has(item.id)) {
      const value = { registry: item.registry, meta: item.meta, name: item.name }; names.set(item.id, value); account(value);
    }
    if (names.size !== items.size) throw new Fault('invalid_reference', 'Native fuel item fact absent');
    const needed = new Set([...names.values()].map(value => value.name));
    for await (const text of this.catalog.scan('strings')) if (needed.has(text.id)) { texts.set(text.id, text.text); account(text.text); }
    if (texts.size !== needed.size) throw new Fault('invalid_reference', 'Native fuel name text absent');
    const terms = rows.map(row => fuelItems(row).map(id => {
      const item = names.get(id)!; return item.registry + ' ' + item.meta + ' ' + texts.get(item.name);
    }).join(' ').toLocaleLowerCase());
    for (const term of terms) account(term);
    return { definition, rows, terms, items };
  }
  async page(search: FuelSearch): Promise<FuelPage> {
    if (!Number.isSafeInteger(search.offset) || search.offset < 0 || !Number.isSafeInteger(search.limit)
      || search.limit < 1 || search.limit > 100 || search.query.length > 256 || search.item.length > 256)
      throw new Fault('invalid_query', 'Invalid native fuel query', 400);
    const index = await this.index(), term = search.query.trim().toLocaleLowerCase(), members = index.items.get(search.item);
    const selected = index.rows.filter((_, i) => (!search.item || members?.has(i)) && (!term || index.terms[i]!.includes(term)));
    const rows = selected.slice(search.offset, search.offset + search.limit);
    const items = await this.catalog.records('items', new Set(rows.flatMap(fuelItems))), categories = [];
    const facts = new Map(items.map(item => [item.id, item]));
    for (const row of rows) validateFuelContainers(row, facts);
    if (index.definition) for await (const category of this.catalog.scan('categories'))
      if (category.reference === index.definition.domain) categories.push(category);
    const strings = await this.catalog.records('strings', new Set([...items.flatMap(item => [item.name, ...item.tooltip]), ...categories.map(row => row.name)]));
    const textures = await this.catalog.records('textures', new Set(items.flatMap(item => item.icon ? [item.icon] : [])));
    const page = { definition: index.definition, rows, total: selected.length, offset: search.offset, limit: search.limit,
      related: { items, strings, textures, categories, fluids: [], topics: [] } };
    if (JSON.stringify(page).length * 2 > 16 * 1024 * 1024) throw new Fault('reference_limit', 'Native fuel page exceeds byte budget');
    return page;
  }
}
