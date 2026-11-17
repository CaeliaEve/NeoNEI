import { collections, topicKinds, type Entry, type Recipe, type Texture, type TopicKind } from '@elysium/contracts';
import { Catalog, Fault, type Collection } from './store.ts';
import { Query, type Page, type Related } from './query.ts';
import { geneticReferences } from './references.ts';
import { CropsNhQuery, type CropsNhSearch } from './cropsnh.ts';
import { toolMaterials } from './tool-materials.ts';
import { villagerTrades } from './villager-trades.ts';
import { ItemAspectQuery } from './item-aspects.ts';
import { LexiconQuery } from './lexicon.ts';
import { MobDropsQuery } from './mob-drops.ts';
import { InfernalDropsQuery, type InfernalTierName } from './infernal-drops.ts';
import { DraconicReactorQuery } from './draconic-reactor.ts';
import { BeeTreeQuery, type BeeTreeSearch } from './bee-tree.ts';
import { UndergroundFluidQuery } from './underground-fluids.ts';
import { GtMineralQuery } from './gt-minerals.ts';
import { BartworksOreQuery, type BartworksSearch } from './bartworks-ores.ts';
import { QuestQuery } from './quests.ts';
import { FurnaceFuelQuery } from './furnace-fuels.ts';
import { FireworkQuery } from './fireworks.ts';
import { LatheQuery } from './lathe.ts';
import { ForestryQuery } from './forestry-info.ts';
import {InformationQuery,type InformationSearch} from './information.ts';
import {UsageQuery,type UsageBackend} from './usage-queries.ts';
import {DiagramQuery,type DiagramSearch} from './diagrams.ts';
import {EnderQuery,type EnderSearch} from './ender-storage.ts';
import {ForgeRegistryQuery,type ForgeSearch} from './forge-registry.ts';
import {ProjectBlueQuery,type ProjectBlueSearch} from './projectblue.ts';
import {NativeBeePoolQuery} from './botania-pool.ts';
import {RecipeSelectionQuery,readRecipeSelectionRequest,recipeSelectionLimits} from './recipe-evaluation.ts';

export type Items = Page<Entry> & { textures: Texture[] };
export type Recipes = Page<Recipe> & { recipeIds: string[]; categories: Array<{ id: string; count: number }>; related: Related };
export interface Detail { recipe: Recipe; related: Related }
export type StructureDetail = Awaited<ReturnType<Query['structure']>>;
export type StructureComponents = Awaited<ReturnType<Query['structureComponents']>>;
export type BuildDetail = Awaited<ReturnType<Query['build']>>;
export type ModelPage = Awaited<ReturnType<Query['models']>>;
export type AspectDetail = Awaited<ReturnType<Query['aspect']>>;
export type ResearchDetail = Awaited<ReturnType<Query['research']>>;
export type ItemAspects = Awaited<ReturnType<Query['itemAspects']>>;
export type Topics = Awaited<ReturnType<Query['topics']>> & { related: Related };
export type MaterialDetail = Awaited<ReturnType<Query['material']>>;
export type CircuitDetail = Awaited<ReturnType<Query['circuit']>>;
export type SpeciesDetail = Awaited<ReturnType<Query['species']>>;
export type Mutations = Awaited<ReturnType<Query['mutations']>>;
export type OreGroupDetail = Awaited<ReturnType<Query['oreGroup']>>;
export type OreMembers = Awaited<ReturnType<Query['oreMembers']>>;

function text(parameters: URLSearchParams, key: string, limit = 256): string {
  const values = parameters.getAll(key);
  const value = values[0] ?? '';
  if (values.length > 1 || value.length > limit) throw new Fault('invalid_query', 'Invalid ' + key, 400);
  return value;
}

function integer(parameters: URLSearchParams, key: string, initial: number, maximum: number): number {
  const raw = text(parameters, key, 12);
  if (!raw) return initial;
  if (!/^(0|[1-9][0-9]*)$/.test(raw) || Number(raw) > maximum || (key === 'limit' && raw === '0')) {
    throw new Fault('invalid_query', 'Invalid ' + key, 400);
  }
  return Number(raw);
}

function flag(parameters:URLSearchParams,key:string):boolean {
  const raw=text(parameters,key,5);
  if(raw&&!['true','false'].includes(raw))throw new Fault('invalid_query','Invalid '+key,400);
  return raw==='true';
}

/** The same read-only routes are evaluated by Express and by the offline worker. */
export class Api {
  readonly catalog: Catalog;
  private readonly query: Query;
  private readonly scannedAspects: ItemAspectQuery;
  private readonly cropsNh: CropsNhQuery;
  private readonly lexicon: LexiconQuery;
  private readonly mobs: MobDropsQuery;
  private readonly infernal: InfernalDropsQuery;
  private readonly reactor: DraconicReactorQuery;
  private readonly beeTree: BeeTreeQuery;
  private readonly underground: UndergroundFluidQuery;
  private readonly minerals: GtMineralQuery;
  private readonly bartworks: BartworksOreQuery;
  private readonly quests: QuestQuery;
  private readonly fuels: FurnaceFuelQuery;
  private readonly fireworks: FireworkQuery;
  private readonly lathe: LatheQuery;
  private readonly forestry: ForestryQuery;
  private readonly information:InformationQuery;
  private readonly usageQueries:UsageQuery;
  private readonly diagrams:DiagramQuery;
  private readonly enderStorage:EnderQuery;
  private readonly forgeRegistry:ForgeRegistryQuery;
  private readonly projectBlue:ProjectBlueQuery;
  private readonly nativePool:NativeBeePoolQuery;
  private readonly selections:RecipeSelectionQuery;
  constructor(catalog: Catalog) {
    this.catalog = catalog; this.query = new Query(catalog);
    this.scannedAspects = new ItemAspectQuery(catalog); this.lexicon = new LexiconQuery(catalog);
    this.cropsNh = new CropsNhQuery(catalog);
    this.mobs = new MobDropsQuery(catalog); this.infernal = new InfernalDropsQuery(catalog);
    this.reactor = new DraconicReactorQuery(catalog); this.beeTree = new BeeTreeQuery(catalog);
    this.underground = new UndergroundFluidQuery(catalog); this.minerals = new GtMineralQuery(catalog);
    this.bartworks = new BartworksOreQuery(catalog); this.quests = new QuestQuery(catalog);
    this.fuels = new FurnaceFuelQuery(catalog);
    this.fireworks = new FireworkQuery(catalog);
    this.lathe = new LatheQuery(catalog);
    this.forestry = new ForestryQuery(catalog);
    this.information=new InformationQuery(catalog);
    this.usageQueries=new UsageQuery(catalog);
    this.diagrams=new DiagramQuery(catalog);
    this.enderStorage=new EnderQuery(catalog);
    this.forgeRegistry=new ForgeRegistryQuery(catalog);
    this.projectBlue=new ProjectBlueQuery(catalog);
    this.nativePool=new NativeBeePoolQuery(catalog);
    this.selections=new RecipeSelectionQuery(catalog);
  }

  async read(parts: readonly string[], parameters = new URLSearchParams()): Promise<unknown> {
    if (parts.length > 4 || parts.some(part => !part || part.length > 256)) throw new Fault('invalid_url', 'Invalid catalog URL', 400);
    const [name, id, action] = parts;
    const field = (key: string): string => text(parameters, key);
    const offset = (): number => integer(parameters, 'offset', 0, 10000000);
    const limit = (initial: number, maximum: number): number => integer(parameters, 'limit', initial, maximum);
    const query = this.query, catalog = this.catalog;
    if(parts.length===3&&name==='mobs'&&action==='drops') return this.mobs.drops(id!,offset(),limit(20,100));
    if (parts.length === 1) {
      if(name==='cropsnh')return this.cropsNh.page({section:(field('section')||'crops') as CropsNhSearch['section'],
        crop:field('crop'),query:field('query'),offset:offset(),limit:limit(20,100)});
      if(name==='usage-queries')return this.usageQueries.page({backend:(field('backend')||'aeItemCell') as UsageBackend,query:field('query'),item:field('item'),observation:field('observation'),document:field('document'),offset:offset(),limit:limit(4,32),entryOffset:integer(parameters,'entryOffset',0,10000000),entryLimit:integer(parameters,'entryLimit',8,32),documentOffset:integer(parameters,'documentOffset',0,10000000),documentLimit:integer(parameters,'documentLimit',1,32)});
      if(name==='projectblue')return this.projectBlue.page({mode:(field('mode')||'all') as ProjectBlueSearch['mode'],offset:offset(),limit:limit(6,12)});
      if(name==='forge-registry')return this.forgeRegistry.page({registry:field('registry') as ForgeSearch['registry'],query:field('query'),item:field('item'),offset:offset(),limit:limit(4,20),memberOffset:integer(parameters,'memberOffset',0,10000000),memberLimit:integer(parameters,'memberLimit',12,32),choiceOffset:integer(parameters,'choiceOffset',0,10000000),choiceLimit:integer(parameters,'choiceLimit',8,32)});
      if(name==='ender-storage')return this.enderStorage.page({type:field('type') as EnderSearch['type'],owner:field('owner') as EnderSearch['owner'],query:field('query'),frequency:field('frequency'),item:field('item'),state:field('state'),offset:offset(),limit:limit(4,32),slotOffset:integer(parameters,'slotOffset',0,10000000),slotLimit:integer(parameters,'slotLimit',27,32)});
      if(name==='diagrams')return this.diagrams.page({group:field('group'),query:field('query'),item:field('item'),direction:field('direction') as DiagramSearch['direction'],diagram:field('diagram'),action:field('action'),selection:(field('selection')||'all') as DiagramSearch['selection'],shift:flag(parameters,'shift'),ctrl:flag(parameters,'ctrl'),offset:offset(),limit:limit(1,32),cellOffset:integer(parameters,'cellOffset',0,10000000),cellLimit:integer(parameters,'cellLimit',12,32),choiceOffset:integer(parameters,'choiceOffset',0,10000000),choiceLimit:integer(parameters,'choiceLimit',8,32),annotationOffset:integer(parameters,'annotationOffset',0,10000000),annotationLimit:integer(parameters,'annotationLimit',12,32)});
      if(name==='information') {
        const include=field('includeUnmatched')||'false';if(include!=='true'&&include!=='false')throw new Fault('invalid_query','Invalid unmatched documentation option',400);
        return this.information.page({backend:field('backend') as InformationSearch['backend'],query:field('query'),item:field('item'),document:field('document'),includeUnmatched:include==='true',offset:offset(),limit:limit(12,100),linkOffset:integer(parameters,'linkOffset',0,10000000),linkLimit:integer(parameters,'linkLimit',8,100)});
      }
      if(name==='forestry-info') {
        const mode=field('mode')||'produce';if(mode!=='produce'&&mode!=='breeding')throw new Fault('invalid_query','Invalid Forestry mode',400);
        return this.forestry.page({mode,root:field('root'),species:field('species'),query:field('query'),offset:offset(),limit:limit(12,100)});
      }
      if(name==='lathe')return this.lathe.page({workpiece:field('workpiece'),state:field('state'),tool:field('tool'),toolState:field('toolState'),offset:offset(),limit:limit(12,100),toolOffset:integer(parameters,'toolOffset',0,10000000),toolLimit:integer(parameters,'toolLimit',12,100)});
      if (name === 'fireworks') return this.fireworks.page({offset:offset(),limit:limit(12,100)});
      if (name === 'furnace-fuels') return this.fuels.page({query: field('query'), item: field('item'), offset: offset(), limit: limit(20,100)});
      if (name === 'quests') return this.quests.page({query: field('query'), quest: field('quest'), item: field('item'), offset: offset(), limit: limit(4,100)});
      if(name==='underground-fluids') return this.underground.page({dimension:field('dimension'),query:field('query'),fluid:field('fluid'),offset:offset(),limit:limit(20,100)});
      if(name==='gt-minerals') return this.minerals.page({family:field('family'),dimension:field('dimension'),query:field('query'),item:field('item'),offset:offset(),limit:limit(20,100)});
      if(name==='bartworks-ores') return this.bartworks.page({mode:(field('mode')||'layers') as BartworksSearch['mode'],dimension:field('dimension'),query:field('query'),item:field('item'),offset:offset(),limit:limit(20,100)});
      if(name==='bee-tree') return this.beeTree.page({species:field('species'),direction:(field('direction')||'origins') as BeeTreeSearch['direction'],query:field('query'),offset:offset(),limit:limit(20,100)});
      if(name==='draconic-reactor') return this.reactor.page();
      if(name==='infernal-drops') return this.infernal.page({tier:(field('tier')||'elite') as InfernalTierName,offset:offset(),limit:limit(20,100)});
      if(name==='mobs') return this.mobs.page({query:field('query'),item:field('item'),offset:offset(),limit:limit(20,100)});
      if(name==='lexicon') return this.lexicon.page({query:field('query'),item:field('item'),offset:offset(),limit:limit(20,100)});
      if (name === 'villager-trades') return villagerTrades(catalog, {domain:field('domain'),profession:field('profession'),item:field('item'),direction:(field('direction') || 'all') as 'all'|'recipes'|'uses',offset:offset(),limit:limit(20,100)});
      if (name === 'references') return geneticReferences(catalog, {domain:field('domain'),root:field('root'),query:field('query'),offset:offset(),limit:limit(20,100)});
      if (name === 'tool-materials') return toolMaterials(catalog, {domain:field('domain'),query:field('query'),offset:offset(),limit:limit(20,100)});
      if (name === 'facets') return query.facets();
      if (name === 'items') {
        const kind = field('kind') || 'all';
        if (kind !== 'all' && kind !== 'item' && kind !== 'fluid') throw new Fault('invalid_query', 'Unknown item kind', 400);
        const collapsed = field('collapsed') || 'true';
        if (collapsed !== 'true' && collapsed !== 'false') throw new Fault('invalid_query', 'Invalid collapsed flag', 400);
        const result = await query.items({ kind, query: field('query'), mod: field('mod'), group: field('group'),
          collapsed: collapsed === 'true', offset: offset(), limit: limit(100, 500) });
        const icons = new Set(result.rows.flatMap(row => row.icon ? [row.icon] : []));
        return { ...result, textures: await catalog.records('textures', icons) } satisfies Items;
      }
      if (name === 'recipes') {
        const direction = field('direction') || 'recipes';
        if (direction !== 'recipes' && direction !== 'uses') throw new Fault('invalid_query', 'Unknown recipe direction', 400);
        const item = field('item');
        if (!item) throw new Fault('invalid_query', 'An item or fluid id is required', 400);
        const result = await query.recipes({ item, direction, category: field('category'), query: field('query'),
          offset: offset(), limit: limit(20, 100) });
        const related=await query.related(result.rows);
        const categories=await catalog.records('categories',result.categories.map(category=>category.id));
        const strings=await catalog.records('strings',categories.map(category=>category.name));
        related.categories=[...new Map([...related.categories,...categories].map(row=>[row.id,row])).values()];
        related.strings=[...new Map([...related.strings,...strings].map(row=>[row.id,row])).values()];
        return { ...result, related } satisfies Recipes;
      }
      if (name === 'topics') {
        const value = field('kind');
        if (!topicKinds.includes(value as TopicKind)) throw new Fault('invalid_query', 'Unknown topic kind', 400);
        const result = await query.topics({ kind: value as TopicKind, item: field('item'), query: field('query'), offset: offset(), limit: limit(20, 100) });
        return { ...result, related: await query.related([], [], { topics: result.rows }) } satisfies Topics;
      }
    }
    if (parts.length === 2 && id) {
      if(name==='directory')return query.directory(id);
      if (name === 'programs') return catalog.program(id);
      if (name === 'recipes') {
        const recipe = await catalog.record('recipes', id);
        return { recipe, related: await query.related([recipe]) } satisfies Detail;
      }
      if (name === 'aspects') return query.aspect(id);
      if (name === 'research') return query.research(id);
      if (name === 'materials') return query.material(id);
      if (name === 'circuits') return query.circuit(id);
      if (name === 'structures') return query.structure(id);
      if (name === 'builds') return query.build(id);
      if (name === 'species') return query.species(id);
      if (name === 'ore-groups') return query.oreGroup(id);
    }
    if (parts.length === 3 && id) {
      if(name==='recipes'&&action==='selection'){
        parameters.forEach((_value,key)=>{if(key!=='selection')throw new Fault('invalid_query','Unknown selection parameter',400);});
        const raw=text(parameters,'selection',recipeSelectionLimits.payload);
        let value:unknown;
        try{value=JSON.parse(raw);}catch{throw new Fault('invalid_query','Invalid recipe selection JSON',400);}
        const selection=readRecipeSelectionRequest(value);
        if(selection.recipe!==id)throw new Fault('invalid_query','Selection recipe differs from route',400);
        return this.selections.evaluate(selection);
      }
      if(name==='recipes'&&action==='pool-preview'){
        const mana=text(parameters,'mana',12);
        if(mana&&(!/^(0|-?[1-9][0-9]*)$/.test(mana)||!Number.isInteger(Number(mana))
          ||Number(mana)<-2147483648||Number(mana)>2147483647))
          throw new Fault('invalid_query','Invalid pool mana',400);
        return this.nativePool.preview(id,{item:field('item'),...(mana?{mana:Number(mana)}:{}),
          ...(field('amount')?{amount:field('amount')}:{}),...(field('now')?{now:field('now')}: {})});
      }
      if (name === 'aspects' && action === 'sources') return this.scannedAspects.page(id,offset(),limit(20,100));
      if (name === 'items' && action === 'aspects') return query.itemAspects(id);
      if (name === 'ore-groups' && action === 'members') return query.oreMembers(id, offset(), limit(20, 100));
      if (name === 'structures' && action === 'shapes') return query.shapes(id, field('piece'), offset(), limit(4, 8));
      if (name === 'structures' && action === 'components') return query.structureComponents(id, offset(), limit(20,100));
      if (name === 'builds' && action === 'shapes') return query.buildShapes(id, offset(), limit(4, 8));
      if (name === 'builds' && action === 'models') return query.models(id, offset(), limit(4, 8));
      if (name === 'species' && action === 'mutations') {
        const direction = field('direction') || 'origins';
        if (direction !== 'origins' && direction !== 'crosses') throw new Fault('invalid_query', 'Unknown mutation direction', 400);
        return query.mutations(id, { direction, offset: offset(), limit: limit(10, 50) });
      }
      if (name === 'records' && action) {
        if (!collections.includes(id as Collection)) throw new Fault('invalid_collection', 'Unknown catalog collection', 400);
        return catalog.record(id as Collection, action);
      }
    }
    throw new Fault('not_found', 'Catalog route not found', 404);
  }
}
