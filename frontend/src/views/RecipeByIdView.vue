<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import CatalogRecipe from '../components/CatalogRecipe.vue';

const route = useRoute();
const router = useRouter();
const recipeId = computed(() => String(route.params.recipeId ?? ''));
const snapshot = computed(() => ({ catalog: route.query.catalog, offline: route.query.offline }));
function select(itemId: string, options: { tab: 'usedIn' | 'producedBy' }): void {
  void router.push({ name: 'recipe', params: { itemId }, query: {
    ...snapshot.value, tab: options.tab, mode: options.tab === 'usedIn' ? 'u' : 'r', page: '0',
  } });
}
</script>

<template>
  <main class="recipe-by-id-page">
    <RouterLink class="recipe-by-id-back" :to="{ name: 'home', query: snapshot }">返回首页</RouterLink>
    <CatalogRecipe :id="recipeId" @select="select" />
  </main>
</template>

<style scoped>
.recipe-by-id-page {
  box-sizing: border-box;
  min-height: 100vh;
  padding: 24px;
  color: #eef6ff;
  background: #101722;
}

.recipe-by-id-back {
  display: inline-block;
  margin-bottom: 20px;
  color: #8fd8ff;
}
.recipe-by-id-page :deep(.catalog-recipe) { width: max-content; max-width: 100%; margin: auto; }
</style>
