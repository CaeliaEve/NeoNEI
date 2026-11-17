import {validateRecipe} from './recipe-validation.ts';
import type { Entry, Recipe, Category, PropertyValue, Item, Fluid, Text, Texture, Reference, Topic, TopicKind, Material, Circuit, Species, Mutation, Gene } from '@elysium/contracts';
import {gtNativeReferences} from './gt-probability.ts';
import { Catalog, Fault } from './store.ts';
import {validateBotaniaRecipe} from './botania.ts';
import { quantityBounds } from './quantity.ts';
import type { Structure, Shape, Build, Block, Model } from '@elysium/contracts';
import type { Aspect, Research, GeneticReferenceRow } from '@elysium/contracts';
import type { OreGroup, OreMember } from '@elysium/contracts';
import { StructureReferenceQuery, type StructureInformation } from './structure-references.ts';
import { FmpQuery, type FmpInformation } from './fmp.ts';
import {NativeBeePoolQuery} from './botania-pool.ts';
import { XuQuery, type XuInformation } from './xu-microblock.ts';

export interface Page<T> { rows: T[]; total: number; offset: number; limit: number }
export interface Browse { query: string; mod: string; kind: 'all' | 'item' | 'fluid'; group: string; collapsed: boolean; offset: number; limit: number }
export interface Search { item: string; direction: 'recipes' | 'uses'; category: string; query: string; offset: number; limit: number }
export interface TopicSearch { kind: TopicKind; item: string; query: string; offset: number; limit: number }
export interface MutationSearch { direction: 'origins' | 'crosses'; offset: number; limit: number }
type SearchEntry = Pick<Entry, 'id' | 'kind' | 'registry' | 'order' | 'group' | 'terms'>;

export interface Related { items: Item[]; fluids: Fluid[]; categories: Category[]; strings: Text[]; textures: Texture[]; topics: Topic[]; fmp?: FmpInformation[]; xu?: XuInformation[] }
export interface Facets { mods: Array<{ id: string; count: number }>; groups: Array<{ id: string; name: string; count: number; collapsed: boolean }> }

function namespace(registry: string): string { return registry.includes(':') ? registry.split(':', 1)[0]! : ''; }
function compare(left: string, right: string): number { return left < right ? -1 : Number(left > right); }

function memo<T>(read: () => Promise<T>): () => Promise<T> {
  let value: Promise<T> | undefined;
  return () => value ??= read().catch(error => { value = undefined; throw error; });
}

/** Per-snapshot query state; a pointer change cannot mix records from different catalogs. */
export class Query {
  readonly catalog: Pick<Catalog,'manifest'|'record'|'records'|'all'|'scan'> & Partial<Pick<Catalog,'program'>> & {directory?:(id:string)=>Promise<{recipes:Array<{id:string;category:string}>;uses:Array<{id:string;category:string}>}>};
  private readonly structureReferences:StructureReferenceQuery;
  private readonly fmpPrograms:FmpQuery;
  private readonly poolPrograms:NativeBeePoolQuery;
  private readonly xuPrograms:XuQuery;
  constructor(catalog: Query['catalog']) { this.catalog = catalog; this.structureReferences=new StructureReferenceQuery(catalog);this.fmpPrograms=new FmpQuery(catalog);this.xuPrograms=new XuQuery(catalog);this.poolPrograms=new NativeBeePoolQuery(catalog); }

  async directory(item:string){
    const links=await this.catalog.record('links',item);
    const prepared=this.catalog.directory?await this.catalog.directory(item):null;
    const group=async(direction:'recipes'|'uses')=>{
      const counts=new Map<string,number>();
      for(const row of prepared?.[direction]??await this.catalog.records('index',links[direction]))counts.set(row.category,(counts.get(row.category)??0)+1);
      return [...counts].map(([id,count])=>({id,count}));
    };
    const [recipes,uses]=await Promise.all([group('recipes'),group('uses')]);
    const categories=await this.catalog.records('categories',new Set([...recipes,...uses].map(row=>row.id)));
    const strings=await this.catalog.records('strings',categories.map(row=>row.name));
    return {links,recipes,uses,related:{categories,strings,items:[],fluids:[],textures:[],topics:[]} satisfies Related};
  }

  private readonly entries = memo(async () => {
    const rows: SearchEntry[] = [], encoder = new TextEncoder();
    let weight = 0;
    for await (const row of this.catalog.scan('browse')) {
      const { id, kind, registry, order, group, terms } = row;
      const entry = { id, kind, registry, order, group, terms };
      weight += encoder.encode(JSON.stringify(entry)).byteLength * 4;
      if (weight > 256 * 1024 * 1024) throw new Fault('index_limit', 'Catalog search index exceeds the lookup memory budget');
      rows.push(entry);
    }
    return rows.sort((left, right) => (left.order ?? Number.MAX_SAFE_INTEGER) - (right.order ?? Number.MAX_SAFE_INTEGER) || compare(left.id, right.id));
  });
  private readonly entryMap = memo(async () => new Map((await this.entries()).map(row => [row.id, row])));
  private readonly groups = memo(async () => new Map((await this.catalog.all('groups')).map(row => [row.id, row])));
  private readonly topicRows = memo(async () => (await this.catalog.all('topics')).sort((left, right) =>
    left.order - right.order || compare(left.name, right.name) || compare(left.id, right.id)));
  private readonly categoryNames = memo(async () => {
    const categories = await this.catalog.all('categories');
    const labels = await this.catalog.records('strings', new Set(categories.map(category => category.name)));
    const strings = new Map(labels.map(row => [row.id, row.text]));
    return new Map(categories.map(category => [category.id, strings.get(category.name)!]));
  });

  async facets(): Promise<Facets> {
    const mods = new Map<string, number>();
    for (const entry of await this.entries()) {
      const mod = namespace(entry.registry);
      if (mod) mods.set(mod, (mods.get(mod) ?? 0) + 1);
    }
    const groups = await this.groups();
    const labels = await this.catalog.records('strings', new Set([...groups.values()].flatMap(group => group.name ? [group.name] : [])));
    const text = new Map(labels.map(row => [row.id, row.text]));
    return {
      mods: [...mods].sort(([left], [right]) => compare(left, right)).map(([id, count]) => ({ id, count })),
      groups: [...groups.values()].sort((left, right) => left.order - right.order || compare(left.id, right.id))
        .map(group => ({ id: group.id, name: group.name ? text.get(group.name)! : '', count: group.members.length, collapsed: group.collapsed })),
    };
  }

  async items(options: Browse): Promise<Page<Entry>> {
    const [entries, groups] = await Promise.all([
      this.entries(), this.groups(),
    ]);
    const terms = options.query.toLocaleLowerCase('en-US').trim().split(/\s+/).filter(Boolean);
    const names = options.collapsed ? await this.entryMap() : null;
    const matches = (entry: SearchEntry): boolean => (options.kind === 'all' || entry.kind === options.kind)
      && (!options.mod || namespace(entry.registry).toLowerCase() === options.mod.toLowerCase())
      && (!options.group || entry.group === options.group) && terms.every(term => entry.terms.includes(term));
    const result: string[] = [];
    let total = 0;
    const folded = new Set<string>();
    for (const entry of entries) {
      if (!matches(entry)) continue;
      let selected = entry;
      if (options.collapsed && !options.group && entry.group && groups.get(entry.group)?.collapsed) {
        if (folded.has(entry.group)) continue;
        folded.add(entry.group);
        const representative = names?.get(groups.get(entry.group)!.representative);
        if (representative && matches(representative)) selected = representative;
      }
      if (total >= options.offset && result.length < options.limit) result.push(selected.id);
      total++;
    }
    return { rows: await this.catalog.records('browse', result), total, offset: options.offset, limit: options.limit };
  }

  async recipes(options: Search): Promise<Page<Recipe> & { recipeIds: string[]; categories: Array<{ id: string; count: number }> }> {
    const links = await this.catalog.record('links', options.item);
    const categories = new Map<string, number>();
    const terms = options.query.toLocaleLowerCase('en-US').trim().split(/\s+/).filter(Boolean);
    const [names, labels] = terms.length ? await Promise.all([this.entryMap(), this.categoryNames()]) : [null, null];
    const selected: string[] = [];
    const recipeIds: string[] = [];
    let total = 0;
    const ids = links[options.direction];
    {
      const summaries = !terms.length && this.catalog.directory ? (await this.catalog.directory(options.item))[options.direction]
        : await this.catalog.records('index', ids);
      for (const recipe of summaries) {
        categories.set(recipe.category, (categories.get(recipe.category) ?? 0) + 1);
        if (options.category && recipe.category !== options.category) continue;
        if (terms.length) {
          const summary=recipe as import('./store.ts').Row<'index'>;
          const search = [recipe.id, summary.owner, summary.handler, labels?.get(recipe.category) ?? '',
            ...summary.targets.map(id => names?.get(id)?.terms ?? '')].join(' ').toLocaleLowerCase('en-US');
          if (terms.some(term => !search.includes(term))) continue;
        }
        recipeIds.push(recipe.id);
        if (total >= options.offset && selected.length < options.limit) selected.push(recipe.id);
        total++;
      }
    }
    const result = await this.catalog.records('recipes', selected);
    for (const recipe of result) validateRecipe(recipe);
    return { rows: result, recipeIds, total, offset: options.offset, limit: options.limit,
      categories: Array.from(categories, ([id, count]) => ({ id, count })) };
  }

  async topics(options: TopicSearch): Promise<Page<Topic>> {
    const selected = options.item ? new Set((await this.catalog.record('links', options.item)).topics) : null;
    const terms = options.query.toLocaleLowerCase('en-US').trim().split(/\s+/).filter(Boolean);
    const rows: Topic[] = [];
    let total = 0;
    for (const topic of await this.topicRows()) {
      if (topic.kind !== options.kind || (selected && !selected.has(topic.id)) || terms.some(term => !topic.terms.includes(term))) continue;
      if (total >= options.offset && rows.length < options.limit) rows.push(topic);
      total++;
    }
    return { rows, total, offset: options.offset, limit: options.limit };
  }

  async oreGroup(id: string): Promise<{ group: OreGroup }> {
    return { group: await this.catalog.record('ore-groups', id) };
  }

  async oreMembers(id: string, offset: number, limit: number): Promise<Page<OreMember> & { related: Related }> {
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new Fault('invalid_query', 'Invalid ore membership page', 400);
    }
    const group = await this.catalog.record('ore-groups', id);
    const keys = Array.from({ length: Math.max(0, Math.min(limit, group.members - offset)) },
      (_, index) => `${id}.member_${(offset + index).toString(16).padStart(8, '0')}`);
    const rows = keys.length ? await this.catalog.records('ore-members', keys) : [];
    const related = await this.related([], [], { targets: [...new Set(rows.flatMap(row => row.display ? [row.display] : []))].map(id => ({ kind: 'item', id })) });
    return { rows, total: group.members, offset, limit, related };
  }

  async itemAspects(id: string): Promise<{ item: Item; aspects: Topic[]; related: Related }> {
    const item = await this.catalog.record('items', id);
    const aspects = await this.catalog.records('topics', (item.aspects ?? []).map(row => row.aspect));
    return { item, aspects, related: await this.related([], [], { topics: aspects }) };
  }

  private readonly aspectReferences = memo(async () => {
    const definitions = new Map<string, GeneticReferenceRow>();
    const members = new Map<string, GeneticReferenceRow[]>();
    let count = 0;
    for await (const row of this.catalog.scan('references')) {
      if (row.data.kind === 'aspectCombinationsDefinition') definitions.set(row.domain, row);
      else if (row.data.kind === 'aspectCombination') {
        const rows = members.get(row.data.aspect) ?? [];
        rows.push(row); members.set(row.data.aspect, rows);
      } else continue;
      if (++count > 16388) throw new Fault('reference_limit', 'Aspect reference catalogue exceeds query budget');
    }
    return { definitions, members };
  });

  async aspect(id: string): Promise<{ aspect: Aspect; components: Topic[]; combinations: Topic[]; references: GeneticReferenceRow[]; related: Related }> {
    const aspect = await this.catalog.record('aspects', id);
    const components = await this.catalog.records('topics', new Set(aspect.components));
    const index = await this.aspectReferences();
    const members = index.members.get(id) ?? [];
    const references = members.flatMap(row => {
      const definition = index.definitions.get(row.domain);
      if (!definition) throw new Fault('missing_reference', 'Aspect combination definition absent');
      return [definition, row];
    }).sort((a,b) => compare(a.domain,b.domain) || a.order-b.order);
    const domains = new Set(members.map(row => row.domain));
    const visibleDomains = new Set(members.filter(row => row.data.kind === 'aspectCombination' && row.data.visible).map(row => row.domain));
    const combinationIds = new Set<string>();
    for (const rows of index.members.values()) for (const row of rows) {
      if (visibleDomains.has(row.domain) && row.data.kind === 'aspectCombination' && row.data.visible
        && row.data.components.includes(id)) combinationIds.add(row.data.aspect);
    }
    const combinations = await this.catalog.records('topics', [...combinationIds].sort(compare));
    const categories: Category[] = [];
    if (domains.size) for await (const category of this.catalog.scan('categories')) {
      if (category.reference && domains.has(category.reference)) categories.push(category);
    }
    const related = await this.related([], categories.map(category => category.id), { topics: [...components,...combinations], texts: [aspect.name, aspect.description], images: aspect.icon ? [aspect.icon] : [] });
    return { aspect, components, combinations, references, related };
  }

  async research(id: string): Promise<{ research: Research; references: Topic[]; related: Related }> {
    const research = await this.catalog.record('research', id);
    const ids = new Set([...research.parents, ...research.hiddenParents, ...research.siblings].flatMap(link => link.id ? [link.id] : []));
    for (const amount of research.aspects) ids.add(amount.aspect);
    for (const aspect of research.aspectTriggers) ids.add(aspect);
    const references = await this.catalog.records('topics', ids);
    const related = await this.related([], [], { topics: references,
      targets: [...new Set([...research.itemTriggers.flatMap(clue => clue.matches), ...(research.icon ? [research.icon] : [])])].map(id => ({ kind: 'item', id })),
      texts: [research.name, research.text, research.categoryName], images: research.texture ? [research.texture] : [],
    });
    return { research, references, related };
  }

  async material(id: string): Promise<{ material: Material; components: Topic[]; related: Related }> {
    const material = await this.catalog.record('materials', id);
    const components = await this.catalog.records('topics', material.components.map(component => component.material));
    const related = await this.related([], [], { topics: components, targets: material.parts.map(part => part.target), texts: [material.name] });
    return { material, components, related };
  }

  async structure(id: string): Promise<{ structure: Structure; information:StructureInformation|null; related: Related }> {
    const structure = await this.catalog.record('structures', id);
    const targets = [structure.controller, ...structure.pieces.flatMap(piece => piece.rules.flatMap(rule => rule.placements ?? []))];
    const related = await this.related([], [], {
      targets: targets.map(id => ({ kind: 'item', id })),
      texts: [structure.name, ...structure.description, ...(structure.problem ? [structure.problem] : []),
        ...structure.variants.flatMap(variant => variant.problem ? [variant.problem] : [])],
    });
    return { structure, information:await this.structureReferences.information(id), related };
  }

  async structureComponents(id:string,offset:number,limit:number) {
    await this.catalog.record('structures',id);
    const page=await this.structureReferences.page(id,offset,limit);
    const ids=[...new Set(page.rows.flatMap(row=>row.data.items))];
    return {...page,related:await this.related([],[],{targets:ids.map(id=>({kind:'item' as const,id}))})};
  }

  async shapes(id: string, name: string, offset: number, limit: number): Promise<Page<Shape>> {
    const structure = await this.catalog.record('structures', id);
    const piece = structure.pieces.find(piece => piece.name === name);
    if (!piece) throw new Fault('not_found', 'Structure piece not found', 404);
    const rows = await this.catalog.records('shapes', piece.chunks.slice(offset, offset + limit));
    return { rows, total: piece.chunks.length, offset, limit };
  }

  async build(id: string): Promise<{ build: Build; blocks: Block[]; related: Related }> {
    const build = await this.catalog.record('builds', id);
    const blocks = await this.catalog.records('blocks', [...new Set(build.palette.map(entry => entry.block))]);
    const related = await this.related([], [], { targets: blocks.flatMap(block => block.item ? [{ kind: 'item', id: block.item }] : []),
      texts: [...build.notes, ...build.palette.flatMap(entry => entry.problem ? [entry.problem] : [])] });
    return { build, blocks, related };
  }

  async buildShapes(id: string, offset: number, limit: number): Promise<Page<Shape>> {
    const build = await this.catalog.record('builds', id);
    const rows = await this.catalog.records('shapes', build.chunks.slice(offset, offset + limit));
    return { rows, total: build.chunks.length, offset, limit };
  }

  async models(id: string, offset: number, limit: number): Promise<Page<Model> & { textures: Texture[] }> {
    const build = await this.catalog.record('builds', id);
    const ids = [...new Set(build.palette.flatMap(entry => entry.model ? [entry.model] : []))];
    const rows = await this.catalog.records('models', ids.slice(offset, offset + limit));
    const textures = await this.catalog.records('textures', [...new Set(rows.flatMap(model => model.faces.map(face => face.texture)))]);
    return { rows, textures, total: ids.length, offset, limit };
  }

  async circuit(id: string): Promise<{ circuit: Circuit; related: Related }> {
    const circuit = await this.catalog.record('circuits', id);
    const related = await this.related([], [], {
      targets: [...circuit.boards, ...circuit.steps.map(step => step.item)].map(id => ({ kind: 'item', id })),
      texts: [circuit.name, ...circuit.steps.flatMap(step => step.tier ? [step.tier.name] : [])],
    });
    return { circuit, related };
  }

  async species(id: string): Promise<{ species: Species; origins: number; crosses: number; related: Related }> {
    const [species, lineage] = await Promise.all([this.catalog.record('species', id), this.catalog.record('lineage', id)]);
    const related = await this.related([], [], {
      targets: [...species.members.map(member => member.item), ...species.products.map(product => product.item),
        ...species.specialties.map(product => product.item)].map(id => ({ kind: 'item', id })),
      texts: [species.name, species.description, ...(species.jubilance === null || species.jubilance === undefined ? [] : [species.jubilance]),
        ...species.genes.map(gene => gene.name)],
      values: geneValues(species.genes),
    });
    return { species, origins: lineage.origins.length, crosses: lineage.crosses.length, related };
  }

  async mutations(id: string, options: MutationSearch): Promise<Page<Mutation> & { species: Topic[]; related: Related }> {
    const lineage = await this.catalog.record('lineage', id);
    const ids = lineage[options.direction];
    const rows = await this.catalog.records('mutations', ids.slice(options.offset, options.offset + options.limit));
    const species = await this.catalog.records('topics', new Set(rows.flatMap(row => [...row.parents, row.result])));
    const related = await this.related([], [], {
      targets: species.flatMap(row => row.icon ? [row.icon] : []),
      texts: rows.flatMap(row => [...row.conditions, ...row.genes.map(gene => gene.name)]),
      values: rows.flatMap(row => geneValues(row.genes)),
    });
    return { rows, total: ids.length, offset: options.offset, limit: options.limit, species, related };
  }

  /** Hydrates page references in small batches, with an explicit per-response budget. */
  async related(recipes: Recipe[], categories: string[] = [], additions: { targets?: Reference[]; texts?: string[]; values?: PropertyValue[]; images?: string[]; topics?: Topic[] } = {}): Promise<Related> {
    const fmp=await Promise.all(recipes.filter(recipe=>recipe.process?.kind==='fmpMicroblock').map(recipe=>this.fmpPrograms.information(recipe)));
    const xu=await Promise.all(recipes.filter(recipe=>recipe.process?.kind==='xuMicroblock').map(recipe=>this.xuPrograms.information(recipe)));
    const items = new Set<string>(), fluids = new Set<string>(), strings = new Set<string>();
    const textures = new Set<string>(additions.images), categoryIds = new Set(categories);
    const topicRows = new Map((additions.topics ?? []).map(topic => [topic.id, topic]));
    const topicIds = new Set<string>();
    const budget = (): void => {
      if (items.size + fluids.size + strings.size + textures.size + categoryIds.size + topicIds.size + topicRows.size > 32768) {
        throw new Fault('result_limit', 'This page exceeds the reference budget; request a smaller page');
      }
    };
    const substance = (kind: 'item' | 'fluid', id: string): void => { (kind === 'item' ? items : fluids).add(id); };
    for(const material of fmp)substance('item',material.block);
    for (const target of additions.targets ?? []) substance(target.kind, target.id);
    for (const text of additions.texts ?? []) strings.add(text);
    const property = (value: PropertyValue): void => {
      if (value.kind === 'reference') substance(value.target.kind, value.target.id);
      if (value.kind === 'text') strings.add(value.text);
      if (value.kind === 'list') value.values.forEach(property);
      if (value.kind === 'map') Object.values(value.values).forEach(property);
    };
    for (const value of additions.values ?? []) property(value);
    for (const recipe of recipes) {
      validateRecipe(recipe);
      categoryIds.add(recipe.category);
      for (const note of recipe.notes ?? []) strings.add(note.text);
      if (recipe.gtNative) for (const reference of gtNativeReferences(recipe.gtNative)) {
        substance(reference.kind, reference.id); budget();
      }
      if(recipe.process?.kind==='botaniaPool')for(const observation of recipe.process.selection?.coercions??[]){substance('item',observation.input);budget();}
      if(recipe.process?.kind==='arcaneSpecial'){
        for(const id of Object.values(recipe.process.roles))substance('item',id);
        for(const id of Object.values(recipe.process.aspects))topicIds.add(id);
        budget();
      }
      if(recipe.process?.kind==='nativeInfusion'||recipe.process?.kind==='nativeRunic'){
        for(const state of recipe.process.pattern.states){substance('item',state.id);budget();}
        if(recipe.process.kind==='nativeInfusion')for(const aspect of [...recipe.process.baseAspects,...(recipe.process.randomAspects?.bases??[])]){topicIds.add(aspect.aspect);budget();}
      }
      if(recipe.process?.kind==='disguiseInfusion'){
        for(const state of recipe.process.states){substance('item',state.id);budget();}
      }
      if (recipe.process?.kind === 'railcraftBlast') {
        for (const fuel of recipe.process.fuel.allowed) { substance('item', fuel.item); budget(); }
      }
      if(recipe.process?.kind==='bloodAlchemy'||recipe.process?.kind==='logisticsSoldering'||recipe.process?.kind==='randomThingsImbuing'){
        substance('item',recipe.process.result.id);
        if(recipe.process.kind==='bloodAlchemy')for(const group of recipe.process.containers)for(const c of group)if(c){substance('item',c.id);budget();}
      }
      if (recipe.process?.kind === 'vat') {
        for (const c of recipe.process.extra) substance('item', c.id);
        if (recipe.process.zeroOutput) substance('fluid', recipe.process.zeroOutput);
      }
      if (recipe.process?.kind === 'sag') {
        const p = recipe.process;
        for (const list of [p.blocked, p.oreBlocked, ...p.earlier.map(e => e.choices), ...p.balls.map(b => b.choices)]) {
          for (const c of list) substance('item', c.id);
          budget();
        }
      }
      if (recipe.process?.kind === 'soul') {
        for (const prior of recipe.process.earlier) {
          substance('item',prior.soul.vessel);substance('item',prior.material.id);budget();
        }
      }
      if (recipe.process?.kind === 'rolling' || recipe.process?.kind === 'qed' || recipe.process?.kind === 'galaxyspace-assembly' || recipe.process?.kind === 'extremeCrafting') {
        for (const prior of recipe.process.earlier) for (const choices of prior.inputs) {
          for (const choice of choices) substance('item', choice.id);
          budget();
        }
      }
      if (recipe.process?.kind === 'extremeCrafting' || recipe.process?.kind === 'galaxyspace-assembly') {
        for (const repair of recipe.process.repair) { substance('item', repair.item); budget(); }
      }
      if (recipe.process?.kind === 'bannerPattern') {
        for (const dye of recipe.process.palette) { substance('item', dye.id); budget(); }
        for (const rule of recipe.process.rules) if (rule.catalyst) { substance('item', rule.catalyst); budget(); }
      }
      if (recipe.process?.kind === 'buildcraftRefinery') {
        for (const prior of recipe.process.earlier) for (const fluid of prior) { substance('fluid', fluid.id); budget(); }
        for (const tank of recipe.process.filling) for (const id of tank) { substance('fluid', id); budget(); }
      }
      if (recipe.process?.kind === 'inscriber') {
        for (const id of [recipe.process.top, recipe.process.bottom, recipe.process.namePress]) if (id) substance('item', id);
      }
      if (recipe.process?.kind === 'ic2Blast') {
        for (const slot of recipe.process.containers) for (const container of slot) {
          if (container) substance('item', container.id);
          budget();
        }
      }
      if (recipe.process?.kind === 'gtCrafting') {
        substance('item', recipe.process.prototype.id);
        substance('item', recipe.process.base.id);
      }
      if(recipe.process?.kind==='ic2Advanced')substance('item',recipe.process.prototype.id);
      if(recipe.process?.kind==='galacticraftRefinery')substance('fluid',recipe.process.normalizedOil);
      if(recipe.process?.kind==='witcheryDistillery'){
        substance('item',recipe.process.jar);
        for(const prototype of recipe.process.outputs)if(prototype)substance('item',prototype.id);
        for(const rule of [recipe.process,...recipe.process.earlier]){for(const reagent of rule.reagents)if(reagent)substance('item',reagent.item);budget();}
      }
      if(recipe.process?.kind==='witcheryNativeOven')for(const id of Object.values(recipe.process.roles))substance('item',id);
      if(recipe.process?.kind==='bloodmagic-meteor'){
        const p=recipe.process;
        for(const entry of [...p.ores,...p.filler,p.fallback,...p.reagents.flatMap(r=>r.filler)]){if(entry.id)substance('item',entry.id);budget();}
      }
      if(recipe.process?.kind==='chisel'){
        substance('item',recipe.process.target);
        for(const source of recipe.process.sources){substance('item',source.item);for(const target of source.targets)substance('item',target.item);budget();}
        for(const tool of recipe.process.tools){substance('item',tool.item);budget();}
      }
      if(recipe.process?.kind==='xuMicroblock')substance('item',recipe.process.prototype.id);
      if (recipe.magic) {
        for (const cost of recipe.magic.aspects) topicIds.add(cost.aspect);
        for (const aspect of Object.keys(recipe.magic.payment?.charges ?? {})) topicIds.add(aspect);
        for (const study of recipe.magic.research) if (study.id) topicIds.add(study.id);
      }
      for (const input of recipe.inputs) for (const choice of input.choices) {
        substance(input.kind, choice.id);
        if (choice.rule.kind === 'infusion') substance('item', choice.rule.template);
        if (choice.rule.kind === 'soul') substance('item',choice.rule.filter.vessel);
        if (choice.rule.kind === 'except') {
          for (const prior of choice.rule.exclude) substance('item', prior.id);
          budget();
        }
        for (const returned of choice.returns) substance(returned.kind, returned.id);
      }
      for (const output of recipe.outputs) {
        quantityBounds(recipe, output);
        substance(output.kind, output.id);
        if (output.change) {
          for (const sample of output.change.samples) substance('item', sample.id);
          if (output.change.action.kind === 'merge'||output.change.action.kind==='nativeInfusionMerge') substance('item', output.change.action.base.id);
          if (output.change.action.kind === 'craftingNbt') substance('item', output.change.action.base.id);
          if (output.change.action.kind === 'soul' || output.change.action.kind === 'floatingFlower' || output.change.action.kind === 'nativeFloatingFlower') substance('item',output.change.action.base);
          if ((output.change.action as { kind: 'filter'; base: { id: string } }).kind === 'filter') substance('item', (output.change.action as { base: { id: string } }).base.id);
        }
      }
      for (const field of Object.values(recipe.properties)) { strings.add(field.name); property(field.value); }
    }
    budget();
    for (const topic of await this.catalog.records('topics', [...topicIds].filter(id => !topicRows.has(id)))) topicRows.set(topic.id, topic);
    for (const topic of topicRows.values()) {
      if (topic.icon) substance(topic.icon.kind, topic.icon.id);
      if (topic.image) textures.add(topic.image);
    }
    const categoryRows = await this.catalog.records('categories', categoryIds);
    for (const category of categoryRows) {
      strings.add(category.name);
      for (const note of category.notes ?? []) strings.add(note.text);
      if (category.icon) substance(category.icon.kind, category.icon.id);
      category.machines.forEach(machine => substance(machine.kind, machine.id));
    }
    budget();
    const [itemRows, fluidRows] = await Promise.all([
      this.catalog.records('items', items),
      this.catalog.records('fluids', fluids),
    ]);
    if(recipes.some(r=>r.process?.kind==='nativeBotaniaPool')){
      const facts=new Map(itemRows.map(item=>[item.id,item]));
      for(const recipe of recipes)if(recipe.process?.kind==='nativeBotaniaPool'){
        const category=categoryRows.find(c=>c.id===recipe.category);
        if(!category)throw new Fault('invalid_pool','Missing native pool category');
        await this.poolPrograms.validate(recipe,category,facts);
      }
    }
    if(recipes.length){
      const facts=new Map(itemRows.map(item=>[item.id,item]));
      const fluidFacts=new Map(fluidRows.map(fluid=>[fluid.id,fluid]));
      for(const recipe of recipes) validateRecipe(recipe,facts,fluidFacts);
    }
    for (const item of itemRows) { strings.add(item.name); item.tooltip.forEach(line => strings.add(line)); if (item.icon) textures.add(item.icon); }
    for (const fluid of fluidRows) { strings.add(fluid.name); if (fluid.icon) textures.add(fluid.icon); }
    budget();
    const [textRows, textureRows] = await Promise.all([
      this.catalog.records('strings', strings),
      this.catalog.records('textures', textures),
    ]);
    if(recipes.some(recipe=>recipe.process?.kind==='botaniaRunic'&&(recipe.process.head||recipe.process.earlierHeads?.length))){
      const textFacts=new Map(textRows.map(text=>[text.id,text]));
      const itemFacts=new Map(itemRows.map(item=>[item.id,item]));
      for(const recipe of recipes)validateBotaniaRecipe(recipe,itemFacts,textFacts,this.catalog.manifest.locale);
    }
    return { items: itemRows, fluids: fluidRows, categories: categoryRows, strings: textRows, textures: textureRows, topics: [...topicRows.values()], ...(fmp.length?{fmp}: {}), ...(xu.length?{xu}: {}) };
  }
}

function geneValues(genes: Gene[]): PropertyValue[] { return genes.flatMap(gene => gene.value ? [gene.value] : []); }
