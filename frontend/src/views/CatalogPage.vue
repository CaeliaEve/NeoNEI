<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { Entry, Texture } from '@elysium/contracts';
import { Records, required, type Detail, type Facets, type Items, type Recipes } from '../catalog/client.ts';
import { plain } from '../catalog/format.ts';
import { useRequest } from '../state/request.ts';
import { useCatalog } from '../state/catalog.ts';
import { usePreferences, type Saved } from '../state/preferences.ts';
import GameText from '../components/GameText.vue';
import Icon from '../components/Icon.vue';
import ItemLink from '../components/ItemLink.vue';
import Pager from '../components/Pager.vue';
import Recipe from '../components/Recipe.vue';
import SiteHeader from '../components/SiteHeader.vue';
import AspectBar from '../components/AspectBar.vue';

const router = useRouter(), route = useRoute();
const { preferences, storageError, remember, bookmark } = usePreferences();
const settings = ref<HTMLDialogElement | null>(null), searchInput = ref<HTMLInputElement | null>(null);
const query = ref(''), mod = ref(''), kind = ref<'all' | 'item' | 'fluid'>('all'), group = ref(''), offset = ref(0);
const category = ref(''), recipeQuery = ref(''), recipeOffset = ref(0);
const { value: facets, error: facetsError, run: loadFacets, clear: clearFacets } = useRequest<Facets>();
const { value: items, error: itemsError, loading: itemsLoading, run: loadItems, clear: clearItems, cancel: cancelItems } = useRequest<Items>();
const { value: entry, error: entryError, run: loadEntry, clear: clearEntry } = useRequest<Entry>();
const { value: recipes, error: recipesError, loading: recipesLoading, run: loadRecipes, clear: clearRecipes } = useRequest<Recipes>();
const { value: detail, error: detailError, loading: detailLoading, run: loadDetail, clear: clearDetail } = useRequest<Detail>();
const snapshot = computed(() => typeof route.query.catalog === 'string' ? route.query.catalog : '');
const { catalog, opening, error: catalogError, offline, open } = useCatalog(snapshot);
const itemId = computed(() => typeof route.params.itemId === 'string' ? route.params.itemId : '');
const recipeId = computed(() => typeof route.params.recipeId === 'string' ? route.params.recipeId : '');
const direction = computed(() => route.query.direction === 'uses' ? 'uses' : 'recipes');
const records = computed(() => {
  const data = recipeId.value ? detail.value?.related : recipes.value?.related;
  return data ? new Records(data) : null;
});
const shownRecipes = computed(() => recipeId.value ? (detail.value ? [detail.value.recipe] : []) : recipes.value?.rows ?? []);
const textures = computed(() => new Map<string, Texture>(items.value?.textures.map(texture => [texture.id, texture]) ?? []));
const groups = computed(() => new Map(facets.value?.groups.map(row => [row.id, row]) ?? []));
const bookmarked = computed(() => entry.value && catalog.value
  ? preferences.bookmarks.some(row => row.catalog === catalog.value!.manifest.id && row.id === entry.value!.id) : false);
watch(catalog, session => {
  clearFacets(); clearItems(); clearEntry(); clearRecipes(); clearDetail();
  offset.value = 0; recipeOffset.value = 0; category.value = '';
  if (session) void loadFacets(signal => session.facets(signal));
}, { flush: 'sync' });
watch([query, mod, kind, group, () => preferences.collapsed, () => preferences.limit], () => { offset.value = 0; });
watch([catalog, query, mod, kind, group, offset, () => preferences.limit, () => preferences.collapsed], (_value, _old, cleanup) => {
  cancelItems();
  const session = catalog.value;
  if (!session) return;
  const timer = setTimeout(() => void loadItems(signal => session.items({ query: query.value, mod: mod.value, kind: kind.value,
    group: group.value, collapsed: preferences.collapsed, offset: offset.value, limit: preferences.limit }, signal)), query.value ? 140 : 0);
  cleanup(() => clearTimeout(timer));
}, { immediate: true });
watch([catalog, itemId], () => {
  clearEntry();
  const session = catalog.value, id = itemId.value;
  if (session && id) void loadEntry(async signal => {
    const result = await session.record('browse', id, signal);
    if (!signal.aborted) remember(session.manifest.id, result);
    return result;
  });
}, { immediate: true });
watch([itemId, direction], () => { clearRecipes(); category.value = ''; recipeQuery.value = ''; recipeOffset.value = 0; });
watch([category, recipeQuery], () => { recipeOffset.value = 0; });
watch([catalog, itemId, direction, category, recipeQuery, recipeOffset, recipeId], () => {
  clearDetail();
  const session = catalog.value;
  if (!session) return;
  if (recipeId.value) {
    clearRecipes();
    void loadDetail(signal => session.recipe(recipeId.value, signal));
  } else if (itemId.value) {
    void loadRecipes(signal => session.recipes({ item: itemId.value, direction: direction.value, category: category.value,
      query: recipeQuery.value, offset: recipeOffset.value, limit: 4 }, signal));
  } else clearRecipes();
}, { immediate: true });

function select(id: string, mode: 'recipes' | 'uses' = 'recipes', idOfCatalog = catalog.value?.manifest.id): void {
  if (idOfCatalog) void router.push({ name: 'entry', params: { itemId: id }, query: { catalog: idOfCatalog, direction: mode } });
}
function showRecipe(id: string): void {
  if (catalog.value) void router.push({ name: 'recipe', params: { recipeId: id }, query: { catalog: catalog.value.manifest.id } });
}
function saved(row: Saved): void { select(row.id, 'recipes', row.catalog); }
function reset(): void { query.value = ''; mod.value = ''; kind.value = 'all'; group.value = ''; }
function refresh(): void { if (snapshot.value) void router.push({ name: 'home' }); else void open(''); settings.value?.close(); }
function title(row: Entry): string { return [plain(row.name), row.registry, ...row.tooltip.map(plain)].join('\n'); }
function categoryName(id: string): string { return records.value ? records.value.text(required(records.value.categories, id).name) : ''; }
function shortcut(event: KeyboardEvent): void {
  if (event.key !== '/' || event.ctrlKey || event.altKey || event.metaKey || settings.value?.open) return;
  const target = event.target as HTMLElement | null;
  if (target?.closest('input, textarea, select, [contenteditable=true], dialog[open]')) return;
  event.preventDefault(); searchInput.value?.focus();
}
window.addEventListener('keydown', shortcut);
onBeforeUnmount(() => window.removeEventListener('keydown', shortcut));
</script>

<template>
  <div class="catalog-page">
    <SiteHeader :catalog="catalog?.manifest.id" :offline="offline"><button type="button" class="quiet" @click="settings?.showModal()" aria-label="打开设置">设置</button></SiteHeader>

    <section v-if="opening" class="state-panel" role="status"><span class="eyebrow">CATALOG</span><h1>正在读取数据集</h1><p>加载物品、配方和纹理索引。</p></section>
    <section v-else-if="catalogError" class="state-panel error" role="alert"><h1>数据集无法加载</h1><p>{{ catalogError }}</p><button type="button" @click="open()">重试</button></section>
    <template v-else-if="catalog">
      <aside v-if="catalog.manifest.scope === 'selection'" class="notice">当前数据集只包含选定处理器的配方，不代表完整整合包。</aside>
      <div class="workspace">
        <section class="browser-panel panel">
          <header class="panel-heading"><div><span class="eyebrow">CATALOG</span><h1>物品浏览</h1></div><span class="subtle">{{ (catalog.count('items') + catalog.count('fluids')).toLocaleString('zh-CN') }} 个条目</span></header>
          <label class="search-field"><span aria-hidden="true">⌕</span><input ref="searchInput" v-model="query" type="search" aria-label="搜索物品"
            placeholder="名称、注册名或拼音…" maxlength="256" autocomplete="off" /><kbd>/</kbd></label>
          <div class="filters">
            <select v-model="kind" aria-label="条目类型"><option value="all">全部类型</option><option value="item">物品</option><option value="fluid">流体</option></select>
            <select v-model="mod" aria-label="筛选模组"><option value="">全部模组</option><option v-for="row in facets?.mods" :key="row.id" :value="row.id">{{ row.id }} · {{ row.count }}</option></select>
            <label class="check"><input v-model="preferences.collapsed" type="checkbox" />折叠分组</label>
          </div>
          <div v-if="group" class="group-filter"><span>{{ groups.get(group)?.name || '选定分组' }}</span><button type="button" @click="group = ''">退出分组 ×</button></div>
          <p v-if="facetsError" class="inline-error" role="alert">筛选信息：{{ facetsError }} <button type="button" @click="loadFacets(signal => catalog!.facets(signal))">重试</button></p>
          <div v-if="itemsError" class="state-panel error" role="alert"><h2>搜索失败</h2><p>{{ itemsError }}</p><button type="button" @click="open()">重试</button></div>
          <div v-else-if="!items" class="grid-loading" role="status">正在读取物品…</div>
          <template v-else>
            <div v-if="!items.rows.length" class="state-panel empty"><h2>没有匹配的条目</h2><p>试试其他名称、拼音或模组。</p><button type="button" @click="reset">清除筛选</button></div>
            <div v-else class="item-grid" :class="{ busy: itemsLoading }" :aria-busy="itemsLoading" :style="{ '--cell-size': preferences.size + 'px' }">
              <div v-for="row in items.rows" :key="row.id" class="browser-cell" :class="{ selected: row.id === itemId }">
                <button type="button" class="item-button" :title="title(row)" :aria-label="plain(row.name)" @click="select(row.id)"
                  @contextmenu.prevent="select(row.id, 'uses')" @keydown.r.prevent="select(row.id)" @keydown.u.prevent="select(row.id, 'uses')">
                  <Icon :atlas="catalog.atlas" :texture="row.icon ? required(textures, row.icon) : null" :width="preferences.size - 12"
                    :height="preferences.size - 12" :animate="preferences.animate" :label="plain(row.name)" />
                </button>
                <button v-if="row.group && !group && preferences.collapsed && groups.get(row.group)?.collapsed" class="group-badge" type="button"
                  :title="groups.get(row.group)?.name" :aria-label="'展开分组 ' + (groups.get(row.group)?.name || plain(row.name))" @click="group = row.group!">
                  {{ groups.get(row.group)?.count }}<span>+</span></button>
              </div>
            </div>
            <Pager :total="items.total" :offset="items.offset" :limit="items.limit" :busy="itemsLoading" label="物品" @change="offset = $event" />
          </template>
          <footer class="browser-hint">左键 / R 查看配方 <span>·</span> 右键 / U 查看用途</footer>
        </section>

        <section class="recipe-panel panel" :aria-busy="recipesLoading || detailLoading">
          <header class="panel-heading"><div><span class="eyebrow">{{ recipeId ? 'RECIPE' : direction === 'uses' ? 'USES' : 'RECIPES' }}</span>
            <h2><GameText v-if="entry" :text="entry.name" /><template v-else>{{ recipeId ? '配方详情' : '配方与用途' }}</template></h2>
            <p v-if="entry" class="registry">{{ entry.registry }}<template v-if="entry.meta != null"> : {{ entry.meta }}</template></p></div>
            <button v-if="entry" type="button" class="bookmark quiet" :class="{ active: bookmarked }" :aria-pressed="Boolean(bookmarked)"
              :aria-label="bookmarked ? '移除书签' : '添加书签'" @click="bookmark(catalog.manifest.id, entry)">{{ bookmarked ? '★' : '☆' }}</button>
          </header>
          <div v-if="itemId" class="recipe-controls">
            <div class="segmented" aria-label="配方方向"><button type="button" :class="{ active: direction === 'recipes' }" :aria-pressed="direction === 'recipes'" @click="select(itemId, 'recipes')">配方</button>
              <button type="button" :class="{ active: direction === 'uses' }" :aria-pressed="direction === 'uses'" @click="select(itemId, 'uses')">用途</button></div>
            <input v-model="recipeQuery" type="search" aria-label="筛选配方" placeholder="筛选配方…" maxlength="256" />
          </div>
          <div v-if="entry" class="topic-links" aria-label="条目资料">
            <RouterLink :to="{ name: 'materials', query: { catalog: catalog.manifest.id, item: entry.id } }">相关材料</RouterLink>
            <RouterLink :to="{ name: 'circuits', query: { catalog: catalog.manifest.id, item: entry.id } }">相关电路</RouterLink>
            <RouterLink :to="{ name: 'bees', query: { catalog: catalog.manifest.id, item: entry.id } }">相关蜜蜂</RouterLink>
            <RouterLink :to="{ name: 'trees', query: { catalog: catalog.manifest.id, item: entry.id } }">相关树木</RouterLink>
            <RouterLink :to="{ name: 'structures', query: { catalog: catalog.manifest.id, item: entry.id } }">相关结构</RouterLink>
            <RouterLink :to="{ name: 'studies', query: { catalog: catalog.manifest.id, item: entry.id } }">相关研究</RouterLink>
          </div>
          <AspectBar v-if="entry?.kind === 'item'" :item="entry.id" :catalog="catalog" :animate="preferences.animate" />
          <div v-if="entryError || recipesError || detailError" class="state-panel error" role="alert"><h3>配方无法加载</h3><p>{{ entryError || recipesError || detailError }}</p></div>
          <div v-else-if="!itemId && !recipeId" class="recipe-welcome"><span class="recipe-glyph" aria-hidden="true">▦</span><h2>从一个物品开始</h2><p>浏览配方、寻找用途，沿着材料追溯生产过程。</p></div>
          <template v-else>
            <div v-if="recipes && records && !recipeId && recipes.categories.length" class="category-tabs" aria-label="配方分类">
              <button type="button" :class="{ active: !category }" @click="category = ''">全部</button>
              <button v-for="row in recipes.categories" :key="row.id" type="button" :class="{ active: category === row.id }" @click="category = row.id">
                <GameText :text="categoryName(row.id)" /><small>{{ row.count }}</small></button>
            </div>
            <div v-if="records && category && required(records.categories, category).machines.length" class="machines"><span>可用机器</span>
              <ItemLink v-for="machine in required(records.categories, category).machines" :key="machine.id" :target="machine" :catalog="catalog"
                :records="records" :animate="preferences.animate" @select="select" /></div>
            <div v-if="recipesLoading || detailLoading" class="loading-note" role="status">正在读取配方…</div>
            <div v-if="records && shownRecipes.length" class="recipe-list" :class="{ busy: recipesLoading || detailLoading }">
              <Recipe v-for="recipe in shownRecipes" :key="recipe.id" :recipe="recipe" :catalog="catalog" :records="records"
                :animate="preferences.animate" :scale="preferences.scale" :focus="itemId" :direction="direction" @select="select" @open="showRecipe" />
            </div>
            <div v-else-if="!recipesLoading && !detailLoading" class="state-panel empty"><h3>没有{{ direction === 'uses' ? '已记录的用途' : '匹配的配方' }}</h3>
              <p>可以切换配方方向或清除筛选。</p></div>
            <Pager v-if="recipes && !recipeId" :total="recipes.total" :offset="recipes.offset" :limit="recipes.limit" :busy="recipesLoading" label="配方" @change="recipeOffset = $event" />
          </template>
        </section>
      </div>
      <section v-if="preferences.bookmarks.length" class="saved-strip" aria-label="书签"><h2>书签</h2><div>
        <button v-for="row in preferences.bookmarks" :key="row.catalog + row.id" type="button" @click="saved(row)"><GameText :text="row.name" /></button>
      </div></section>
      <section v-if="preferences.history.length" class="saved-strip" aria-label="最近浏览"><h2>最近浏览</h2><div>
        <button v-for="row in preferences.history" :key="row.catalog + row.id" type="button" @click="saved(row)"><GameText :text="row.name" /></button>
      </div><button type="button" class="quiet" @click="preferences.history = []">清空</button></section>
    </template>
    <p v-if="storageError" class="notice" role="status">{{ storageError }}</p>
    <footer class="site-footer"><span>NeoNEI</span><span>从游戏中采集，在配方间探索。</span></footer>

    <dialog ref="settings" class="dialog settings-dialog">
      <header><h2>浏览设置</h2><button type="button" aria-label="关闭设置" @click="settings?.close()">×</button></header>
      <label>图标尺寸<select v-model.number="preferences.size"><option :value="36">紧凑</option><option :value="48">标准</option><option :value="64">大图标</option></select></label>
      <label>每页条目<select v-model.number="preferences.limit"><option :value="48">48</option><option :value="96">96</option><option :value="192">192</option></select></label>
      <label>配方缩放<select v-model.number="preferences.scale"><option :value="1">1×</option><option :value="2">2×</option><option :value="3">3×</option></select></label>
      <label class="check"><input v-model="preferences.animate" type="checkbox" />播放纹理与界面动画</label>
      <section v-if="catalog" class="dataset-info"><h3>当前数据集</h3><p>{{ catalog.count('items').toLocaleString('zh-CN') }} 个物品 · {{ catalog.count('recipes').toLocaleString('zh-CN') }} 个配方</p>
        <code>{{ catalog.manifest.id }}</code><button type="button" @click="refresh">切换到最新数据</button></section>
    </dialog>
  </div>
</template>
