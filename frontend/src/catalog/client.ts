import { assertTable } from '@elysium/contracts';
import {readFmpInformation} from '../../../catalog/src/fmp.ts';
import {readXuInformation} from '../../../catalog/src/xu-microblock.ts';
import type {NativePoolOptions,NativePoolPreview} from '../../../catalog/src/botania-pool.ts';
import type {RecipeSelectionRequest,RecipeSelectionResult} from '../../../catalog/src/recipe-evaluation.ts';
import type { Category, Fluid, Item, Recipe, Table, Texture, Topic } from '@elysium/contracts';
import type { CatalogManifest as Manifest } from '@neonei/catalog/source';
import { checkManifest, limits } from '@neonei/catalog/source';
import type { Page, Related, Items, Recipes, Detail, StructureDetail, AspectDetail, ResearchDetail, ItemAspects,
  Topics, MaterialDetail, CircuitDetail, SpeciesDetail, Mutations, MutationSearch, TopicSearch, Facets, Browse, Search } from '@neonei/catalog/source';
import { Atlas } from './atlas.ts';
import {bindInventoryVisuals} from './inventory-visual.ts';
import {bindPublishedAnimations} from '../browser/published-animations.ts';
import { ApiError, body, networkError, request } from './transport.ts';
import { readGeneticReferences, type ReferenceSearch, type GeneticReferencePage } from './references.ts';
import { readCropsNh, type CropsNhSearch, type CropsNhPage } from './cropsnh.ts';
export type { CropsNhSearch, CropsNhPage } from './cropsnh.ts';
import { readToolMaterials, type ToolMaterialSearch, type ToolMaterialPage } from './tool-materials.ts';
import { readVillagerTrades, type VillagerSearch, type VillagerPage } from './villager-trades.ts';
import { readItemAspectSources, type ItemAspectSources } from './item-aspects.ts';
import { readLexicon, type LexiconSearch, type LexiconPage } from './lexicon.ts';
import { readMobs, readMobDrops, type MobSearch, type MobIndex, type MobDropsPage } from './mob-drops.ts';
import { readInfernalPools, type InfernalSearch, type InfernalPoolsPage } from './infernal-drops.ts';
import { readDraconicReactor, type DraconicReactorPage } from './draconic-reactor.ts';
import { readBeeTree, type BeeTreePage, type BeeTreeSearch } from './bee-tree.ts';
import { readUndergroundFluids, type UndergroundPage, type UndergroundSearch } from './underground-fluids.ts';
import { readGtMinerals, type GtMineralPage, type GtMineralSearch } from './gt-minerals.ts';
import { readBartworksOres, type BartworksPage, type BartworksSearch } from './bartworks-ores.ts';
import { readQuests, type QuestPage, type QuestSearch } from './quests.ts';
import { readFireworks, type FireworkPage, type FireworkSearch } from './fireworks.ts';
import { readLathe, type LathePage, type LatheSearch } from './lathe.ts';
import { readForestryInfo,type ForestryPage,type ForestrySearch } from './forestry-info.ts';
import {readInformation,type InformationPage,type InformationSearch} from './information.ts';
import {readUsageQueries,type UsagePage,type UsageSearch} from './usage-queries.ts';
import {readDiagrams,type DiagramPage,type DiagramSearch} from './diagrams.ts';
import {readEnderStorage,type EnderPage,type EnderSearch} from './ender-storage.ts';
import {readForgeRegistry,type ForgePage,type ForgeSearch} from './forge-registry.ts';
import {readProjectBlue,type ProjectBluePage,type ProjectBlueSearch} from './projectblue.ts';
import { readFurnaceFuels, type FuelPage, type FuelSearch } from './furnace-fuels.ts';
import { Local } from '../offline/client.ts';
import {Interaction} from '../browser/interaction.ts';
import type { Shape } from '@elysium/contracts';
import {requireLanguage,gameLanguage,type Language,t} from '../i18n/index.ts';
import type { BuildDetail, ModelPage, StructureComponents } from '@neonei/catalog/source';
export type { BuildDetail, ModelPage, StructureComponents } from '@neonei/catalog/source';
import type { OreGroupDetail, OreMembers } from '@neonei/catalog/source';
export type { OreGroupDetail, OreMembers } from '@neonei/catalog/source';

export { ApiError } from './transport.ts';
export type { Page, Related, Items, Recipes, Detail, StructureDetail, AspectDetail, ResearchDetail, ItemAspects,
  Topics, MaterialDetail, CircuitDetail, SpeciesDetail, Mutations, MutationSearch, TopicSearch, Facets, Browse, Search } from '@neonei/catalog/source';
type Rows = { [T in Table as T['kind']]: T['records'][number] };
export interface OpenOptions { signal?: AbortSignal; base?: string; offline?: boolean; language?: Language }

/** Related indexes belong to a response, not to each recipe or family validator. */
async function validateRecipeFacts(recipes:readonly Recipe[],related?:Related):Promise<void>{
  if(!recipes.length)return;
  const {validateRecipe}=await import('../../../catalog/src/recipe-validation.ts');
  const items=related&&new Map(related.items.map(item=>[item.id,item]));
  const fluids=related&&new Map(related.fluids.map(fluid=>[fluid.id,fluid]));
  for(const recipe of recipes) validateRecipe(recipe,items,fluids);
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError('invalid_response', '接口返回的数据结构不正确');
  return value as Record<string, unknown>;
}

function integer(value: unknown, minimum = 0): asserts value is number {
  if (!Number.isSafeInteger(value) || Number(value) < minimum) throw new ApiError('invalid_response', '接口返回了无效的分页或计数');
}

function table<K extends Table['kind']>(kind: K, records: unknown): Rows[K][] {
  try {
    const table:unknown={kind,records};assertTable(table);
  }
  catch { throw new ApiError('invalid_response', '接口返回的数据不符合当前契约：' + kind); }
  return records as Rows[K][];
}

function page<K extends Table['kind']>(value: unknown, kind: K): Page<Rows[K]> {
  const data = object(value);
  integer(data.total); integer(data.offset); integer(data.limit, 1);
  const rows = table(kind, data.rows);
  if (rows.length > data.limit || rows.length > data.total) throw new ApiError('invalid_response', '分页条目与计数不一致');
  return { rows, total: data.total, offset: data.offset, limit: data.limit };
}

function related(value: unknown): Related {
  const data = object(value);
  return { items: table('items', data.items), fluids: table('fluids', data.fluids), categories: table('categories', data.categories),
    strings: table('strings', data.strings), textures: table('textures', data.textures), topics: table('topics', data.topics),
    ...(data.fmp===undefined?{}:{fmp:readFmpInformation(data.fmp)}), ...(data.xu===undefined?{}:{xu:readXuInformation(data.xu)}) };
}

/** One immutable snapshot owns every request and texture used by a page session. */
export class Catalog extends EventTarget {
  private releaseInventoryVisuals:()=>void=()=>{};
  private releasePublishedAnimations:()=>void=()=>{};
  readonly manifest: Manifest;
  readonly atlas: Atlas;
  locale: Language | null = null;
  private readonly base: string;
  private readonly origin: string;
  private readonly controller = new AbortController();
  private local: Local | null;
  private openingLocal: Promise<Local> | null = null;
  private readonly recordCache = new Map<string, { row: unknown; bytes: number }>();
  private recordCacheBytes = 0;
  private readonly details=new Map<string,{detail:Detail;bytes:number}>();
  private detailBytes=0;
  private interaction:Interaction|null=null;
  private rememberDetail(detail:Detail):void {
    const id=detail.recipe.id,bytes=new TextEncoder().encode(JSON.stringify(detail)).byteLength*4;
    const old=this.details.get(id);if(old){this.detailBytes-=old.bytes;this.details.delete(id);}
    if(bytes>32*1024*1024)return;
    while(this.details.size&&(this.detailBytes+bytes>32*1024*1024||this.details.size>=24)){
      const first=this.details.keys().next().value!;this.detailBytes-=this.details.get(first)!.bytes;this.details.delete(first);
    }
    this.details.set(id,{detail,bytes});this.detailBytes+=bytes;
  }

  private rememberRecords<K extends Table['kind']>(kind: K, rows: Rows[K][]): void {
    for (const row of rows) {
      const key = kind + ':' + row.id, bytes = new TextEncoder().encode(JSON.stringify(row)).byteLength * 4;
      const old = this.recordCache.get(key);
      if (old) { this.recordCacheBytes -= old.bytes; this.recordCache.delete(key); }
      if (bytes > 8 * 1024 * 1024) continue;
      while (this.recordCache.size && (this.recordCacheBytes + bytes > 8 * 1024 * 1024 || this.recordCache.size >= 4096)) {
        const first = this.recordCache.keys().next().value!;
        this.recordCacheBytes -= this.recordCache.get(first)!.bytes; this.recordCache.delete(first);
      }
      this.recordCache.set(key, { row, bytes }); this.recordCacheBytes += bytes;
    }
  }

  private constructor(manifest: Manifest, base: string, local: Local | null = null) {
    super();
    this.manifest = manifest; this.local = local; this.origin = base;
    this.base = base + '/catalog/' + manifest.id;
    const assets = base.slice(0, -4) + '/assets/' + manifest.id;
    this.atlas = new Atlas(manifest, assets, this.controller.signal, async (file, signal) => {
      if (this.local) return this.local.asset(file.path, signal);
      try {
        const response = await fetch(assets + '/' + file.path, { signal });
        if (!response.ok) { await response.body?.cancel(); throw new ApiError('asset_failed', '纹理请求失败：' + response.status, response.status); }
        return await body(response, file.bytes, file.bytes);
      } catch (error) {
        if (!networkError(error) || signal.aborted || this.controller.signal.aborted) throw error;
        return (await this.saved()).asset(file.path, signal);
      }
    });
    this.releaseInventoryVisuals=bindInventoryVisuals(manifest.id,{
      atlas:this.atlas,signal:this.controller.signal,
      visual:(id,signal)=>this.record('visuals',id,signal),texture:(id,signal)=>this.record('textures',id,signal),
    });
    this.releasePublishedAnimations=bindPublishedAnimations(manifest.id,{
      entry:(id,signal)=>this.record('browse',id,signal),texture:(id,signal)=>this.record('textures',id,signal),
      acquire:(frame,signal)=>this.atlas.acquireFrame(frame,signal,5),
      reserve:bytes=>this.atlas.claimVisualBytes(bytes),
    });
  }

  get offline(): boolean { return this.local !== null; }

  private async selectLanguage(requested?: Language): Promise<Catalog> {
    try {
      const file=this.manifest.files.find(file=>file.kind==='strings'&&file.rows>0);
      const declared=this.manifest.locale ?? (file?.first ? (await this.record('strings',file.first)).locale : null);
      this.locale=requireLanguage(declared,requested);
      return this;
    } catch(error) { this.close(); throw error; }
  }

  static async open(id = '', options: OpenOptions = {}): Promise<Catalog> {
    const { signal, offline = false, base = '/api' } = options;
    if (id && !/^[a-f0-9]{64}$/.test(id)) throw new ApiError('invalid_id', '数据集链接无效');
    if (!base.endsWith('/api')) throw new ApiError('invalid_url', 'API 地址必须以 /api 结尾');
    if (offline || navigator.onLine === false) {
      const local = await Local.open(id, signal, base, options.language && gameLanguage(options.language));
      return new Catalog(local.manifest, base, local).selectLanguage(options.language);
    }
    let data: unknown;
    try { data = await request(base + '/catalog' + (id ? '/' + id : options.language ? '?locale='+gameLanguage(options.language) : ''), signal, limits.manifest); }
    catch (error) {
      if(error instanceof ApiError&&['locale_missing','locale_mismatch'].includes(error.code))throw new ApiError(error.code,t('尚未发布或保存该语言的数据。'),error.status);
      if (!networkError(error) || signal?.aborted) throw error;
      const local = await Local.open(id, signal, base, options.language && gameLanguage(options.language));
      return new Catalog(local.manifest, base, local).selectLanguage(options.language);
    }
    let manifest: Manifest;
    try { manifest = await checkManifest(data, id); }
    catch { throw new ApiError('invalid_catalog', '数据集清单不符合当前契约或内容身份'); }
    return new Catalog(manifest, base).selectLanguage(options.language);
  }

  private saved(): Promise<Local> {
    if (this.local) return Promise.resolve(this.local);
    if (!this.openingLocal) {
      this.openingLocal = Local.open(this.manifest.id, this.controller.signal, this.origin).then(local => {
        if (this.controller.signal.aborted) { local.close(); throw new DOMException('Aborted', 'AbortError'); }
        this.local = local;
        this.dispatchEvent(new Event('source'));
        return local;
      }).catch(error => { this.openingLocal = null; throw error; });
    }
    return this.openingLocal;
  }

  private async get(endpoint: string, signal?: AbortSignal, priority=0): Promise<unknown> {
    const active = signal ? AbortSignal.any([signal, this.controller.signal]) : this.controller.signal;
    active.throwIfAborted();
    if(/^\/(?:recipes(?:\/[^/?]+)?|directory\/[^/?]+)(?:\?|$)/.test(endpoint)
      &&typeof Worker!=='undefined'&&this.origin==='/api'){
      const interaction=this.interaction??=new Interaction(this.manifest,this.offline);
      if(await interaction.ready){active.throwIfAborted();return interaction.read(endpoint,active,priority);}
    }
    if (this.local) return this.local.get(endpoint, active);
    try { return await request(this.base + endpoint, active); }
    catch (error) {
      if (!networkError(error) || active.aborted) throw error;
      return (await this.saved()).get(endpoint, active);
    }
  }

  async items(options: Browse, signal?: AbortSignal): Promise<Items> {
    const data = object(await this.get('/items?' + params(options), signal));
    const result = { ...page(data, 'browse'), textures: table('textures', data.textures) };
    const textures = new Set(result.textures.map(texture => texture.id));
    if (result.rows.some(row => row.icon && !textures.has(row.icon))) throw new ApiError('invalid_response', '物品页缺少所引用的纹理');
    this.rememberRecords('browse', result.rows);
    this.rememberRecords('textures', result.textures);
    return result;
  }

  async references(options: ReferenceSearch, signal?: AbortSignal): Promise<GeneticReferencePage> {
    return readGeneticReferences((endpoint,active)=>this.get(endpoint,active),options,signal);
  }
  async cropsNh(options:CropsNhSearch,signal?:AbortSignal):Promise<CropsNhPage> {
    return readCropsNh((endpoint,active)=>this.get(endpoint,active),options,signal);
  }

  async quests(options: QuestSearch, signal?: AbortSignal): Promise<QuestPage> {
    return readQuests((endpoint, active) => this.get(endpoint, active), options, signal);
  }
  async furnaceFuels(options: FuelSearch, signal?: AbortSignal): Promise<FuelPage> {
    return readFurnaceFuels((endpoint, active) => this.get(endpoint, active), options, signal);
  }
  async fireworks(options: FireworkSearch, signal?: AbortSignal): Promise<FireworkPage> {
    return readFireworks((endpoint, active) => this.get(endpoint, active), options, signal);
  }
  async lathe(options: LatheSearch, signal?: AbortSignal): Promise<LathePage> {
    return readLathe((endpoint, active) => this.get(endpoint, active), options, signal);
  }
  async forestryInfo(options:ForestrySearch,signal?:AbortSignal):Promise<ForestryPage> {
    return readForestryInfo((endpoint,active)=>this.get(endpoint,active),options,signal);
  }
  async information(options:InformationSearch,signal?:AbortSignal):Promise<InformationPage> {
    return readInformation((endpoint,active)=>this.get(endpoint,active),options,signal);
  }
  async usageQueries(options:UsageSearch,signal?:AbortSignal):Promise<UsagePage> {
    const page=await readUsageQueries((endpoint,active)=>this.get(endpoint,active),options,signal);
    if(this.locale&&page.definitions.some(row=>row.data.locale!==gameLanguage(this.locale!)))throw new ApiError('invalid_response','Native usage locale differs from Catalog');
    return page;
  }
  async diagrams(options:DiagramSearch,signal?:AbortSignal):Promise<DiagramPage> {
    return readDiagrams((endpoint,active)=>this.get(endpoint,active),options,signal);
  }
  async enderStorage(options:EnderSearch,signal?:AbortSignal):Promise<EnderPage> {
    return readEnderStorage((endpoint,active)=>this.get(endpoint,active),options,signal);
  }

  async forgeRegistry(options:ForgeSearch,signal?:AbortSignal):Promise<ForgePage> {
    return readForgeRegistry((endpoint,active)=>this.get(endpoint,active),options,signal);
  }
  async projectBlue(options:ProjectBlueSearch,signal?:AbortSignal):Promise<ProjectBluePage> {
    return readProjectBlue((endpoint,active)=>this.get(endpoint,active),options,signal);
  }

  async toolMaterials(options: ToolMaterialSearch, signal?: AbortSignal): Promise<ToolMaterialPage> {
    return readToolMaterials((endpoint,active)=>this.get(endpoint,active), options, signal);
  }

  async villagerTrades(options: VillagerSearch, signal?: AbortSignal): Promise<VillagerPage> {
    return readVillagerTrades((endpoint, active) => this.get(endpoint, active), options, signal);
  }

  async recipes(options: Search, signal?: AbortSignal, priority=0): Promise<Recipes> {
    const data = object(await this.get('/recipes?' + params(options) + '&directory=1', signal,priority));
    if (!Array.isArray(data.categories)) throw new ApiError('invalid_response', '配方分类数据缺失');
    const categories = data.categories.map(value => {
      const row = object(value); integer(row.count);
      if (typeof row.id !== 'string') throw new ApiError('invalid_response', '配方分类数据无效');
      return { id: row.id, count: row.count };
    });
    if (!Array.isArray(data.recipeIds) || data.recipeIds.some(id => typeof id !== 'string')) throw new ApiError('invalid_response', '配方目录缺失');
    const result={ ...page(data, 'recipes'), recipeIds: data.recipeIds as string[], categories, related: related(data.related) };
    await validateRecipeFacts(result.rows,result.related);
    if(result.rows.length<=4)for(const recipe of result.rows)this.rememberDetail({recipe,related:result.related});
    return result;
  }
  async directory(item:string,signal?:AbortSignal,priority=0):Promise<Awaited<ReturnType<import('@neonei/catalog/source').Query['directory']>>>{
    return await this.get('/directory/'+encodeURIComponent(item),signal,priority) as Awaited<ReturnType<import('@neonei/catalog/source').Query['directory']>>;
  }

  async recipe(id: string, signal?: AbortSignal, priority=0): Promise<Detail> {
    signal?.throwIfAborted();
    const cached=this.details.get(id);if(cached){this.details.delete(id);this.details.set(id,cached);return cached.detail;}
    const data = object(await this.get('/recipes/' + encodeURIComponent(id), signal,priority));
    const detail={ recipe: table('recipes', [data.recipe])[0]!, related: related(data.related) };
    await validateRecipeFacts([detail.recipe],detail.related);
    this.rememberDetail(detail);return detail;
  }
  async poolPreview(id:string,options:NativePoolOptions,signal?:AbortSignal):Promise<NativePoolPreview>{
    const {readNativePoolPreview}=await import('../../../catalog/src/botania-pool.ts');
    const query=new URLSearchParams();
    for(const [key,value]of Object.entries(options))if(value!==undefined)query.set(key,String(value));
    return readNativePoolPreview(await this.get('/recipes/'+encodeURIComponent(id)+'/pool-preview?'+query,signal));
  }
  async evaluateSelection(value:RecipeSelectionRequest,signal?:AbortSignal):Promise<RecipeSelectionResult>{
    signal?.throwIfAborted();this.controller.signal.throwIfAborted();
    const {readRecipeSelectionRequest,readRecipeSelectionResult}=await import('../../../catalog/src/recipe-evaluation.ts');
    signal?.throwIfAborted();this.controller.signal.throwIfAborted();
    const selection=readRecipeSelectionRequest(value);
    if(selection.catalog!==this.manifest.id)throw new ApiError('invalid_query','Selection belongs to another Catalog snapshot',400);
    const query=new URLSearchParams({selection:JSON.stringify(selection)});
    const data=await this.get('/recipes/'+encodeURIComponent(selection.recipe)+'/selection?'+query,signal);
    signal?.throwIfAborted();this.controller.signal.throwIfAborted();
    try{return readRecipeSelectionResult(data,this.manifest.id,selection.recipe);}
    catch{throw new ApiError('invalid_response','Recipe selection does not match this Catalog and recipe');}
  }

  async topics(options: TopicSearch, signal?: AbortSignal): Promise<Topics> {
    const data = object(await this.get('/topics?' + params(options), signal));
    return { ...page(data, 'topics'), related: related(data.related) };
  }

  async oreGroup(id: string, signal?: AbortSignal): Promise<OreGroupDetail> {
    const data = object(await this.get('/ore-groups/' + encodeURIComponent(id), signal));
    return { group: table('ore-groups', [data.group])[0]! };
  }

  async oreMembers(id: string, offset: number, signal?: AbortSignal): Promise<OreMembers> {
    const data = object(await this.get('/ore-groups/' + encodeURIComponent(id) + '/members?' + params({ offset, limit: 20 }), signal));
    return { ...page(data, 'ore-members'), related: related(data.related) };
  }

  async itemAspects(id: string, signal?: AbortSignal): Promise<ItemAspects> {
    const data = object(await this.get('/items/' + encodeURIComponent(id) + '/aspects', signal));
    return { item: table('items', [data.item])[0]!, aspects: table('topics', data.aspects), related: related(data.related) };
  }

  async aspect(id: string, signal?: AbortSignal): Promise<AspectDetail> {
    const data = object(await this.get('/aspects/' + encodeURIComponent(id), signal));
    const aspect = table('aspects', [data.aspect])[0]!;
    const references = table('references', data.references);
    const domains = new Set<string>();
    for (let i=0;i<references.length;i+=2) {
      const definition=references[i]!, member=references[i+1];
      if (definition.data.kind !== 'aspectCombinationsDefinition' || definition.data.consuming
        || domains.has(definition.domain) || !member || member.domain !== definition.domain
        || member.data.kind !== 'aspectCombination' || member.data.aspect !== aspect.id
        || member.data.visible !== (definition.data.visibility === 'allRegisteredAspects' ? true : aspect.discovered)
        || JSON.stringify(member.data.components) !== JSON.stringify(aspect.components))
        throw new ApiError('invalid_response', '要素组合与知识快照不一致');
      domains.add(definition.domain);
    }
    return { aspect, references, components: table('topics', data.components), combinations: table('topics', data.combinations), related: related(data.related) };
  }

  async aspectSources(id:string,offset:number,signal?:AbortSignal):Promise<ItemAspectSources> {
    return readItemAspectSources((path,signal)=>this.get(path,signal),id,offset,signal);
  }

  async lexicon(search:LexiconSearch,signal?:AbortSignal):Promise<LexiconPage> {
    return readLexicon((path,signal)=>this.get(path,signal),search,signal);
  }

  async mobs(search:MobSearch,signal?:AbortSignal):Promise<MobIndex> {
    return readMobs((path,signal)=>this.get(path,signal),search,signal);
  }

  async mobDrops(entity:string,offset:number,signal?:AbortSignal):Promise<MobDropsPage> {
    return readMobDrops((path,signal)=>this.get(path,signal),entity,offset,signal);
  }

  async infernalPools(search:InfernalSearch,signal?:AbortSignal):Promise<InfernalPoolsPage> {
    return readInfernalPools((path,signal)=>this.get(path,signal),search,signal);
  }

  async draconicReactor(signal?:AbortSignal):Promise<DraconicReactorPage> {
    return readDraconicReactor((path,signal)=>this.get(path,signal),signal);
  }
  async beeTree(search:BeeTreeSearch,signal?:AbortSignal):Promise<BeeTreePage> {
    return readBeeTree((path,signal)=>this.get(path,signal),search,signal);
  }
  async undergroundFluids(search:UndergroundSearch,signal?:AbortSignal):Promise<UndergroundPage> {
    return readUndergroundFluids((path,signal)=>this.get(path,signal),search,signal);
  }
  async gtMinerals(search:GtMineralSearch,signal?:AbortSignal):Promise<GtMineralPage> {
    return readGtMinerals((path,signal)=>this.get(path,signal),search,signal);
  }
  async bartworksOres(search:BartworksSearch,signal?:AbortSignal):Promise<BartworksPage> {
    return readBartworksOres((path,signal)=>this.get(path,signal),search,signal);
  }

  async research(id: string, signal?: AbortSignal): Promise<ResearchDetail> {
    const data = object(await this.get('/research/' + encodeURIComponent(id), signal));
    return { research: table('research', [data.research])[0]!, references: table('topics', data.references), related: related(data.related) };
  }

  async material(id: string, signal?: AbortSignal): Promise<MaterialDetail> {
    const data = object(await this.get('/materials/' + encodeURIComponent(id), signal));
    return { material: table('materials', [data.material])[0]!, components: table('topics', data.components), related: related(data.related) };
  }

  async structure(id: string, signal?: AbortSignal): Promise<StructureDetail> {
    const data = object(await this.get('/structures/' + encodeURIComponent(id), signal));
    const structure=table('structures', [data.structure])[0]!;
    let information:StructureDetail['information']=null;
    if(data.information!==null) {
      const raw=object(data.information),rows=table('references',[raw.definition,raw.controller]);
      const definition=rows[0]!,controller=rows[1]!;
      if(definition.data.kind!=='structureCatalogDefinition'||controller.data.kind!=='structureCatalogController'
        ||definition.domain!==controller.domain||controller.data.structure!==structure.id||controller.data.controller!==structure.controller
        ||controller.data.origin.owner!==structure.source.owner||controller.data.origin.handler!==structure.source.handler
        ||controller.data.origin.key!==structure.source.key)throw new ApiError('invalid_response','结构资料与原生几何归属不一致');
      information={definition:{...definition,data:definition.data},controller:{...controller,data:controller.data}};
    }
    return { structure, information, related: related(data.related) };
  }

  async structureComponents(id:string,offset:number,signal?:AbortSignal):Promise<StructureComponents> {
    const data=object(await this.get('/structures/'+encodeURIComponent(id)+'/components?'+params({offset,limit:20}),signal));
    const result=page(data,'references'),rows:StructureComponents['rows']=[];
    for(const row of result.rows) {
      if(row.data.kind!=='structureComponentLookup'||!row.data.structures.includes(id))throw new ApiError('invalid_response','原生部件资料属于其他结构');
      rows.push({...row,data:row.data});
    }
    return {...result,rows,related:related(data.related)};
  }

  async shapes(id: string, piece: string, offset: number, signal?: AbortSignal): Promise<Page<Shape>> {
    return page(await this.get('/structures/' + encodeURIComponent(id) + '/shapes?' + params({ piece, offset, limit: 4 }), signal), 'shapes');
  }

  async circuit(id: string, signal?: AbortSignal): Promise<CircuitDetail> {
    const data = object(await this.get('/circuits/' + encodeURIComponent(id), signal));
    return { circuit: table('circuits', [data.circuit])[0]!, related: related(data.related) };
  }

  async species(id: string, signal?: AbortSignal): Promise<SpeciesDetail> {
    const data = object(await this.get('/species/' + encodeURIComponent(id), signal));
    integer(data.origins); integer(data.crosses);
    return { species: table('species', [data.species])[0]!, origins: data.origins, crosses: data.crosses, related: related(data.related) };
  }

  async mutations(id: string, options: MutationSearch, signal?: AbortSignal): Promise<Mutations> {
    const data = object(await this.get('/species/' + encodeURIComponent(id) + '/mutations?' + params(options), signal));
    return { ...page(data, 'mutations'), species: table('topics', data.species), related: related(data.related) };
  }

  async record<K extends Table['kind']>(kind: K, id: string, signal?: AbortSignal,priority=0): Promise<Rows[K]> {
    signal?.throwIfAborted();
    const key = kind + ':' + id, cached = this.recordCache.get(key);
    if (cached) { this.recordCache.delete(key); this.recordCache.set(key, cached); return cached.row as Rows[K]; }
    const row = table(kind, [await this.get('/records/' + kind + '/' + encodeURIComponent(id), signal,priority)])[0]!;
    if(kind==='recipes'){
      try{await validateRecipeFacts([row as Recipe]);}
      catch{throw new ApiError('invalid_response','接口返回的数据不符合当前契约：recipes');}
    }
    this.rememberRecords(kind, [row]);
    return row;
  }

  async facets(signal?: AbortSignal): Promise<Facets> {
    const data = object(await this.get('/facets', signal));
    if (!Array.isArray(data.mods) || !Array.isArray(data.groups)) throw new ApiError('invalid_response', '筛选数据缺失');
    return {
      mods: data.mods.map(value => {
        const row = object(value); integer(row.count);
        if (typeof row.id !== 'string') throw new ApiError('invalid_response', '模组筛选数据无效');
        return { id: row.id, count: row.count };
      }),
      groups: data.groups.map(value => {
        const row = object(value); integer(row.count);
        if (typeof row.id !== 'string' || typeof row.name !== 'string' || typeof row.collapsed !== 'boolean') throw new ApiError('invalid_response', '分组筛选数据无效');
        return { id: row.id, name: row.name, count: row.count, collapsed: row.collapsed };
      }),
    };
  }

  count(kind: Table['kind']): number {
    const value = this.manifest.counts[kind];
    integer(value);
    return value;
  }

  async build(id: string, signal?: AbortSignal): Promise<BuildDetail> {
    const data = object(await this.get('/builds/' + encodeURIComponent(id), signal));
    const build = table('builds', [data.build])[0]!;
    const blocks = table('blocks', data.blocks);
    const ids = [...new Set(build.palette.map(entry => entry.block))];
    if (blocks.length !== ids.length || blocks.some((block, index) => block.id !== ids[index])) throw new ApiError('invalid_response', '装配方块与调色板不一致');
    return { build, blocks, related: related(data.related) };
  }

  async buildShapes(id: string, offset: number, signal?: AbortSignal): Promise<Page<Shape>> {
    return page(await this.get('/builds/' + encodeURIComponent(id) + '/shapes?offset=' + offset + '&limit=4', signal), 'shapes');
  }

  async models(id: string, offset: number, signal?: AbortSignal): Promise<ModelPage> {
    const data = object(await this.get('/builds/' + encodeURIComponent(id) + '/models?offset=' + offset + '&limit=4', signal));
    return { ...page(data, 'models'), textures: table('textures', data.textures) };
  }

  close(): void { this.details.clear(); this.detailBytes=0; this.controller.abort(); this.releaseInventoryVisuals(); this.releasePublishedAnimations(); this.interaction?.close(); this.atlas.close(); this.local?.close(); }
}

function params(options: Browse | Search | TopicSearch | MutationSearch | { piece?: string; offset: number; limit: number }): string {
  return new URLSearchParams(Object.entries(options).map(([key, value]) => [key, String(value)])).toString();
}

export class Records {
  readonly xu:Map<string,import('../../../catalog/src/xu-microblock.ts').XuInformation>;
  readonly fmp:Map<string,import('../../../catalog/src/fmp.ts').FmpInformation>;
  readonly items: Map<string, Item>;
  readonly fluids: Map<string, Fluid>;
  readonly categories: Map<string, Category>;
  readonly strings: Map<string, string>;
  readonly textures: Map<string, Texture>;
  readonly topics: Map<string, Topic>;
  constructor(data: Related) {
    this.xu=new Map((data.xu??[]).map(info=>[info.program+'/'+info.materialId,info]));
    this.fmp=new Map();
    for(const info of data.fmp??[]){
      const key=info.program+'/'+info.materialId,prior=this.fmp.get(key);
      if(!prior){this.fmp.set(key,info);continue;}
      const saws=new Map([...prior.saws,...info.saws].map(saw=>[saw.registry,saw]));
      this.fmp.set(key,{...info,saws:[...saws.values()]});
    }
    this.items = new Map(data.items.map(row => [row.id, row]));
    this.fluids = new Map(data.fluids.map(row => [row.id, row]));
    this.categories = new Map(data.categories.map(row => [row.id, row]));
    this.strings = new Map(data.strings.map(row => [row.id, row.text]));
    this.textures = new Map(data.textures.map(row => [row.id, row]));
    this.topics = new Map(data.topics.map(row => [row.id, row]));
  }
  text(id: string): string { return required(this.strings, id); }
  picture(topic: Topic): Texture | null {
    return topic.image ? required(this.textures, topic.image) : topic.icon ? this.texture(topic.icon.kind, topic.icon.id) : null;
  }
  substance(kind: 'item' | 'fluid', id: string): Item | Fluid { return kind === 'item' ? required(this.items, id) : required(this.fluids, id); }
  texture(kind: 'item' | 'fluid', id: string): Texture | null {
    const icon = this.substance(kind, id).icon;
    return icon ? required(this.textures, icon) : null;
  }
}

export function required<T>(rows: Map<string, T>, id: string): T {
  const row = rows.get(id);
  if (row === undefined) throw new ApiError('missing_reference', '数据集缺少引用：' + id);
  return row;
}
