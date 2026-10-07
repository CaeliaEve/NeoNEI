<script setup lang="ts">
import { defineAsyncComponent, shallowRef, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Catalog, Records, type Detail } from '../catalog/client';
import { session } from '../services/api/elysiumFacade';
import Recipe from './Recipe.vue';
const RecipeTools = defineAsyncComponent(() => import('./RecipeTools.vue'));

const props = defineProps<{ id: string }>();
const emit = defineEmits<{ select: [id: string, options: { tab: 'usedIn' | 'producedBy' }] }>();
const router = useRouter();
const route = useRoute();
const current = shallowRef<{ catalog: Catalog; detail: Detail; records: Records } | null>(null);
const error = shallowRef('');
const toolsMode = shallowRef<'materials' | 'compare' | null>(null);
watch(() => [props.id, route.query.catalog, route.query.offline] as const, async ([id], _old, cleanup) => {
  const controller = new AbortController();
  cleanup(() => controller.abort()); current.value = null; error.value = ''; toolsMode.value = null;
  try {
    const catalog = await session();
    const detail = await catalog.recipe(id, controller.signal);
    if (!controller.signal.aborted) current.value = { catalog, detail, records: new Records(detail.related) };
  } catch (cause) { if (!controller.signal.aborted) error.value = cause instanceof Error ? cause.message : String(cause); }
}, { immediate: true });
</script>

<template>
  <div class="catalog-recipe">
    <p v-if="error" role="alert">{{ error }}</p>
    <template v-else-if="current">
      <div class="recipe-tools-entry"><button type="button" :aria-expanded="toolsMode !== null" @click="toolsMode = toolsMode ? null : 'materials'">材料与对比</button></div>
      <Recipe v-if="toolsMode !== 'compare'" :recipe="current.detail.recipe" :records="current.records" :catalog="current.catalog" :animate="true" :scale="1"
        @select="(id, direction) => emit('select', id, { tab: direction === 'uses' ? 'usedIn' : 'producedBy' })"
        @open="id => router.push({ name: 'recipe-by-id', params: { recipeId: id }, query: router.currentRoute.value.query })" />
      <RecipeTools v-if="toolsMode" :catalog="current.catalog" :detail="current.detail" :records="current.records" :mode="toolsMode"
        @update:mode="toolsMode = $event" @close="toolsMode = null"
        @select="(id, direction) => emit('select', id, { tab: direction === 'uses' ? 'usedIn' : 'producedBy' })"
        @open="id => router.push({ name: 'recipe-by-id', params: { recipeId: id }, query: router.currentRoute.value.query })" />
    </template>
    <p v-else role="status">正在读取配方…</p>
  </div>
</template>

<style scoped>
.catalog-recipe { color: #eef6ff; max-width: 100%; --line: #223041; --muted: #a0b0c2; --accent: #8fd8ff; }
.recipe-tools-entry { display: flex; justify-content: flex-end; padding: 2px 6px; }
.recipe-tools-entry button { border: 1px solid #34485b; border-radius: 3px; background: #172331; color: #a8cee7; font-size: 11px; padding: 2px 7px; cursor: pointer; }
.catalog-recipe :deep(.recipe-card > header) { display: none; }
.catalog-recipe :deep(.view-scroll) { overflow: auto; padding: 8px; }
.catalog-recipe :deep(.recipe-view) { position: relative; background: #c6c6c6; image-rendering: pixelated; margin: auto; color: #333; isolation: isolate; }
.catalog-recipe :deep(.view-element) { position: absolute; }
.catalog-recipe :deep(.view-art) { pointer-events: none; }
.catalog-recipe :deep(.view-text) { white-space: pre; line-height: 1.2; }
.catalog-recipe :deep(.icon) { display: inline-flex; position: relative; flex: none; vertical-align: middle; }
.catalog-recipe :deep(canvas) { display: block; image-rendering: pixelated; }
.catalog-recipe :deep(.item-link) { display: inline-flex; align-items: center; gap: 8px; padding: 5px; text-align: left; font-size: 12px; }
.catalog-recipe :deep(.item-link.compact) { position: relative; padding: 0; gap: 0; border: 0; background: transparent; color: white; }
.catalog-recipe :deep(.stack-slot) { position: relative; display: inline-flex; }
.catalog-recipe :deep(.quantity) { position: absolute; bottom: 0; right: 0; max-width: 100%; font-size: 10px; text-shadow: 1px 1px #000, -1px -1px #000; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; pointer-events: none; }
.catalog-recipe :deep(.recipe-flow), .catalog-recipe :deep(.extra-slots) { display: flex; gap: 12px; flex-wrap: wrap; }
.catalog-recipe :deep(.recipe-stats), .catalog-recipe :deep(.recipe-details), .catalog-recipe :deep(.recipe-extra) { padding: 10px; font-size: 12px; }
.catalog-recipe :deep(.recipe-details) { border-top: 1px solid #223041; }
</style>
