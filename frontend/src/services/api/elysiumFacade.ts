import type { Entry, Recipe as ElysiumRecipe, Item as ElysiumItem, Fluid as ElysiumFluid, Texture } from '@elysium/contracts';
import type { Related } from '../../catalog/client.ts';
import { Catalog } from '../../catalog/client.ts';
import type {
  BrowserDefaultCatalogResponse, BrowserGridEntry, BrowserPagePackResponse, BrowserSearchCatalogResponse,
  HomeBootstrapResponse, Item, ItemSearchBasic, Mod, RecipeBootstrapCategoryGroupPayload,
  RecipeBootstrapMachineGroupPayload, RecipeBootstrapPayload, RecipeItem, indexedItem, indexedItemGroup, indexedItemStack, indexedRecipe,
} from '../../runtime/types';

type BrowseResult = Awaited<ReturnType<Catalog['items']>>;
type RecipeResult = Awaited<ReturnType<Catalog['recipes']>>;

const sessionCache = new Map<string, Promise<Catalog>>();
const browseCache = new Map<string, BrowserPagePackResponse>();
const browseInFlight = new Map<string, Promise<BrowserPagePackResponse>>();
const groupCache = new Map<string, Awaited<ReturnType<typeof elysiumFacade.getBrowserGroupItems>>>();
const itemCache = new Map<string, Item>();
const recipeCache = new Map<string, indexedRecipe>();
const inFlight = new Map<string, Promise<unknown>>();
const MAX_CACHE = 256;

function currentId(): string {
  if (typeof window === 'undefined') return '';
  return new URLSearchParams(window.location.search).get('catalog') || '';
}

function cacheKey(params: Record<string, unknown>): string {
  return JSON.stringify([currentId(), typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('offline') === '1', params]);
}

function remember<T>(map: Map<string, T>, key: string, value: T): T {
  map.delete(key); map.set(key, value);
  while (map.size > MAX_CACHE) map.delete(map.keys().next().value!);
  return value;
}

async function session(): Promise<Catalog> {
  const id = currentId();
  const offline = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('offline') === '1';
  const key = `${id || 'current'}:${offline ? 'offline' : 'online'}`;
  let pending = sessionCache.get(key);
  if (!pending) {
    pending = Catalog.open(id, { offline: typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('offline') === '1' });
    sessionCache.set(key, pending);
    pending.catch(() => sessionCache.delete(key));
  }
  return pending;
}

function namespace(registry: string): string {
  const index = registry.indexOf(':');
  return index > 0 ? registry.slice(0, index) : 'unknown';
}

function plain(value: string): string { return value.replace(/§[0-9a-fk-or]/gi, ''); }

function textureRef(catalog: Catalog, textureId: string | null | undefined, textures?: Texture[]): string | null {
  if (!textureId) return null;
  const row = textures?.find(texture => texture.id === textureId);
  const path = row?.frames[0]?.path || catalog.manifest.files.find(file => file.path.includes(textureId))?.path;
  return path ? `/assets/${catalog.manifest.id}/${path}` : null;
}

function toLegacyItem(catalog: Catalog, entry: Entry, texture?: Texture, detail?: ElysiumItem): Item {
  const source = detail;
  const item = {
    itemId: entry.id,
    modId: namespace(entry.registry),
    internalName: entry.registry,
    localizedName: plain(entry.name),
    renderAssetRef: textureRef(catalog, source?.icon || entry.icon, texture ? [texture] : undefined),
    renderHint: null,
    preferredImageUrl: textureRef(catalog, source?.icon || entry.icon, texture ? [texture] : undefined),
    unlocalizedName: entry.registry,
    damage: entry.meta ?? source?.meta ?? 0,
    maxStackSize: source?.stackLimit ?? 64,
    maxDamage: source?.durability ?? 0,
    imageFileName: texture?.frames[0]?.path || null,
    tooltip: [...(source?.tooltip ?? entry.tooltip ?? [])].join('\n'),
    searchTerms: entry.terms,
    browserGroupKey: entry.group ?? null,
    browserGroupLabel: null,
    browserGroupSize: null,
    nbt: source?.nbt ? JSON.stringify(source.nbt) : null,
  } satisfies Item;
  return remember(itemCache, `${catalog.manifest.id}:${entry.id}`, item);
}

function toStack(catalog: Catalog, related: Related, id: string, amount: string, kind: 'item' | 'fluid', probability = 1): RecipeItem {
  const row = kind === 'item' ? related.items.find(item => item.id === id) : related.fluids.find(fluid => fluid.id === id);
  const itemRow = kind === 'item' && row ? row as ElysiumItem : null;
  const fluidRow = kind === 'fluid' && row ? row as ElysiumFluid : null;
  const entry: Entry = itemRow
    ? { id: itemRow.id, kind: 'item', meta: itemRow.meta, name: itemRow.name, registry: itemRow.registry, icon: itemRow.icon, tooltip: itemRow.tooltip, terms: `${itemRow.registry} ${itemRow.name} ${itemRow.tooltip.join(' ')}` }
    : { id, kind, name: fluidRow?.name || id, registry: fluidRow?.registry || id, icon: fluidRow?.icon, tooltip: [], terms: `${fluidRow?.registry || id} ${fluidRow?.name || id}` };
  const item = kind === 'item' ? toLegacyItem(catalog, entry, related.textures.find(texture => texture.id === row?.icon), row as ElysiumItem) : null;
  return {
    itemId: id, count: Number(amount) || 0, localizedName: item?.localizedName || (row as ElysiumFluid | undefined)?.name || id,
    renderAssetRef: item?.renderAssetRef || textureRef(catalog, (row as ElysiumFluid | undefined)?.icon, related.textures),
    renderHint: null, damage: item?.damage ?? 0, probability,
  };
}

function toIndexedStack(value: RecipeItem): indexedItemStack {
  const item: indexedItem = {
    itemId: value.itemId, modId: namespace(value.itemId), internalName: value.itemId,
    localizedName: value.localizedName || value.itemId, damage: value.damage || 0, stackSize: value.count,
    maxStackSize: 64, maxDamage: 0, nbt: value.nbt || null, imageFileName: value.imageFileName || null, tooltip: null,
  };
  return { item, stackSize: value.count, probability: value.probability ?? 1 };
}

function toIndexed(catalog: Catalog, recipe: ElysiumRecipe, related: Related): indexedRecipe {
  const cacheKey = `${catalog.manifest.id}:${recipe.id}`;
  const cached = recipeCache.get(cacheKey);
  if (cached) return cached;
  const inputs: indexedItemGroup[] = recipe.inputs.map(input => ({
    slotIndex: input.slot,
    isOreDictionary: input.choices.some(choice => choice.rule.kind === 'ore'),
    oreDictName: input.choices.find(choice => choice.rule.kind === 'ore')?.rule.kind === 'ore' ? (input.choices.find(choice => choice.rule.kind === 'ore')!.rule as { name: string }).name : null,
    items: input.choices.filter(choice => input.kind === 'item').map(choice => toIndexedStack(toStack(catalog, related, choice.id, choice.amount, input.kind))),
  }));
  const result: indexedRecipe = {
    id: recipe.id, recipeType: recipe.source.handler || recipe.category,
    outputs: recipe.outputs.filter(output => output.kind === 'item').map(output => { const stack = toIndexedStack(toStack(catalog, related, output.id, output.amount || '1', output.kind, Number(output.chance.numerator) / Number(output.chance.denominator))); return output.quantity || output.change ? { ...stack, dynamic: { quantity: output.quantity ?? null, change: output.change ?? null } } : stack; }),
    inputs, fluidInputs: recipe.inputs.filter(input => input.kind === 'fluid').map(input => ({ slotIndex: input.slot, fluids: input.choices.map(choice => ({ fluid: { fluidId: choice.id, modId: namespace(choice.id), internalName: choice.id, localizedName: related.fluids.find(fluid => fluid.id === choice.id)?.name || choice.id, temperature: related.fluids.find(fluid => fluid.id === choice.id)?.temperature || 300 }, amount: Number(choice.amount) || 0, probability: 1 })) })),
    fluidOutputs: recipe.outputs.filter(output => output.kind === 'fluid').map(output => ({ fluid: { fluidId: output.id, modId: namespace(output.id), internalName: output.id, localizedName: related.fluids.find(fluid => fluid.id === output.id)?.name || output.id, temperature: related.fluids.find(fluid => fluid.id === output.id)?.temperature || 300 }, amount: Number(output.amount || 0), probability: Number(output.chance.numerator) / Number(output.chance.denominator) })),
    machineInfo: { machineId: recipe.category, category: recipe.category, machineType: recipe.source.handler, iconInfo: recipe.category, shapeless: false, parsedVoltageTier: null, parsedVoltage: null },
    metadata: { voltageTier: null, voltage: recipe.energy ? Number(recipe.energy) : null, amperage: null, duration: recipe.duration ? Number(recipe.duration) : null, totalEU: null, requiresCleanroom: null, requiresLowGravity: null, additionalInfo: null },
  };
  return remember(recipeCache, cacheKey, result);
}

async function browse(params: { page?: number; pageSize?: number; search?: string; modId?: string; includeHidden?: boolean }): Promise<BrowserPagePackResponse> {
  const normalized = { page: Math.max(1, Math.floor(params.page ?? 1)), pageSize: Math.max(1, Math.min(500, Math.floor(params.pageSize ?? 50))), search: params.search?.trim() || '', modId: params.modId || '' };
  const key = cacheKey(normalized);
  const cached = browseCache.get(key);
  if (cached) return cached;
  const running = browseInFlight.get(key);
  if (running) return running;
  const request = (async () => {
  const catalog = await session();
  const page = normalized.page;
  const pageSize = normalized.pageSize;
  const result = await catalog.items({ kind: 'all', query: normalized.search, mod: normalized.modId, group: '', collapsed: true, offset: (page - 1) * pageSize, limit: pageSize });
  const textures = result.textures;
  const data: BrowserGridEntry[] = result.rows.map(entry => ({ key: entry.id, kind: 'item', item: toLegacyItem(catalog, entry, textures.find(texture => texture.id === entry.icon)) }));
  return { data, total: result.total, page, pageSize, totalPages: Math.max(1, Math.ceil(result.total / pageSize)) };
  })();
  browseInFlight.set(key, request);
  try { const value = await request; remember(browseCache, key, value); return value; } finally { browseInFlight.delete(key); }
}

async function recipePage(catalog: Catalog, itemId: string, direction: 'recipes' | 'uses', category = '', offset = 0, limit = 128): Promise<{ recipes: indexedRecipe[]; total: number }> {
  const result = await catalog.recipes({ item: itemId, direction, category, query: '', offset, limit });
  return { recipes: result.rows.map(recipe => toIndexed(catalog, recipe, result.related)), total: result.total };
}

export const elysiumFacade = {
  reset(): void { for (const catalog of sessionCache.values()) void catalog.then(value => value.close()).catch(() => {}); sessionCache.clear(); itemCache.clear(); recipeCache.clear(); browseCache.clear(); browseInFlight.clear(); groupCache.clear(); inFlight.clear(); },
  async getMods(): Promise<Mod[]> {
    const catalog = await session(); const facets = await catalog.facets();
    return facets.mods.map(mod => ({ modId: mod.id, modName: mod.id, itemCount: mod.count }));
  },
  async getHomeBootstrap(params: { page?: number; pageSize?: number; slotSize?: number; modId?: string }): Promise<HomeBootstrapResponse> {
    const catalog = await session();
    return { manifest: { version: 3, sourceSignature: catalog.manifest.id, compiledAt: null, publishRevision: String(catalog.manifest.revision), publishCompiledAt: null, browserLayoutKey: null }, mods: await this.getMods(), pagePack: await browse(params) };
  },
  async getBrowserPagePack(params: { page?: number; pageSize?: number; search?: string; modId?: string; includeHidden?: boolean; slotSize?: number }): Promise<BrowserPagePackResponse> { return browse(params); },
  async getBrowserDefaultCatalog(params?: { modId?: string; includeHidden?: boolean }): Promise<BrowserDefaultCatalogResponse> { return browse({ ...params, page: 1, pageSize: 500 }); },
  async getBrowserSearchCatalog(params: { search: string; modId?: string; includeHidden?: boolean }): Promise<BrowserSearchCatalogResponse> { return browse({ ...params, page: 1, pageSize: 500 }); },
  async getBrowserGroupItems(groupKey: string, modId?: string, includeHidden = false) { const key = cacheKey({ groupKey, modId: modId || '', includeHidden }); const cached = groupCache.get(key); if (cached) return cached; const catalog = await session(); const result = await catalog.items({ kind: 'all', query: '', mod: modId || '', group: groupKey, collapsed: false, offset: 0, limit: 500 }); const value = { groupKey, total: result.total, items: result.rows.map(row => toLegacyItem(catalog, row, result.textures.find(texture => texture.id === row.icon))) }; remember(groupCache, key, value); return value; },
  async primeDefaultBrowserPagePack(params: { page: number; pageSize: number; slotSize?: number }) { return browse(params); },
  async getBrowserSearchPack() { return { version: 1, total: 0, items: [] }; },
  async getBrowserSearchPackShard(_shardId: string) { return null; },
  async getOptionalRecipeUiPayload(_recipeId: string) { return null; },
  async getRecipeUiPayload(recipeId: string) { return { recipeId, captureKey: recipeId }; },
  async getCurrentRecipePage(recipePageId: string, options?: { signal?: AbortSignal }) { const catalog = await session(); const recipe = await catalog.record('recipes', recipePageId, options?.signal); const related = { items: [], fluids: [], categories: [], views: [], strings: [], textures: [], topics: [], tracks: [] } as Related; return { recipePageId, recipe: toIndexed(catalog, recipe, related), uiPayload: null }; },
  async getBrowserPagePackByIds(params: { itemIds: string[]; slotSize?: number }) {
    const catalog = await session(); const rows = await Promise.all(params.itemIds.map(id => catalog.record('browse', id).catch(() => null)));
    return { data: rows.filter((row): row is Entry => Boolean(row)).map(row => ({ key: row.id, kind: 'item' as const, item: toLegacyItem(catalog, row) })) };
  },
  async searchItemsFast(query: string, limit = 60, options?: { signal?: AbortSignal }): Promise<ItemSearchBasic[]> {
    const catalog = await session(); const result = await catalog.items({ kind: 'all', query, mod: '', group: '', collapsed: true, offset: 0, limit: Math.min(500, limit) }, options?.signal);
    return result.rows.map(row => ({ itemId: row.id, localizedName: plain(row.name), modId: namespace(row.registry) }));
  },
  async getRecipeBootstrap(itemId: string): Promise<RecipeBootstrapPayload> {
    const catalog = await session(); const [usedIn, producedBy] = await Promise.all([recipePage(catalog, itemId, 'uses'), recipePage(catalog, itemId, 'recipes')]);
    const itemEntry = await catalog.record('browse', itemId);
    const item = toLegacyItem(catalog, itemEntry);
    return { item, recipeIndex: { usedInRecipes: usedIn.recipes.map(recipe => recipe.id), producedByRecipes: producedBy.recipes.map(recipe => recipe.id) }, indexedCrafting: producedBy.recipes, indexedUsage: usedIn.recipes, indexedSummary: null };
  },
  async getRecipeBootstrapShard(itemId: string) { return this.getRecipeBootstrap(itemId); },
  async getRecipeBootstrapProducedByGroup(itemId: string, machineType: string, _voltageTier?: string | null, options?: { offset?: number; limit?: number }) : Promise<RecipeBootstrapMachineGroupPayload> { const result = await recipePage(await session(), itemId, 'recipes', machineType, options?.offset || 0, options?.limit || 128); return { itemId, machineType, voltageTier: null, recipeCount: result.total, recipes: result.recipes, offset: options?.offset || 0, limit: options?.limit || 128, hasMore: (options?.offset || 0) + result.recipes.length < result.total }; },
  async getRecipeBootstrapUsedInGroup(itemId: string, machineType: string, _voltageTier?: string | null, options?: { offset?: number; limit?: number }): Promise<RecipeBootstrapMachineGroupPayload> { const result = await recipePage(await session(), itemId, 'uses', machineType, options?.offset || 0, options?.limit || 128); return { itemId, machineType, voltageTier: null, recipeCount: result.total, recipes: result.recipes, offset: options?.offset || 0, limit: options?.limit || 128, hasMore: (options?.offset || 0) + result.recipes.length < result.total }; },
  async getRecipeBootstrapCategoryGroup(itemId: string, tab: 'usedIn' | 'producedBy', categoryKey: string, options?: { offset?: number; limit?: number }): Promise<RecipeBootstrapCategoryGroupPayload> { const direction = tab === 'usedIn' ? 'uses' : 'recipes'; const result = await recipePage(await session(), itemId, direction, categoryKey, options?.offset || 0, options?.limit || 128); return { itemId, categoryKey, tab, recipeCount: result.total, recipes: result.recipes, offset: options?.offset || 0, limit: options?.limit || 128, hasMore: (options?.offset || 0) + result.recipes.length < result.total }; },
  async getRecipeBootstrapSearch(itemId: string, tab: 'usedIn' | 'producedBy', query: string, options?: { signal?: AbortSignal; }): Promise<{ itemId: string; tab: 'usedIn' | 'producedBy'; query: string; recipeIds: string[]; itemMatches: ItemSearchBasic[] }> { const result = await recipePage(await session(), itemId, tab === 'usedIn' ? 'uses' : 'recipes', '', 0, 128); const needle = query.toLocaleLowerCase(); return { itemId, tab, query, recipeIds: result.recipes.filter(recipe => recipe.id.toLocaleLowerCase().includes(needle)).map(recipe => recipe.id), itemMatches: [] }; },
  async getIndexedRecipesByIds(ids: string[], options?: { signal?: AbortSignal }): Promise<indexedRecipe[]> { const catalog = await session(); const result: indexedRecipe[] = []; for (const id of Array.from(new Set(ids))) { if (options?.signal?.aborted) throw new DOMException('Aborted', 'AbortError'); const recipe = await catalog.record('recipes', id, options?.signal); const related = await catalog.recipes({ item: recipe.outputs[0]?.id || recipe.inputs[0]?.choices[0]?.id || '', direction: 'recipes', category: recipe.category, query: recipe.id, offset: 0, limit: 1 }, options?.signal).catch(() => null); if (related?.rows[0]) result.push(toIndexed(catalog, related.rows[0], related.related)); else result.push(toIndexed(catalog, recipe, { items: [], fluids: [], categories: [], views: [], strings: [], textures: [], topics: [], tracks: [] })); } return result; },
};
















