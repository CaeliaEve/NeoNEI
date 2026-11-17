import { assertTable } from '@elysium/contracts';
import type { VillagerPage, VillagerSearch } from '@neonei/catalog/source';
import { ApiError } from './transport.ts';
export type { VillagerPage, VillagerSearch } from '@neonei/catalog/source';

export async function readVillagerTrades(read: (endpoint: string, signal?: AbortSignal) => Promise<unknown>, search: VillagerSearch, signal?: AbortSignal): Promise<VillagerPage> {
  const params = new URLSearchParams({ ...search, offset: String(search.offset), limit: String(search.limit) });
  const raw = await read('/villager-trades?' + params, signal);
  const invalid = (): never => { throw new ApiError('invalid_response', '村民交易响应缺少完整的交易资料'); };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) invalid();
  const page = raw as VillagerPage;
  if (![page.total, page.offset, page.limit].every(Number.isSafeInteger) || page.total < 0 || page.offset !== search.offset || page.limit !== search.limit
    || !Array.isArray(page.rows) || !Array.isArray(page.professions) || page.rows.length > page.limit || page.rows.length > page.total
    || typeof page.domain !== 'string' || page.domain && !/^reference_[a-f0-9]{64}$/.test(page.domain)
    || search.domain && page.domain !== search.domain || !page.related || typeof page.related !== 'object') invalid();
  try {
    assertTable({ kind: 'references', records: [...page.professions, ...page.rows] });
    for (const kind of ['items','fluids','strings','categories','textures','topics'] as const) assertTable({ kind, records: page.related[kind] });
  } catch { invalid(); }
  if (page.professions.some(row => row.domain !== page.domain || row.data.kind !== 'villagerProfession')
    || page.rows.some(row => row.domain !== page.domain || row.data.kind !== 'villagerOffer')
    || (page.domain ? page.professions.length === 0 : page.total !== 0 || page.professions.length !== 0 || page.rows.length !== 0)
    || page.related.categories.some(category => category.reference !== page.domain)) invalid();
  const professions = new Map(page.professions.map(row => [row.data.profession, row.data]));
  if (professions.size !== page.professions.length || page.total > page.professions.reduce((sum, row) => sum + row.data.offers, 0)) invalid();
  const items = new Map(page.related.items.map(item => [item.id, item])), strings = new Set(page.related.strings.map(text => text.id)), textures = new Set(page.related.textures.map(texture => texture.id));
  if (new Set(page.rows.map(row => row.id)).size !== page.rows.length) invalid();
  for (const row of page.rows) {
    const offer = row.data, parent = professions.get(offer.profession);
    if (!parent || offer.offer >= parent.offers || search.profession && offer.profession !== Number(search.profession)) invalid();
    for (const value of [...offer.inputs, offer.output]) {
      const item = items.get(value.item);
      if (!item || !strings.has(item.name) || item.tooltip.some(id => !strings.has(id)) || item.icon && !textures.has(item.icon)) invalid();
    }
    if (search.item) {
      const input = offer.inputs.some(item => item.item === search.item), output = offer.output.item === search.item;
      if (!(search.direction === 'uses' ? input : search.direction === 'recipes' ? output : input || output)) invalid();
    }
  }
  return page;
}
