import type { GeneticReferenceRow, ReferenceData } from '@elysium/contracts';
import { type Catalog, Fault } from './store.ts';
import type { Page, Related } from './query.ts';

export type ProfessionRow = GeneticReferenceRow & { data: Extract<ReferenceData, { kind: 'villagerProfession' }> };
export type OfferRow = GeneticReferenceRow & { data: Extract<ReferenceData, { kind: 'villagerOffer' }> };
export interface VillagerSearch { domain: string; profession: string; item: string; direction: 'all' | 'recipes' | 'uses'; offset: number; limit: number }
export interface VillagerPage extends Page<OfferRow> { domain: string; professions: ProfessionRow[]; related: Related }

export async function villagerTrades(catalog: Pick<Catalog, 'scan' | 'records'>, search: VillagerSearch): Promise<VillagerPage> {
  if (!Number.isSafeInteger(search.offset) || search.offset < 0 || !Number.isSafeInteger(search.limit) || search.limit < 1 || search.limit > 100
    || search.domain && !/^reference_[a-f0-9]{64}$/.test(search.domain)
    || search.item && !/^item_[a-f0-9]{64}$/.test(search.item)
    || search.profession && (!/^(0|-?[1-9][0-9]*)$/.test(search.profession) || Number(search.profession) < -2147483648 || Number(search.profession) > 2147483647)
    || !['all', 'recipes', 'uses'].includes(search.direction)) throw new Fault('invalid_query', 'Invalid villager trade query', 400);
  const definitions: ProfessionRow[] = [];
  for await (const row of catalog.scan('references')) if (row.data.kind === 'villagerProfession') {
    definitions.push(row as ProfessionRow);
    if (definitions.length > 4096) throw new Fault('reference_limit', 'Villager profession catalogue exceeds query budget');
  }
  definitions.sort((a, b) => a.domain.localeCompare(b.domain) || a.order - b.order);
  const domain = search.domain || definitions[0]?.domain || '';
  const professions = definitions.filter(row => row.domain === domain);
  if (search.domain && !professions.length) throw new Fault('not_found', 'Villager trade domain not found', 404);
  if (search.profession && !professions.some(row => row.data.profession === Number(search.profession))) throw new Fault('invalid_query', 'Unknown villager profession', 400);
  // Retain only the requested page; memory use is independent of the offset.
  const selected: OfferRow[] = []; let total = 0;
  // The hash-sorted table gives deterministic pagination; native order sorts within a page.
  for await (const row of catalog.scan('references')) {
    if (row.domain !== domain || row.data.kind !== 'villagerOffer') continue;
    const offer = row.data;
    if (search.profession && offer.profession !== Number(search.profession)) continue;
    if (search.item) {
      const input = offer.inputs.some(item => item.item === search.item), output = offer.output.item === search.item;
      if (!(search.direction === 'uses' ? input : search.direction === 'recipes' ? output : input || output)) continue;
    }
    if (total >= search.offset && selected.length < search.limit) selected.push(row as OfferRow);
    total++;
  }
  selected.sort((a, b) => a.order - b.order);
  const ids = new Set(selected.flatMap(row => [...row.data.inputs.map(item => item.item), row.data.output.item]));
  const items = await catalog.records('items', ids);
  const categoryIds = new Set<string>();
  for await (const category of catalog.scan('categories')) if (domain && category.reference === domain) categoryIds.add(category.id);
  const categories = await catalog.records('categories', categoryIds);
  const strings = await catalog.records('strings', new Set([...items.flatMap(item => [item.name, ...item.tooltip]), ...categories.map(category => category.name)]));
  const textures = await catalog.records('textures', new Set(items.flatMap(item => item.icon ? [item.icon] : [])));
  return { domain, professions, rows: selected, total, offset: search.offset, limit: search.limit,
    related: { items, categories, strings, textures, fluids: [], topics: [] } };
}
