<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import RecipeDisplayRouter from '../components/RecipeDisplayRouter.vue';
import { convertIndexedRecipe } from '../domain/recipeNormalization';
import { getDistDataRecipeById } from '../services/distDataRuntime';
import type { Recipe } from '../services/api';

const route = useRoute();
const recipe = ref<Recipe | null>(null);
const error = ref('');

onMounted(async () => {
  const rawRecipeId = route.params.recipeId;
  const recipeId = Array.isArray(rawRecipeId) ? rawRecipeId[0] : rawRecipeId;
  try {
    const indexedRecipe = recipeId ? await getDistDataRecipeById(recipeId) : null;
    recipe.value = indexedRecipe ? convertIndexedRecipe(indexedRecipe) : null;
    if (!recipe.value) error.value = `Recipe not found: ${recipeId ?? ''}`;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  }
});
</script>

<template>
  <main class="recipe-by-id-page">
    <RouterLink class="recipe-by-id-back" to="/">返回首页</RouterLink>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-else-if="!recipe">正在读取配方…</p>
    <RecipeDisplayRouter v-else :recipe="recipe" scale-to-fit />
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
</style>
