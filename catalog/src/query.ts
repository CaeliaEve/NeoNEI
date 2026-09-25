import type { Entry, Recipe, Category, PropertyValue, Item, Fluid, View, Text, Texture, Reference, Topic, TopicKind, Material, Circuit, Species, Mutation, Gene, Track } from '@elysium/contracts';
import { Catalog, Fault } from './store.ts';
import { quantityBounds } from './quantity.ts';
import type { Structure, Shape, Build, Block, Model } from '@elysium/contracts';
import type { Aspect, Research } from '@elysium/contracts';

export interface Page<T> { rows: T[]; total: number; offset: number; limit: number }
export interface Browse { query: string; mod: string; kind: 'all' | 'item' | 'fluid'; group: string; collapsed: boolean; offset: number; limit: number }
export interface Search { item: string; direction: 'recipes' | 'uses'; category: string; query: string; offset: number; limit: number }
export interface TopicSearch { kind: TopicKind; item: string; query: string; offset: number; limit: number }
export interface MutationSearch { direction: 'origins' | 'crosses'; offset: number; limit: number }
export interface Related { items: Item[]; fluids: Fluid[]; categories: Category[]; views: View[]; strings: Text[]; textures: Texture[]; topics: Topic[]; tracks: Track[] }
export interface Facets { mods: Array<{ id: string; count: number }>; groups: Array<{ id: string; name: string; count: number; collapsed: boolean }> }

function namespace(registry: string): string { return registry.includes(':') ? registry.split(':', 1)[0]! : ''; }
function compare(left: string, right: string): number { return left < right ? -1 : Number(left > right); }

function memo<T>(read: () => Promise<T>): () => Promise<T> {
  let value: Promise<T> | undefined;
  return () => value ??= read().catch(error => { value = undefined; throw error; });
}

/** Per-snapshot query state; a pointer change cannot mix records from different catalogs. */
export class Query {
  readonly catalog: Catalog;
  constructor(catalog: Catalog) { this.catalog = catalog; }

  private readonly entries = memo(async () => (await this.catalog.all('browse')).sort((left, right) =>
    (left.order ?? Number.MAX_SAFE_INTEGER) - (right.order ?? Number.MAX_SAFE_INTEGER) || compare(left.id, right.id)));
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
    const matches = (entry: Entry): boolean => (options.kind === 'all' || entry.kind === options.kind)
      && (!options.mod || namespace(entry.registry).toLowerCase() === options.mod.toLowerCase())
      && (!options.group || entry.group === options.group) && terms.every(term => entry.terms.includes(term));
    const result: Entry[] = [];
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
      if (total >= options.offset && result.length < options.limit) result.push(selected);
      total++;
    }
    return { rows: result, total, offset: options.offset, limit: options.limit };
  }

  async recipes(options: Search): Promise<Page<Recipe> & { categories: Array<{ id: string; count: number }> }> {
    const links = await this.catalog.record('links', options.item);
    const categories = new Map<string, number>();
    const terms = options.query.toLocaleLowerCase('en-US').trim().split(/\s+/).filter(Boolean);
    const [names, labels] = terms.length ? await Promise.all([this.entryMap(), this.categoryNames()]) : [null, null];
    const selected: string[] = [];
    let total = 0;
    const ids = links[options.direction];
    for (let offset = 0; offset < ids.length; offset += 128) {
      const summaries = await this.catalog.records('index', ids.slice(offset, offset + 128));
      for (const recipe of summaries) {
        categories.set(recipe.category, (categories.get(recipe.category) ?? 0) + 1);
        if (options.category && recipe.category !== options.category) continue;
        if (terms.length) {
          const search = [recipe.id, recipe.owner, recipe.handler, labels?.get(recipe.category) ?? '',
            ...recipe.targets.map(id => names?.get(id)?.terms ?? '')].join(' ').toLocaleLowerCase('en-US');
          if (terms.some(term => !search.includes(term))) continue;
        }
        if (total >= options.offset && selected.length < options.limit) selected.push(recipe.id);
        total++;
      }
    }
    const result = await this.catalog.records('recipes', selected);
    return { rows: result, total, offset: options.offset, limit: options.limit,
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

  async itemAspects(id: string): Promise<{ item: Item; aspects: Topic[]; related: Related }> {
    const item = await this.catalog.record('items', id);
    const aspects = await this.catalog.records('topics', (item.aspects ?? []).map(row => row.aspect));
    return { item, aspects, related: await this.related([], [], { topics: aspects }) };
  }

  async aspect(id: string): Promise<{ aspect: Aspect; components: Topic[]; related: Related }> {
    const aspect = await this.catalog.record('aspects', id);
    const components = await this.catalog.records('topics', new Set(aspect.components));
    const related = await this.related([], [], { topics: components, texts: [aspect.name, aspect.description], images: aspect.icon ? [aspect.icon] : [] });
    return { aspect, components, related };
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

  async structure(id: string): Promise<{ structure: Structure; related: Related }> {
    const structure = await this.catalog.record('structures', id);
    const targets = [structure.controller, ...structure.pieces.flatMap(piece => piece.rules.flatMap(rule => rule.placements ?? []))];
    const related = await this.related([], [], {
      targets: targets.map(id => ({ kind: 'item', id })),
      texts: [structure.name, ...structure.description, ...(structure.problem ? [structure.problem] : []),
        ...structure.variants.flatMap(variant => variant.problem ? [variant.problem] : [])],
    });
    return { structure, related };
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
      texts: [species.name, species.description, ...species.genes.map(gene => gene.name)],
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
    const items = new Set<string>(), fluids = new Set<string>(), strings = new Set<string>();
    const textures = new Set<string>(additions.images), views = new Set<string>(), categoryIds = new Set(categories);
    const topicRows = new Map((additions.topics ?? []).map(topic => [topic.id, topic]));
    const topicIds = new Set<string>(), tracks = new Set<string>();
    const budget = (): void => {
      if (items.size + fluids.size + strings.size + textures.size + views.size + categoryIds.size + topicIds.size + topicRows.size + tracks.size > 32768) {
        throw new Fault('result_limit', 'This page exceeds the reference budget; request a smaller page');
      }
    };
    const substance = (kind: 'item' | 'fluid', id: string): void => { (kind === 'item' ? items : fluids).add(id); };
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
      categoryIds.add(recipe.category);
      if (recipe.view) views.add(recipe.view);
      if (recipe.magic) {
        for (const cost of recipe.magic.aspects) topicIds.add(cost.aspect);
        for (const aspect of Object.keys(recipe.magic.payment?.charges ?? {})) topicIds.add(aspect);
        for (const study of recipe.magic.research) if (study.id) topicIds.add(study.id);
      }
      for (const input of recipe.inputs) for (const choice of input.choices) {
        substance(input.kind, choice.id);
        for (const returned of choice.returns) substance(returned.kind, returned.id);
      }
      for (const output of recipe.outputs) {
        quantityBounds(recipe, output);
        substance(output.kind, output.id);
        if (output.change) {
          for (const sample of output.change.samples) substance('item', sample.id);
          if (output.change.action.kind === 'merge') substance('item', output.change.action.base.id);
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
      if (category.icon) substance(category.icon.kind, category.icon.id);
      category.machines.forEach(machine => substance(machine.kind, machine.id));
      if (category.view) views.add(category.view);
    }
    budget();
    const [itemRows, fluidRows, viewRows] = await Promise.all([
      this.catalog.records('items', items),
      this.catalog.records('fluids', fluids),
      this.catalog.records('views', views),
    ]);
    for (const item of itemRows) { strings.add(item.name); item.tooltip.forEach(line => strings.add(line)); if (item.icon) textures.add(item.icon); }
    for (const fluid of fluidRows) { strings.add(fluid.name); if (fluid.icon) textures.add(fluid.icon); }
    for (const view of viewRows) for (const element of view.elements) {
      if (element.kind === 'sprite' || element.kind === 'clip') textures.add(element.asset);
      if (element.kind === 'clip') tracks.add(element.track);
      if (element.kind === 'text') strings.add(element.text);
      if (element.kind === 'tooltip') element.lines.forEach(line => strings.add(line));
    }
    budget();
    const [textRows, textureRows, trackRows] = await Promise.all([
      this.catalog.records('strings', strings),
      this.catalog.records('textures', textures),
      this.catalog.records('tracks', tracks),
    ]);
    return { items: itemRows, fluids: fluidRows, categories: categoryRows, views: viewRows, strings: textRows, textures: textureRows, topics: [...topicRows.values()], tracks: trackRows };
  }
}

function geneValues(genes: Gene[]): PropertyValue[] { return genes.flatMap(gene => gene.value ? [gene.value] : []); }
