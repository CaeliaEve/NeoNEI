import { collections, topicKinds, type Entry, type Recipe, type Texture, type TopicKind } from '@elysium/contracts';
import { Catalog, Fault, type Collection } from './store.ts';
import { Query, type Page, type Related } from './query.ts';

export type Items = Page<Entry> & { textures: Texture[] };
export type Recipes = Page<Recipe> & { categories: Array<{ id: string; count: number }>; related: Related };
export interface Detail { recipe: Recipe; related: Related }
export type StructureDetail = Awaited<ReturnType<Query['structure']>>;
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

/** The same read-only routes are evaluated by Express and by the offline worker. */
export class Api {
  readonly catalog: Catalog;
  private readonly query: Query;
  constructor(catalog: Catalog) { this.catalog = catalog; this.query = new Query(catalog); }

  async read(parts: readonly string[], parameters = new URLSearchParams()): Promise<unknown> {
    if (parts.length > 4 || parts.some(part => !part || part.length > 256)) throw new Fault('invalid_url', 'Invalid catalog URL', 400);
    const [name, id, action] = parts;
    const field = (key: string): string => text(parameters, key);
    const offset = (): number => integer(parameters, 'offset', 0, 10000000);
    const limit = (initial: number, maximum: number): number => integer(parameters, 'limit', initial, maximum);
    const query = this.query, catalog = this.catalog;
    if (parts.length === 1) {
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
        return { ...result, related: await query.related(result.rows, result.categories.map(category => category.id)) } satisfies Recipes;
      }
      if (name === 'topics') {
        const value = field('kind');
        if (!topicKinds.includes(value as TopicKind)) throw new Fault('invalid_query', 'Unknown topic kind', 400);
        const result = await query.topics({ kind: value as TopicKind, item: field('item'), query: field('query'), offset: offset(), limit: limit(20, 100) });
        return { ...result, related: await query.related([], [], { topics: result.rows }) } satisfies Topics;
      }
    }
    if (parts.length === 2 && id) {
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
    }
    if (parts.length === 3 && id) {
      if (name === 'items' && action === 'aspects') return query.itemAspects(id);
      if (name === 'structures' && action === 'shapes') return query.shapes(id, field('piece'), offset(), limit(4, 8));
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
