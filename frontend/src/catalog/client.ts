import { assertTable } from '@elysium/contracts';
import type { Category, Fluid, Item, Manifest, Table, Texture, View, Topic, Track } from '@elysium/contracts';
import { checkManifest, limits } from '@neonei/catalog/source';
import type { Page, Related, Items, Recipes, Detail, StructureDetail, AspectDetail, ResearchDetail, ItemAspects,
  Topics, MaterialDetail, CircuitDetail, SpeciesDetail, Mutations, MutationSearch, TopicSearch, Facets, Browse, Search } from '@neonei/catalog/source';
import { Atlas } from './atlas.ts';
import { ApiError, body, networkError, request } from './transport.ts';
import { Local } from '../offline/client.ts';
import type { Shape } from '@elysium/contracts';
import type { BuildDetail, ModelPage } from '@neonei/catalog/source';
export type { BuildDetail, ModelPage } from '@neonei/catalog/source';

export { ApiError } from './transport.ts';
export type { Page, Related, Items, Recipes, Detail, StructureDetail, AspectDetail, ResearchDetail, ItemAspects,
  Topics, MaterialDetail, CircuitDetail, SpeciesDetail, Mutations, MutationSearch, TopicSearch, Facets, Browse, Search } from '@neonei/catalog/source';
type Rows = { [T in Table as T['kind']]: T['records'][number] };
export interface OpenOptions { signal?: AbortSignal; base?: string; offline?: boolean }

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError('invalid_response', '接口返回的数据结构不正确');
  return value as Record<string, unknown>;
}

function integer(value: unknown, minimum = 0): asserts value is number {
  if (!Number.isSafeInteger(value) || Number(value) < minimum) throw new ApiError('invalid_response', '接口返回了无效的分页或计数');
}

function table<K extends Table['kind']>(kind: K, records: unknown): Rows[K][] {
  try { assertTable({ kind, records }); }
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
    views: table('views', data.views), strings: table('strings', data.strings), textures: table('textures', data.textures), topics: table('topics', data.topics), tracks: table('tracks', data.tracks) };
}

/** One immutable snapshot owns every request and texture used by a page session. */
export class Catalog extends EventTarget {
  readonly manifest: Manifest;
  readonly atlas: Atlas;
  private readonly base: string;
  private readonly origin: string;
  private readonly controller = new AbortController();
  private local: Local | null;
  private openingLocal: Promise<Local> | null = null;

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
  }

  get offline(): boolean { return this.local !== null; }

  static async open(id = '', options: OpenOptions = {}): Promise<Catalog> {
    const { signal, offline = false, base = '/api' } = options;
    if (id && !/^[a-f0-9]{64}$/.test(id)) throw new ApiError('invalid_id', '数据集链接无效');
    if (!base.endsWith('/api')) throw new ApiError('invalid_url', 'API 地址必须以 /api 结尾');
    if (offline || navigator.onLine === false) {
      const local = await Local.open(id, signal, base);
      return new Catalog(local.manifest, base, local);
    }
    let data: unknown;
    try { data = await request(base + '/catalog' + (id ? '/' + id : ''), signal, limits.manifest); }
    catch (error) {
      if (!networkError(error) || signal?.aborted) throw error;
      const local = await Local.open(id, signal, base);
      return new Catalog(local.manifest, base, local);
    }
    let manifest: Manifest;
    try { manifest = await checkManifest(data, id); }
    catch { throw new ApiError('invalid_catalog', '数据集清单不符合当前契约或内容身份'); }
    return new Catalog(manifest, base);
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

  private async get(endpoint: string, signal?: AbortSignal): Promise<unknown> {
    const active = signal ? AbortSignal.any([signal, this.controller.signal]) : this.controller.signal;
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
    return result;
  }

  async recipes(options: Search, signal?: AbortSignal): Promise<Recipes> {
    const data = object(await this.get('/recipes?' + params(options), signal));
    if (!Array.isArray(data.categories)) throw new ApiError('invalid_response', '配方分类数据缺失');
    const categories = data.categories.map(value => {
      const row = object(value); integer(row.count);
      if (typeof row.id !== 'string') throw new ApiError('invalid_response', '配方分类数据无效');
      return { id: row.id, count: row.count };
    });
    return { ...page(data, 'recipes'), categories, related: related(data.related) };
  }

  async recipe(id: string, signal?: AbortSignal): Promise<Detail> {
    const data = object(await this.get('/recipes/' + encodeURIComponent(id), signal));
    return { recipe: table('recipes', [data.recipe])[0]!, related: related(data.related) };
  }

  async topics(options: TopicSearch, signal?: AbortSignal): Promise<Topics> {
    const data = object(await this.get('/topics?' + params(options), signal));
    return { ...page(data, 'topics'), related: related(data.related) };
  }

  async itemAspects(id: string, signal?: AbortSignal): Promise<ItemAspects> {
    const data = object(await this.get('/items/' + encodeURIComponent(id) + '/aspects', signal));
    return { item: table('items', [data.item])[0]!, aspects: table('topics', data.aspects), related: related(data.related) };
  }

  async aspect(id: string, signal?: AbortSignal): Promise<AspectDetail> {
    const data = object(await this.get('/aspects/' + encodeURIComponent(id), signal));
    return { aspect: table('aspects', [data.aspect])[0]!, components: table('topics', data.components), related: related(data.related) };
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
    return { structure: table('structures', [data.structure])[0]!, related: related(data.related) };
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

  async record<K extends Table['kind']>(kind: K, id: string, signal?: AbortSignal): Promise<Rows[K]> {
    return table(kind, [await this.get('/records/' + kind + '/' + encodeURIComponent(id), signal)])[0]!;
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

  close(): void { this.controller.abort(); this.atlas.close(); this.local?.close(); }
}

function params(options: Browse | Search | TopicSearch | MutationSearch | { piece: string; offset: number; limit: number }): string {
  return new URLSearchParams(Object.entries(options).map(([key, value]) => [key, String(value)])).toString();
}

export class Records {
  readonly items: Map<string, Item>;
  readonly fluids: Map<string, Fluid>;
  readonly categories: Map<string, Category>;
  readonly views: Map<string, View>;
  readonly tracks: Map<string, Track>;
  readonly strings: Map<string, string>;
  readonly textures: Map<string, Texture>;
  readonly topics: Map<string, Topic>;
  constructor(data: Related) {
    this.items = new Map(data.items.map(row => [row.id, row]));
    this.fluids = new Map(data.fluids.map(row => [row.id, row]));
    this.categories = new Map(data.categories.map(row => [row.id, row]));
    this.views = new Map(data.views.map(row => [row.id, row]));
    this.tracks = new Map(data.tracks.map(row => [row.id, row]));
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
