import {assertTable} from '@elysium/contracts';
import type {DraconicReactorPage} from '@neonei/catalog/source';
import {ApiError} from './transport.ts';
export type {DraconicReactorPage} from '@neonei/catalog/source';
const invalid = (): never => { throw new ApiError('invalid_response', '反应堆资料缺少完整的原生定义或物品'); };
function units(text: string): bigint {
  if (!/^(0|[1-9][0-9]*)$/.test(text) || text.length > 10) invalid();
  const value = BigInt(text); if (value > 2147483647n) invalid(); return value;
}
export async function readDraconicReactor(read: (path: string, signal?: AbortSignal) => Promise<unknown>, signal?: AbortSignal): Promise<DraconicReactorPage> {
  const raw = await read('/draconic-reactor', signal);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) invalid();
  const page = raw as DraconicReactorPage;
  try {
    assertTable({kind: 'references', records: page.definition ? [page.definition] : []});
    for (const kind of ['items','fluids','categories','strings','textures','topics'] as const)
      assertTable({kind, records: page.related[kind]});
  } catch { invalid(); }
  if (!page.definition) {
    if (page.definition !== null || page.related.items.length || page.related.categories.length) invalid();
    return page;
  }
  const row = page.definition, data = row.data;
  if (data.kind !== 'draconicReactorDefinition' || !data.ready || data.consuming || row.order !== 0
    || data.source.handler !== 'com.brandon3055.draconicevolution.integration.nei.ReactorNEIHandler'
    || data.scope !== 'nativeConfiguredReference' || data.manualStackUpgradeThreshold !== 64
    || data.fuels.length !== 3 || data.products.length !== 4) invalid();
  const category = page.related.categories[0];
  if (page.related.categories.length !== 1 || !category || category.reference !== row.domain
    || category.source.handler !== data.source.handler || category.source.owner !== data.source.owner || category.source.key !== data.source.key) invalid();
  const items = new Map(page.related.items.map(item => [item.id, item])), strings = new Set(page.related.strings.map(row => row.id)), textures = new Set(page.related.textures.map(row => row.id));
  if (!strings.has(category.name)) invalid();
  for (const id of [data.core, ...data.fuels.map(row => row.item), ...data.products.map(row => row.item)]) {
    const item = items.get(id);
    if (!item || !strings.has(item.name) || item.tooltip.some(id => !strings.has(id)) || item.icon && !textures.has(item.icon)) invalid();
  }
  const fuelRoles = ['block', 'ingot', 'nugget'], ores = ['blockDraconiumAwakened', 'ingotDraconiumAwakened', 'nuggetDraconiumAwakened'];
  for (const [index, fuel] of data.fuels.entries()) if (fuel.role !== fuelRoles[index] || fuel.ore !== ores[index]
    || units(fuel.units) !== units(data.fuels[2]!.units) * [81n, 9n, 1n][index]!) invalid();
  const productRoles = ['tiny', 'small', 'large', 'full'];
  for (const [index, product] of data.products.entries()) if (product.role !== productRoles[index]
    || units(product.units) !== units(data.products[0]!.units) * [1n, 9n, 81n, 729n][index]!) invalid();
  for (const value of [data.config.outputMultiplier, data.config.fuelUsageMultiplier])
    if (!value || value.length > 64 || !Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 1000000) invalid();
  return page;
}
