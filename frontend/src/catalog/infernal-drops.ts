import {assertTable} from '@elysium/contracts';
import type {InfernalPoolsPage, InfernalSearch} from '@neonei/catalog/source';
import {ApiError} from './transport.ts';
export type {InfernalPoolsPage, InfernalSearch, InfernalTierName} from '@neonei/catalog/source';
const invalid = (): never => { throw new ApiError('invalid_response', '强化生物掉落池缺少完整原生记录'); };

export async function readInfernalPools(read: (path: string, signal?: AbortSignal) => Promise<unknown>, search: InfernalSearch, signal?: AbortSignal): Promise<InfernalPoolsPage> {
  const raw = await read('/infernal-drops?' + new URLSearchParams({tier: search.tier, offset: String(search.offset), limit: String(search.limit)}), signal);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) invalid();
  const page = raw as InfernalPoolsPage;
  if (!Array.isArray(page.rows) || !Array.isArray(page.tiers) || page.tier !== search.tier || page.offset !== search.offset
    || page.limit !== search.limit || !Number.isSafeInteger(page.total) || page.total < 0
    || page.rows.length !== Math.min(search.limit, Math.max(0, page.total - search.offset))) invalid();
  try {
    assertTable({kind: 'references', records: [...(page.definition ? [page.definition] : []), ...page.tiers, ...page.rows]});
    for (const kind of ['items','fluids','categories','strings','textures','topics'] as const)
      assertTable({kind, records: page.related[kind]});
  } catch { invalid(); }
  if (!page.definition) {
    if (page.definition !== null || page.rows.length || page.tiers.length || page.total || page.related.items.length) invalid();
    return page;
  }
  const definition = page.definition;
  if (definition.data.kind !== 'infernalDropsDefinition' || !definition.data.ready || definition.data.consuming
    || definition.data.source.handler !== 'com.kuba6000.mobsinfo.nei.MobHandlerInfernal'
    || definition.data.scope !== 'nativeClientConfiguration' || definition.data.selection !== 'finalModifierCountRepeatedUniformPool'
    || definition.data.quantitySource !== 'loadedPoolStack' || definition.data.enchanting !== 'nativeInfernalPerSelection') invalid();
  const category = page.related.categories[0];
  if (page.related.categories.length !== 1 || !category || category.reference !== definition.domain
    || category.source.handler !== definition.data.source.handler || category.source.owner !== definition.data.source.owner
    || category.source.key !== definition.data.source.key
    || !page.related.strings.some(row => row.id === category.name)) invalid();
  if (!definition.data.enabled) {
    if (page.rows.length || page.tiers.length || page.total || definition.data.entries || definition.data.tiers
      || definition.data.dimensionBlacklist.length || page.related.items.length) invalid();
    return page;
  }
  const names = ['elite', 'ultra', 'inferno'];
  if (definition.data.tiers !== 3 || page.tiers.length !== 3 || page.tiers.some((row, index) => row.data.kind !== 'infernalTier'
    || row.domain !== definition.domain || row.data.tier !== names[index] || row.data.rarity < 1
    || row.data.requestedMinModifiers < 1 || row.data.requestedMaxModifiers < 1)
    || definition.data.entries !== page.tiers.reduce((sum, row) => sum + row.data.entries, 0)) invalid();
  const header = page.tiers.find(row => row.data.tier === search.tier);
  if (!header || page.total !== header.data.entries) invalid();
  const items = new Map(page.related.items.map(item => [item.id, item]));
  const strings = new Set(page.related.strings.map(row => row.id)), textures = new Set(page.related.textures.map(row => row.id));
  for (const [index, row] of page.rows.entries()) {
    if (row.data.kind !== 'infernalPoolItem' || row.domain !== definition.domain || row.data.tier !== search.tier
      || row.data.entry !== search.offset + index || row.order !== header.order + 1 + row.data.entry
      || !/^[1-9][0-9]*$/.test(row.data.amount) || BigInt(row.data.amount) > 2147483647n) invalid();
    const item = items.get(row.data.item);
    if (!item || !strings.has(item.name) || item.tooltip.some(id => !strings.has(id)) || item.icon && !textures.has(item.icon)) invalid();
  }
  return page;
}
