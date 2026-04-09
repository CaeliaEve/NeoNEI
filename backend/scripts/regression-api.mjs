#!/usr/bin/env node
const baseUrl = (process.env.REGRESSION_BASE_URL || process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3002').replace(/\/+$/, '');

async function mustJsonResponse(path, init) {
  const resp = await fetch(`${baseUrl}${path}`, init);
  if (!resp.ok) {
    throw new Error(`${path} failed with ${resp.status}`);
  }
  const data = await resp.json();
  return { data, headers: resp.headers };
}

async function mustJson(path, init) {
  const { data } = await mustJsonResponse(path, init);
  return data;
}

async function main() {
  console.log(`[REGRESSION] base=${baseUrl}`);

  const health = await mustJson('/api/health');
  console.log(`[OK] health status=${health.status}`);

  const itemsPage = await mustJson('/api/items?page=1&pageSize=10');
  if (!Array.isArray(itemsPage.data) || itemsPage.data.length === 0) {
    throw new Error('items page returned no data');
  }
  console.log(`[OK] items page count=${itemsPage.data.length}`);

  const sampleItemId = itemsPage.data[0].itemId;
  const bootstrap = await mustJson(`/api/recipe-bootstrap/${encodeURIComponent(sampleItemId)}`);
  const sampledRecipeIds = [
    ...(bootstrap.recipeIndex?.usedInRecipes || []),
    ...(bootstrap.recipeIndex?.producedByRecipes || []),
  ].slice(0, 10);
  console.log(`[OK] recipe bootstrap fetched for ${sampleItemId}, sampled=${sampledRecipeIds.length}`);

  const indexedCrafting = await mustJson(`/api/recipes-indexed/${encodeURIComponent(sampleItemId)}/crafting`);
  if (!Array.isArray(indexedCrafting)) {
    throw new Error('recipes-indexed crafting endpoint did not return array');
  }
  console.log(`[OK] indexed crafting count=${indexedCrafting.length}`);

  if (!Array.isArray(bootstrap.indexedCrafting)) {
    throw new Error('recipe bootstrap indexedCrafting did not return array');
  }
  if (!Array.isArray(bootstrap.indexedUsage)) {
    throw new Error('recipe bootstrap indexedUsage did not return array');
  }
  console.log(`[OK] bootstrap indexed crafting count=${bootstrap.indexedCrafting.length}`);

  const indexedUsage = await mustJson(`/api/recipes-indexed/${encodeURIComponent(sampleItemId)}/usage`);
  if (!Array.isArray(indexedUsage)) {
    throw new Error('recipes-indexed usage endpoint did not return array');
  }
  console.log(`[OK] indexed usage count=${indexedUsage.length}`);

  if (sampledRecipeIds.length > 0) {
    const singleIndexedRecipe = await mustJson(`/api/recipes-indexed/${encodeURIComponent(sampledRecipeIds[0])}`);
    if (!singleIndexedRecipe || typeof singleIndexedRecipe.id !== 'string') {
      throw new Error('single indexed recipe fetch did not return recipe object');
    }
    console.log(`[OK] single indexed recipe fetched=${singleIndexedRecipe.id}`);
  }

  const summaryPath = `/api/recipes-indexed/item/${encodeURIComponent(sampleItemId)}/summary`;
  const summaryResp1 = await mustJsonResponse(summaryPath);
  const summary1 = summaryResp1.data;
  if (
    !summary1 ||
    typeof summary1.itemId !== 'string' ||
    typeof summary1.itemName !== 'string' ||
    !summary1.counts ||
    typeof summary1.counts !== 'object' ||
    !Array.isArray(summary1.machineGroups)
  ) {
    throw new Error('summary endpoint did not return lightweight summary shape');
  }
  if (summary1.itemId !== sampleItemId) {
    throw new Error('summary itemId mismatch');
  }
  if (summary1.machineGroups.some((group) => group && Object.prototype.hasOwnProperty.call(group, 'recipes'))) {
    throw new Error('summary machineGroups must not contain recipes');
  }
  if (summary1.counts.producedBy !== indexedCrafting.length) {
    throw new Error('summary counts.producedBy mismatch');
  }
  if (summary1.counts.usedIn !== indexedUsage.length) {
    throw new Error('summary counts.usedIn mismatch');
  }
  if (summary1.counts.machineGroups !== summary1.machineGroups.length) {
    throw new Error('summary counts.machineGroups mismatch');
  }
  console.log(
    `[OK] summary first call producedBy=${summary1.counts.producedBy} usedIn=${summary1.counts.usedIn} machineGroups=${summary1.machineGroups.length} x-cache=${summaryResp1.headers.get('x-cache') || 'NA'}`
  );

  const summaryResp2 = await mustJsonResponse(summaryPath);
  const cacheHeader2 = (summaryResp2.headers.get('x-cache') || '').toUpperCase();
  if (cacheHeader2 !== 'HIT') {
    throw new Error(`summary cache header expected HIT on second call, got "${cacheHeader2 || 'EMPTY'}"`);
  }
  console.log(`[OK] summary second call cache HIT verified`);

  console.log('[REGRESSION] PASS');
}

main().catch((error) => {
  console.error('[REGRESSION] FAIL', error.message || error);
  process.exit(1);
});
