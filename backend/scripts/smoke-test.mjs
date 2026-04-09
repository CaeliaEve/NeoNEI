#!/usr/bin/env node
const baseUrl = (process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3002').replace(/\/+$/, '');

async function mustJson(path, init) {
  const resp = await fetch(`${baseUrl}${path}`, init);
  if (!resp.ok) {
    throw new Error(`${path} failed with ${resp.status}`);
  }
  return resp.json();
}

async function main() {
  console.log(`[SMOKE] base=${baseUrl}`);

  const health = await mustJson('/api/health');
  console.log(`[OK] health status=${health.status}`);

  const itemsPage = await mustJson('/api/items?page=1&pageSize=5');
  if (!Array.isArray(itemsPage.data) || itemsPage.data.length === 0) {
    throw new Error('items page returned no data');
  }
  console.log(`[OK] items page count=${itemsPage.data.length}`);

  const sampleItemId = itemsPage.data[0].itemId;
  const bootstrap = await mustJson(`/api/recipe-bootstrap/${encodeURIComponent(sampleItemId)}`);
  const allRecipeIds = [
    ...(bootstrap.recipeIndex?.usedInRecipes || []),
    ...(bootstrap.recipeIndex?.producedByRecipes || []),
  ].slice(0, 10);
  console.log(`[OK] recipe bootstrap fetched for ${sampleItemId}, sampled=${allRecipeIds.length}`);

  if (allRecipeIds.length > 0) {
    const recipe = await mustJson(`/api/recipes-indexed/${encodeURIComponent(allRecipeIds[0])}`);
    if (!recipe || typeof recipe.id !== 'string') {
      throw new Error('indexed recipe fetch did not return recipe object');
    }
    console.log(`[OK] indexed recipe returned=${recipe.id}`);
  } else {
    console.log('[WARN] no recipe ids sampled; skipped indexed recipe fetch');
  }

  console.log('[SMOKE] PASS');
}

main().catch((error) => {
  console.error('[SMOKE] FAIL', error.message || error);
  process.exit(1);
});
