import { assertTable, canonical } from '@elysium/contracts';
import { hash, fuelItems, validateFuelContainers } from '@neonei/catalog/source';
import type { FuelPage, FuelSearch } from '@neonei/catalog/source';
import { ApiError } from './transport.ts';
export type { FuelPage, FuelSearch } from '@neonei/catalog/source';

const invalid = (): never => { throw new ApiError('invalid_response', '燃料资料缺少原生规则、容器或来源不一致'); };
function positive(value: string) {
  if (!/^[1-9][0-9]*$/.test(value) || value.length > 10 || BigInt(value) > 2147483647n) invalid();
}
export async function readFurnaceFuels(
  read: (path: string, signal?: AbortSignal) => Promise<unknown>, search: FuelSearch, signal?: AbortSignal,
): Promise<FuelPage> {
  const raw = await read('/furnace-fuels?' + new URLSearchParams({ ...search, offset: String(search.offset), limit: String(search.limit) }), signal);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) invalid();
  const page = raw as FuelPage;
  try {
    if (!Array.isArray(page.rows) || page.rows.length > 100 || page.definition === undefined) invalid();
    const leaves = [...(page.definition ? [page.definition] : []), ...page.rows];
    assertTable({ kind: 'references', records: leaves });
    for (const kind of ['items','fluids','categories','strings','textures','topics'] as const)
      assertTable({ kind, records: page.related[kind] });
    for (let start = 0; start < leaves.length; start += 16) {
      const valid = await Promise.all(leaves.slice(start, start + 16).map(async row =>
        row.id === 'refrow_' + await hash(canonical({ domain: row.domain, order: row.order, data: row.data }))));
      if (valid.some(value => !value)) invalid();
    }
    if (!Number.isSafeInteger(page.total) || page.total < 0 || page.offset !== search.offset || page.limit !== search.limit
      || page.rows.length !== Math.max(0, Math.min(page.limit, page.total - page.offset))) invalid();
    if (!page.definition) { if (page.rows.length || page.total || page.related.categories.length) invalid(); return page; }
    const definition = page.definition, def = definition.data, category = page.related.categories[0];
    if (def.kind !== 'furnaceFuelDefinition' || definition.order !== 0 || !def.ready || def.consuming
      || def.source.handler !== 'codechicken.nei.recipe.FuelRecipeHandler' || !def.source.owner || !def.source.key
      || def.scope !== 'nativePanelFuelSamples' || def.unitsPerBurn !== 1 || def.referenceSmeltTicks !== 200
      || def.containerPolicy !== 'exhaustedFuelStack' || def.fuels > 262144 || page.total > def.fuels
      || page.related.categories.length !== 1 || !category || category.reference !== definition.domain
      || canonical(category.source) !== canonical(def.source)) invalid();
    const items = new Map(page.related.items.map(row => [row.id, row])), strings = new Set(page.related.strings.map(row => row.id));
    const textures = new Set(page.related.textures.map(row => row.id));
    if (!strings.has(category.name)) invalid();
    let previous = 0, candidates = 0;
    for (const row of page.rows) {
      if (row.data.kind !== 'furnaceFuel' || row.domain !== definition.domain || row.order <= previous || row.order > def.fuels
        || row.data.burnTicks <= 0 || !row.data.candidates.length || row.data.candidates.length > 4096) invalid();
      previous = row.order; candidates += row.data.candidates.length;
      if (candidates > 262144) invalid();
      for (const candidate of row.data.candidates) { positive(candidate.templateAmount); if (candidate.container) positive(candidate.container.amount); }
      for (const id of fuelItems(row)) {
        const item = items.get(id);
        if (!item || !strings.has(item.name) || item.tooltip.some(id => !strings.has(id)) || item.icon && !textures.has(item.icon)) invalid();
      }
      validateFuelContainers(row,items);
    }
  } catch (error) { if (error instanceof ApiError) throw error; invalid(); }
  return page;
}
