import type { GeneticReferenceRow } from '@elysium/contracts';
import { type Catalog, Fault } from './store.ts';
import type { Related } from './query.ts';

type Row<K extends GeneticReferenceRow['data']['kind']> = Omit<GeneticReferenceRow, 'data'> & {
  data: Extract<GeneticReferenceRow['data'], { kind: K }>;
};
export type QuestDefinition = Row<'questsDefinition'>;
export type QuestDeclaration = Row<'questDeclaration'>;
export interface QuestSearch { query: string; quest: string; item: string; offset: number; limit: number }
export interface QuestPage {
  definition: QuestDefinition | null; rows: QuestDeclaration[];
  total: number; offset: number; limit: number; related: Related;
}
interface Index { definition: QuestDefinition | null; rows: QuestDeclaration[]; terms: string[]; items: Map<string, Set<string>> }

/** Only declared examples and fluid identities are references; typed NBT is opaque. */
export function questReferences(value: unknown): { items: Set<string>; fluids: Set<string> } {
  const items = new Set<string>(), fluids = new Set<string>();
  let visits = 0;
  function walk(value: unknown) {
    if (++visits > 2_000_000) throw new Fault('reference_limit', 'Quest reference traversal exceeds budget');
    if (Array.isArray(value)) { for (const child of value) walk(child); }
    else if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) {
      if (key === 'examples' && Array.isArray(child)) for (const id of child) {
        if (typeof id !== 'string') throw new Fault('invalid_reference', 'Invalid quest specimen identity');
        items.add(id);
      }
      else if (key === 'fluid' && typeof child === 'string') fluids.add(child);
      else if (!['nbt', 'targetNBT'].includes(key)) walk(child);
    }
  }
  walk(value); return { items, fluids };
}

/** HTTP and offline workers share the same native-visibility index and bounded query. */
export class QuestQuery {
  private readonly catalog: Pick<Catalog, 'scan' | 'records'>;
  private pending?: Promise<Index>;
  constructor(catalog: Pick<Catalog, 'scan' | 'records'>) { this.catalog = catalog; }
  private index() { return this.pending ??= this.load().catch(error => { this.pending = undefined; throw error; }); }
  private async load(): Promise<Index> {
    const index: Index = { definition: null, rows: [], terms: [], items: new Map() }; let bytes = 0;
    for await (const row of this.catalog.scan('references')) {
      if (row.data.kind !== 'questsDefinition' && row.data.kind !== 'questDeclaration') continue;
      bytes += JSON.stringify(row).length * 2;
      if (bytes > 64 * 1024 * 1024 || index.rows.length >= 65536)
        throw new Fault('reference_limit', 'Quest declaration index exceeds budget');
      if (row.data.kind === 'questsDefinition') {
        if (index.definition) throw new Fault('invalid_reference', 'Ambiguous native quest definition');
        index.definition = row as QuestDefinition;
      } else index.rows.push(row as QuestDeclaration);
    }
    index.rows.sort((a, b) => a.data.ordinal - b.data.ordinal);
    const def = index.definition;
    if (def) {
      const data = def.data;
      if (!data.ready || data.consuming || data.scope !== 'nativeCurrentPlayerVisibility'
        || data.counts.quests !== index.rows.length || data.visible.length !== index.rows.length
        || index.rows.some((row, i) => row.domain !== def.domain || row.order !== i + 1
          || row.data.ordinal !== i || row.data.questUuid !== data.visible[i]))
        throw new Fault('invalid_reference', 'Native quest visibility/order is incomplete');
    } else if (index.rows.length) throw new Fault('invalid_reference', 'Quest declarations lack a definition');
    let memberships = 0;
    for (const row of index.rows) {
      const quest = row.data;
      index.terms.push(`${quest.questUuid} ${quest.name.value} ${quest.description.value}`.toLowerCase());
      bytes += index.terms[index.terms.length - 1]!.length * 2;
      for (const item of questReferences(quest).items) {
        if (++memberships > 262144) throw new Fault('reference_limit', 'Quest item membership index exceeds budget');
        let quests = index.items.get(item);
        if (!quests) { quests = new Set(); index.items.set(item, quests); }
        quests.add(quest.questUuid);
      }
      if (bytes + memberships * 96 > 64 * 1024 * 1024) throw new Fault('reference_limit', 'Hydrated quest index exceeds memory budget');
    }
    return index;
  }
  async page(search: QuestSearch): Promise<QuestPage> {
    if (search.query.length > 256 || search.quest && !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(search.quest)
      || search.item && !/^item_[a-f0-9]{64}$/.test(search.item)
      || !Number.isSafeInteger(search.offset) || search.offset < 0
      || !Number.isSafeInteger(search.limit) || search.limit < 1 || search.limit > 100)
      throw new Fault('invalid_query', 'Invalid native quest query', 400);
    const index = await this.index(), query = search.query.trim().toLowerCase();
    const matchingItems = search.item ? index.items.get(search.item) : null;
    const filtered = index.rows.filter((row, ordinal) => (!search.quest || row.data.questUuid === search.quest)
      && (!query || index.terms[ordinal]!.includes(query))
      && (!search.item || matchingItems?.has(row.data.questUuid)));
    const rows = filtered.slice(search.offset, search.offset + search.limit);
    if (JSON.stringify(rows).length * 2 > 16 * 1024 * 1024)
      throw new Fault('reference_limit', 'Quest page exceeds response budget');
    const ids = questReferences(rows.map(row => row.data));
    const items = await this.catalog.records('items', ids.items), fluids = await this.catalog.records('fluids', ids.fluids);
    const categories = [];
    if (index.definition) for await (const category of this.catalog.scan('categories'))
      if (category.reference === index.definition.domain) categories.push(category);
    const strings = await this.catalog.records('strings', new Set([
      ...items.flatMap(item => [item.name, ...item.tooltip]), ...fluids.map(fluid => fluid.name), ...categories.map(row => row.name),
    ]));
    const textures = await this.catalog.records('textures', new Set([...items, ...fluids].flatMap(row => row.icon ? [row.icon] : [])));
    const result: QuestPage = { definition: index.definition, rows, total: filtered.length, offset: search.offset, limit: search.limit,
      related: { items, fluids, categories, strings, textures, topics: [] } };
    if (JSON.stringify(result).length * 2 > 16 * 1024 * 1024)
      throw new Fault('reference_limit', 'Hydrated quest page exceeds response budget');
    return result;
  }
}
