import type { RouteLocationNormalized, RouteLocationRaw } from 'vue-router';

export const topicGroups = [
  { label: '材料', routes: [{ name: 'materials', label: '材料与部件' }, { name: 'ores', label: '矿辞' }, { name: 'underground-fluids', label: '地下流体' }, { name: 'gt-minerals', label: '矿脉与小矿石' }, { name: 'bartworks-ores', label: 'Bartworks 矿物' }, { name: 'circuits', label: '电路路线' }, { name: 'tool-materials', label: '工具材料' }] },
  { label: '遗传', routes: [{ name: 'bees', label: '蜜蜂与育种' }, { name: 'bee-tree', label: '蜜蜂育种树' }, { name: 'trees', label: '树木' }, { name: 'butterflies', label: '蝴蝶' }, { name: 'flowers', label: '花卉' }, { name: 'genetic-database', label: '基因数据库' }, { name: 'forestry-info', label: '生产与突变' }] },
  { label: '魔法', routes: [{ name: 'aspects', label: '要素' }, { name: 'studies', label: '研究' }, { name: 'lexicon', label: '植物魔法辞典' }] },
  { label: '结构', routes: [{ name: 'structures', label: '多方块' }, { name: 'draconic-reactor', label: '龙之进化反应堆' }] },
  { label: '交易', routes: [{ name: 'villager-trades', label: '村民交易' }] },
  { label: '任务', routes: [{ name: 'quests', label: '任务资料' }] },
  {label:'说明',routes:[{name:'information',label:'物品说明'},{name:'forge-registry',label:'Forge 注册资料'},{name:'usage-queries',label:'元件内容与用途文档'}]},
  {label:'关联',routes:[{name:'diagrams',label:'GT 关系与资料'}]},
  {label:'存储',routes:[{name:'ender-storage',label:'末影存储'}]},
  { label: '燃料', routes: [{ name: 'furnace-fuels', label: '熔炉燃料' }] },
  { label: '动态合成', routes: [{name:'projectblue',label:'控制面板与控件'}, { name: 'fireworks', label: '烟花规则' },{ name: 'lathe', label: 'IC2 车床' }] },
  { label: '生物', routes: [{ name: 'mobs', label: '生物与掉落' }, { name: 'infernal-drops', label: '强化生物掉落' }] },
] as const;

export function snapshotQuery(query: RouteLocationNormalized['query']) {
  return { ...(query.catalog ? { catalog: query.catalog } : {}), ...(query.offline ? { offline: query.offline } : {}), ...(query.lang ? { lang: query.lang } : {}) };
}

export function itemLocation(itemId: string, query: RouteLocationNormalized['query'], tab: 'usedIn' | 'producedBy' = 'producedBy'): RouteLocationRaw {
  return { name: 'home', query: { ...snapshotQuery(query), item: itemId, direction: tab === 'usedIn' ? 'uses' : 'recipes' } };
}

export function recipeDirection(query: RouteLocationNormalized['query']): 'recipes' | 'uses' {
  if (query.mode === 'u' || query.mode === 'r') return query.mode === 'u' ? 'uses' : 'recipes';
  if (query.tab === 'usedIn' || query.tab === 'producedBy') return query.tab === 'usedIn' ? 'uses' : 'recipes';
  return query.direction === 'uses' ? 'uses' : 'recipes';
}

export type RecipeIntent =
  | { kind: 'entry'; direction: 'recipes' | 'uses' }
  | { kind: 'item' | 'fluid' | 'recipe' | 'invalid'; id: string; direction: 'recipes' | 'uses' };

/** A target is an exact record identity, never a registry-name or output-item guess. */
export function readRecipeIntent(query: RouteLocationNormalized['query']): RecipeIntent | null {
  const direction = recipeDirection(query);
  if ('item' in query || 'recipe' in query) {
    const target = 'recipe' in query ? query.recipe : query.item;
    if (('item' in query && 'recipe' in query) || typeof target !== 'string') return { kind: 'invalid', id: '', direction };
    const kind = 'recipe' in query ? 'recipe' : target.startsWith('fluid_') ? 'fluid' : 'item';
    return { kind: new RegExp(`^${kind}_[a-f0-9]{64}$`).test(target) ? kind : 'invalid', id: target, direction };
  }
  return query.presentation === 'recipe' ? { kind: 'entry', direction } : null;
}

/** Preserve public links, including snapshot identity and any selected topic. */
export function legacyWorkspaceLocation(to: Pick<RouteLocationNormalized, 'path' | 'query' | 'hash'> & { params?: RouteLocationNormalized['params'] }): RouteLocationRaw {
  if (/^\/(?:recipe|entry|oracle|recipe-by-id)(?:\/|$)/.test(to.path)
    || (to.path === '/' && ('item' in to.query || 'recipe' in to.query || to.query.presentation === 'recipe'))) {
    const query: RouteLocationNormalized['query'] = { ...to.query, direction: recipeDirection(to.query) };
    if (to.path.startsWith('/recipe-by-id/')) {
      delete query.item;
      query.recipe = to.params?.recipeId ?? '';
    } else if (to.path !== '/') {
      delete query.recipe;
      if (to.params?.itemId !== undefined) query.item = to.params.itemId;
    }
    if ('item' in query || 'recipe' in query) delete query.presentation;
    else query.presentation = 'recipe';
    return { name: 'home', query, hash: to.hash };
  }
  if (to.path === '/gt-diagrams') {
    const material = to.query.tab === 'materials' || typeof to.query.materialId === 'string';
    const id = material ? to.query.materialId : to.query.circuitId;
    const direct = typeof id === 'string' && id.startsWith(material ? 'material_' : 'circuit_');
    return { name: direct ? (material ? 'material' : 'circuit') : (material ? 'materials' : 'circuits'),
      ...(direct ? { params: { id } } : {}), query: { ...to.query, ...(typeof id === 'string' ? { legacy: id } : {}) }, hash: to.hash };
  }
  if (to.path === '/forestry-bee-tree') {
    const id = to.query.species ?? to.query.uid;
    return { name: typeof id === 'string' && id.startsWith('species_') ? 'bee' : 'bees',
      ...(typeof id === 'string' && id.startsWith('species_') ? { params: { id } } : {}),
      query: { ...to.query, view: 'tree', ...(typeof id === 'string' ? { legacy: id } : {}) }, hash: to.hash };
  }
  return { name: 'home', query: { ...to.query, settings: '1' }, hash: to.hash };
}
