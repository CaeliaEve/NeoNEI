import type { Entry, Recipe as ElysiumRecipe, Item as ElysiumItem, Fluid as ElysiumFluid, Texture } from '@elysium/contracts';
import type { Related } from '../../catalog/client.ts';
import { Catalog } from '../../catalog/client.ts';
import {initialRecipes} from '../../catalog/bootstrap.ts';
import {PriorityPool} from '../../browser/priority-pool.ts';
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
const categoryIds=new Map<string,string>();
const bootstraps=new Map<string,{value:RecipeBootstrapPayload;bytes:number}>();
let bootstrapPending=new PriorityPool<RecipeBootstrapPayload>(2);
let bootstrapBytes=0;

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

export async function session(): Promise<Catalog> {
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
  const source = kind === 'item' ? related.items.find(item => item.id === id) : related.fluids.find(fluid => fluid.id === id);
  const text = (id: string) => plain(related.strings.find(s => s.id === id)?.text ?? id);
  const row = source ? { ...source, name: text(source.name), ...('tooltip' in source ? { tooltip: source.tooltip.map(text) } : {}) } : undefined;
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
  const category = related.categories.find(row => row.id === recipe.category);
  const name = plain(related.strings.find(row => row.id === category?.name)?.text ?? category?.name ?? recipe.source.handler);
  const icon = category?.icon?.kind === 'item' ? category.icon : category?.machines.find(row => row.kind === 'item');
  const machine = icon ? related.items.find(row => row.id === icon.id) : undefined;
  const inputs: indexedItemGroup[] = recipe.inputs.map(input => ({
    slotIndex: input.slot,
    isOreDictionary: input.choices.some(choice => choice.rule.kind === 'ore'),
    oreDictName: input.choices.find(choice => choice.rule.kind === 'ore')?.rule.kind === 'ore' ? (input.choices.find(choice => choice.rule.kind === 'ore')!.rule as { name: string }).name : null,
    items: input.choices.filter(choice => input.kind === 'item').map(choice => toIndexedStack(toStack(catalog, related, choice.id, choice.amount, input.kind))),
  }));
  const result: indexedRecipe = {
    id: recipe.id, recipeType: name,
    outputs: recipe.outputs.filter(output => output.kind === 'item').map(output => { const stack = toIndexedStack(toStack(catalog, related, output.id, output.amount || '1', output.kind, Number(output.chance.numerator) / Number(output.chance.denominator))); return output.quantity || output.change ? { ...stack, dynamic: { quantity: output.quantity ?? null, change: output.change ?? null } } : stack; }),
    inputs, fluidInputs: recipe.inputs.filter(input => input.kind === 'fluid').map(input => ({ slotIndex: input.slot, fluids: input.choices.map(choice => ({ fluid: { fluidId: choice.id, modId: namespace(choice.id), internalName: choice.id, localizedName: related.fluids.find(fluid => fluid.id === choice.id)?.name || choice.id, temperature: related.fluids.find(fluid => fluid.id === choice.id)?.temperature || 300 }, amount: Number(choice.amount) || 0, probability: 1 })) })),
    fluidOutputs: recipe.outputs.filter(output => output.kind === 'fluid').map(output => ({ fluid: { fluidId: output.id, modId: namespace(output.id), internalName: output.id, localizedName: related.fluids.find(fluid => fluid.id === output.id)?.name || output.id, temperature: related.fluids.find(fluid => fluid.id === output.id)?.temperature || 300 }, amount: Number(output.amount || 0), probability: Number(output.chance.numerator) / Number(output.chance.denominator) })),
    machineInfo: { machineId: recipe.category, category: recipe.category, machineType: name, iconInfo: recipe.category, shapeless: false, parsedVoltageTier: null, parsedVoltage: null,
      ...(machine ? { machineIcon: { itemId: machine.id, modId: namespace(machine.registry), internalName: machine.registry, localizedName: name, imageFileName: '' } } : {}) },
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

async function recipePage(catalog: Catalog, itemId: string, direction: 'recipes' | 'uses', category = '', offset = 0, limit = 100): Promise<{ recipes: indexedRecipe[]; recipeIds: string[]; total: number }> {
  category=categoryIds.get(catalog.manifest.id+':'+category.replace(/^machine:/,'').split('::')[0])??category;
  const result = await catalog.recipes({ item: itemId, direction, category, query: '', offset, limit: Math.max(1,limit) });
  return { recipes: result.rows.map(recipe => toIndexed(catalog, recipe, result.related)), total: result.total, recipeIds:result.recipeIds };
}

export const elysiumFacade = {
  reset(): void { categoryIds.clear(); bootstraps.clear(); bootstrapPending.close();bootstrapPending=new PriorityPool<RecipeBootstrapPayload>(2); bootstrapBytes=0; for (const catalog of sessionCache.values()) void catalog.then(value => value.close()).catch(() => {}); sessionCache.clear(); itemCache.clear(); recipeCache.clear(); browseCache.clear(); browseInFlight.clear(); groupCache.clear(); inFlight.clear(); },
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
  async getCurrentRecipePage(recipePageId: string, options?: { signal?: AbortSignal }) { const catalog = await session(); const { recipe, related } = await catalog.recipe(recipePageId, options?.signal); return { recipePageId, recipe: toIndexed(catalog, recipe, related), uiPayload: null }; },
  async getBrowserPagePackByIds(params: { itemIds: string[]; slotSize?: number }) {
    const catalog = await session(); const rows = await Promise.all(params.itemIds.map(id => catalog.record('browse', id).catch(() => null)));
    return { data: rows.filter((row): row is Entry => Boolean(row)).map(row => ({ key: row.id, kind: 'item' as const, item: toLegacyItem(catalog, row) })) };
  },
  async searchItemsFast(query: string, limit = 60, options?: { signal?: AbortSignal }): Promise<ItemSearchBasic[]> {
    const catalog = await session(); const result = await catalog.items({ kind: 'all', query, mod: '', group: '', collapsed: true, offset: 0, limit: Math.min(500, limit) }, options?.signal);
    return result.rows.map(row => ({ itemId: row.id, localizedName: plain(row.name), modId: namespace(row.registry) }));
  },
  async getRecipeBootstrap(itemId: string,direction:'recipes'|'uses'='recipes',options:{signal?:AbortSignal;priority?:number}={}): Promise<RecipeBootstrapPayload> {
    options.signal?.throwIfAborted();
    const key=cacheKey({bootstrap:itemId,direction});const cached=bootstraps.get(key);
    if(cached){bootstraps.delete(key);bootstraps.set(key,cached);return cached.value;}
    return bootstrapPending.run(key,async signal=>{
    const catalog = await session();signal.throwIfAborted();
    const [{links,usedIn,producedBy},itemEntry]=await Promise.all([
      initialRecipes(catalog,itemId,direction,signal,options.priority??0),catalog.record('browse',itemId,signal,options.priority??0)]);
    signal.throwIfAborted();
    const item = toLegacyItem(catalog, itemEntry);
    const groups=(result:RecipeResult)=>result.categories.map(row=>{
      const category=result.related.categories.find(c=>c.id===row.id)!;
      const name=plain(result.related.strings.find(s=>s.id===category.name)!.text);
      categoryIds.set(catalog.manifest.id+':'+name,row.id);
      return {type:'machine' as const,name,recipeType:name,recipeCount:row.count,categoryKey:`machine:${name}::`,machineKey:`${name}::`,voltageTier:null};
    });
    const value:RecipeBootstrapPayload={ item, recipeIndex: { usedInRecipes: links.uses, producedByRecipes: links.recipes },
      indexedCrafting:producedBy.rows.map(r=>toIndexed(catalog,r,producedBy.related)),indexedUsage:usedIn.rows.map(r=>toIndexed(catalog,r,usedIn.related)),
      indexedSummary:{itemId,itemName:item.localizedName,machineGroups:[],producedByCategoryGroups:groups(producedBy),usedInCategoryGroups:groups(usedIn),counts:{producedBy:links.recipes.length,usedIn:links.uses.length,machineGroups:producedBy.categories.length+usedIn.categories.length}} };
    const bytes=new TextEncoder().encode(JSON.stringify(value)).byteLength*4;
      if(bytes<=16*1024*1024){while(bootstraps.size&&(bootstrapBytes+bytes>16*1024*1024||bootstraps.size>=24)){const first=bootstraps.keys().next().value!;bootstrapBytes-=bootstraps.get(first)!.bytes;bootstraps.delete(first);}bootstraps.set(key,{value,bytes});bootstrapBytes+=bytes;}return value;
    },options.signal,options.priority??0);
  },
  async getRecipeBootstrapShard(itemId: string) {
    const result={...await this.getRecipeBootstrap(itemId)},catalog=await session();
    const all=async(direction:'uses'|'recipes',total:number)=>{const rows:indexedRecipe[]=[];for(let offset=0;offset<total;offset+=100)rows.push(...(await recipePage(catalog,itemId,direction,'',offset,100)).recipes);return rows;};
    result.indexedCrafting=await all('recipes',result.recipeIndex.producedByRecipes.length);result.indexedUsage=await all('uses',result.recipeIndex.usedInRecipes.length);return result;
  },
  async getRecipeBootstrapProducedByGroup(itemId: string, machineType: string, _voltageTier?: string | null, options?: { offset?: number; limit?: number }) : Promise<RecipeBootstrapMachineGroupPayload> { const result = await recipePage(await session(), itemId, 'recipes', machineType, options?.offset || 0, options?.limit ?? 100); return { itemId, machineType, voltageTier: null, recipeCount: result.total, recipes: result.recipes, recipeIds:result.recipeIds, offset: options?.offset || 0, limit: options?.limit ?? 100, hasMore: (options?.offset || 0) + result.recipes.length < result.total }; },
  async getRecipeBootstrapUsedInGroup(itemId: string, machineType: string, _voltageTier?: string | null, options?: { offset?: number; limit?: number }): Promise<RecipeBootstrapMachineGroupPayload> { const result = await recipePage(await session(), itemId, 'uses', machineType, options?.offset || 0, options?.limit ?? 100); return { itemId, machineType, voltageTier: null, recipeCount: result.total, recipes: result.recipes, recipeIds:result.recipeIds, offset: options?.offset || 0, limit: options?.limit ?? 100, hasMore: (options?.offset || 0) + result.recipes.length < result.total }; },
  async getRecipeBootstrapCategoryGroup(itemId: string, tab: 'usedIn' | 'producedBy', categoryKey: string, options?: { offset?: number; limit?: number }): Promise<RecipeBootstrapCategoryGroupPayload> { const direction = tab === 'usedIn' ? 'uses' : 'recipes'; const result = await recipePage(await session(), itemId, direction, categoryKey, options?.offset || 0, options?.limit ?? 100); return { itemId, categoryKey, tab, recipeCount: result.total, recipes: result.recipes, recipeIds:result.recipeIds, offset: options?.offset || 0, limit: options?.limit ?? 100, hasMore: (options?.offset || 0) + result.recipes.length < result.total }; },
  async getRecipeBootstrapSearch(itemId: string, tab: 'usedIn' | 'producedBy', query: string, options?: { signal?: AbortSignal; }): Promise<{ itemId: string; tab: 'usedIn' | 'producedBy'; query: string; recipeIds: string[]; itemMatches: ItemSearchBasic[] }> { const result = await recipePage(await session(), itemId, tab === 'usedIn' ? 'uses' : 'recipes', '', 0, 100); const needle = query.toLocaleLowerCase(); return { itemId, tab, query, recipeIds: result.recipes.filter(recipe => recipe.id.toLocaleLowerCase().includes(needle)).map(recipe => recipe.id), itemMatches: [] }; },
  async getIndexedRecipesByIds(ids: string[], options?: { signal?: AbortSignal }): Promise<indexedRecipe[]> {
    const catalog = await session();
    const result: indexedRecipe[] = [];
    for (const id of new Set(ids)) {
      const detail = await catalog.recipe(id, options?.signal);
      result.push(toIndexed(catalog, detail.recipe, detail.related));
    }
    return result;
  },
};
