import type { GeneticReferenceRow } from '@elysium/contracts';
import { Catalog, Fault } from './store.ts';
import type { Related } from './query.ts';

type Row<K extends GeneticReferenceRow['data']['kind']> = Omit<GeneticReferenceRow, 'data'> & {data: Extract<GeneticReferenceRow['data'], {kind: K}>};
export type InfernalDefinition = Row<'infernalDropsDefinition'>;
export type InfernalTier = Row<'infernalTier'>;
export type InfernalPoolItem = Row<'infernalPoolItem'>;
export type InfernalTierName = 'elite' | 'ultra' | 'inferno';
export interface InfernalSearch { tier: InfernalTierName; offset: number; limit: number }
export interface InfernalPoolsPage extends InfernalSearch {
  definition: InfernalDefinition | null; tiers: InfernalTier[]; rows: InfernalPoolItem[]; total: number; related: Related;
}
const tierNames: InfernalTierName[] = ['elite', 'ultra', 'inferno'];

/** Loaded pools are indexed once; only the requested page's items and textures are hydrated. */
export class InfernalDropsQuery {
  private readonly catalog: Pick<Catalog, 'records' | 'scan'>;
  private pending?: Promise<{definition: InfernalDefinition | null; tiers: InfernalTier[]; pools: Map<InfernalTierName, InfernalPoolItem[]>}>;
  constructor(catalog: Pick<Catalog, 'records' | 'scan'>) { this.catalog = catalog; }
  private index() { return this.pending ??= this.load().catch(error => { this.pending = undefined; throw error; }); }
  private async load() {
    const rows: GeneticReferenceRow[] = [];
    let bytes = 0;
    for await (const row of this.catalog.scan('references')) {
      if (!['infernalDropsDefinition', 'infernalTier', 'infernalPoolItem'].includes(row.data.kind)) continue;
      bytes += JSON.stringify(row).length * 2;
      if (bytes > 64 * 1024 * 1024 || rows.length >= 262148) throw new Fault('reference_limit', 'Infernal pools exceed budget');
      rows.push(row);
    }
    const pools = new Map<InfernalTierName, InfernalPoolItem[]>();
    if (!rows.length) return {definition: null, tiers: [], pools};
    rows.sort((a, b) => a.order - b.order);
    const definition = rows[0] as InfernalDefinition;
    if (definition.data.kind !== 'infernalDropsDefinition' || !definition.data.ready || definition.data.consuming
      || definition.data.source.handler !== 'com.kuba6000.mobsinfo.nei.MobHandlerInfernal'
      || rows.some((row, index) => row.domain !== definition.domain || row.order !== index))
      throw new Fault('invalid_reference', 'Infernal pool origin, readiness or order differs');
    if (!definition.data.enabled) {
      if (rows.length !== 1 || definition.data.tiers || definition.data.entries || definition.data.dimensionBlacklist.length)
        throw new Fault('invalid_reference', 'Disabled infernal handler contains rules');
      return {definition, tiers: [], pools};
    }
    if (definition.data.tiers !== 3 || rows.length !== definition.data.entries + 4)
      throw new Fault('invalid_reference', 'Infernal pools are incomplete');
    const tiers: InfernalTier[] = [];
    let cursor = 1;
    for (const tier of tierNames) {
      const header = rows[cursor++] as InfernalTier | undefined;
      if (!header || header.data.kind !== 'infernalTier' || header.data.tier !== tier || header.data.rarity < 1
        || header.data.requestedMinModifiers < 1 || header.data.requestedMaxModifiers < 1)
        throw new Fault('invalid_reference', 'Infernal tier is absent or invalid');
      tiers.push(header);
      const entries: InfernalPoolItem[] = [];
      for (let entry = 0; entry < header.data.entries; entry++) {
        const row = rows[cursor++] as InfernalPoolItem | undefined;
        if (!row || row.data.kind !== 'infernalPoolItem' || row.data.tier !== tier || row.data.entry !== entry)
          throw new Fault('invalid_reference', 'Infernal pool lost entries');
        entries.push(row);
      }
      pools.set(tier, entries);
    }
    if (cursor !== rows.length) throw new Fault('invalid_reference', 'Infernal pools contain extra records');
    return {definition, tiers, pools};
  }
  async page(search: InfernalSearch): Promise<InfernalPoolsPage> {
    if (!tierNames.includes(search.tier) || !Number.isSafeInteger(search.offset) || search.offset < 0
      || !Number.isSafeInteger(search.limit) || search.limit < 1 || search.limit > 100)
      throw new Fault('invalid_query', 'Invalid infernal pool page', 400);
    const {definition, tiers, pools} = await this.index();
    const all = pools.get(search.tier) ?? [], rows = all.slice(search.offset, search.offset + search.limit);
    const items = await this.catalog.records('items', new Set(rows.map(row => row.data.item)));
    const categories = [];
    if (definition) for await (const category of this.catalog.scan('categories'))
      if (category.reference === definition.domain) categories.push(category);
    const strings = await this.catalog.records('strings', new Set([...categories.map(row => row.name), ...items.flatMap(item => [item.name, ...item.tooltip])]));
    const textures = await this.catalog.records('textures', new Set(items.flatMap(item => item.icon ? [item.icon] : [])));
    return {...search, definition, tiers, rows, total: all.length,
      related: {items, categories, strings, textures, fluids: [], topics: []}};
  }
}
