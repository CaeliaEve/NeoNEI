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

  const publishManifestResp1 = await mustJsonResponse('/api/publish/manifest');
  if (!publishManifestResp1.data?.sourceSignature) {
    throw new Error('publish manifest missing sourceSignature');
  }
  const publishManifestEtag = publishManifestResp1.headers.get('etag');
  if (!publishManifestEtag) {
    throw new Error('publish manifest missing etag');
  }
  const publishManifestResp2 = await fetch(`${baseUrl}/api/publish/manifest`, {
    headers: { 'If-None-Match': publishManifestEtag },
  });
  if (publishManifestResp2.status !== 304) {
    throw new Error(`publish manifest conditional request expected 304, got ${publishManifestResp2.status}`);
  }
  console.log('[OK] publish manifest etag 304 verified');

  const homeBootstrapResp1 = await mustJsonResponse('/api/publish/home-bootstrap?page=1&pageSize=10&slotSize=48');
  if (!Array.isArray(homeBootstrapResp1.data?.mods)) {
    throw new Error('home bootstrap missing mods array');
  }
  if (!Array.isArray(homeBootstrapResp1.data?.pagePack?.data)) {
    throw new Error('home bootstrap missing pagePack data array');
  }
  const homeBootstrapEtag = homeBootstrapResp1.headers.get('etag');
  if (!homeBootstrapEtag) {
    throw new Error('home bootstrap missing etag');
  }
  const homeBootstrapResp2 = await fetch(`${baseUrl}/api/publish/home-bootstrap?page=1&pageSize=10&slotSize=48`, {
    headers: { 'If-None-Match': homeBootstrapEtag },
  });
  if (homeBootstrapResp2.status !== 304) {
    throw new Error(`home bootstrap conditional request expected 304, got ${homeBootstrapResp2.status}`);
  }
  console.log('[OK] home bootstrap etag 304 verified');

  const sampleItemId = itemsPage.data[0].itemId;
  const browserPagePackResp1 = await mustJsonResponse('/api/items/browser/page-pack?page=1&pageSize=10&slotSize=48');
  if (!Array.isArray(browserPagePackResp1.data?.data)) {
    throw new Error('browser page pack missing data array');
  }
  const browserPagePackEtag = browserPagePackResp1.headers.get('etag');
  if (!browserPagePackEtag) {
    throw new Error('browser page pack missing etag');
  }
  const browserPagePackResp2 = await fetch(`${baseUrl}/api/items/browser/page-pack?page=1&pageSize=10&slotSize=48`, {
    headers: { 'If-None-Match': browserPagePackEtag },
  });
  if (browserPagePackResp2.status !== 304) {
    throw new Error(`browser page pack conditional request expected 304, got ${browserPagePackResp2.status}`);
  }
  console.log('[OK] browser page pack etag 304 verified');

  const searchPackResp1 = await mustJsonResponse('/api/items/search/pack');
  if (!Array.isArray(searchPackResp1.data?.items)) {
    throw new Error('search pack missing items array');
  }
  const searchPackEtag = searchPackResp1.headers.get('etag');
  if (!searchPackEtag) {
    throw new Error('search pack missing etag');
  }
  const searchPackResp2 = await fetch(`${baseUrl}/api/items/search/pack`, {
    headers: { 'If-None-Match': searchPackEtag },
  });
  if (searchPackResp2.status !== 304) {
    throw new Error(`search pack conditional request expected 304, got ${searchPackResp2.status}`);
  }
  console.log('[OK] search pack etag 304 verified');

  const bootstrap = await mustJson(`/api/recipe-bootstrap/${encodeURIComponent(sampleItemId)}`);
  const sampledRecipeIds = [
    ...(bootstrap.recipeIndex?.usedInRecipes || []),
    ...(bootstrap.recipeIndex?.producedByRecipes || []),
  ].slice(0, 10);
  console.log(`[OK] recipe bootstrap fetched for ${sampleItemId}, sampled=${sampledRecipeIds.length}`);
  const bootstrapResp1 = await mustJsonResponse(`/api/recipe-bootstrap/${encodeURIComponent(sampleItemId)}`);
  const bootstrapEtag = bootstrapResp1.headers.get('etag');
  if (!bootstrapEtag) {
    throw new Error('recipe bootstrap missing etag');
  }
  const bootstrapResp2 = await fetch(`${baseUrl}/api/recipe-bootstrap/${encodeURIComponent(sampleItemId)}`, {
    headers: { 'If-None-Match': bootstrapEtag },
  });
  if (bootstrapResp2.status !== 304) {
    throw new Error(`recipe bootstrap conditional request expected 304, got ${bootstrapResp2.status}`);
  }
  console.log('[OK] recipe bootstrap etag 304 verified');

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

  const shard = await mustJson(`/api/recipe-bootstrap/${encodeURIComponent(sampleItemId)}/shard`);
  if (!Array.isArray(shard.indexedCrafting) || !Array.isArray(shard.indexedUsage)) {
    throw new Error('recipe shard endpoint did not return full indexed arrays');
  }
  if (shard.recipeIndex?.producedByRecipes?.length !== bootstrap.recipeIndex?.producedByRecipes?.length) {
    throw new Error('recipe shard producedBy recipeIndex mismatch');
  }
  if (shard.recipeIndex?.usedInRecipes?.length !== bootstrap.recipeIndex?.usedInRecipes?.length) {
    throw new Error('recipe shard usedIn recipeIndex mismatch');
  }
  console.log(`[OK] recipe shard fetched producedBy=${shard.indexedCrafting.length} usedIn=${shard.indexedUsage.length}`);

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
  if (summary1.producedByMachineGroups && !Array.isArray(summary1.producedByMachineGroups)) {
    throw new Error('summary producedByMachineGroups must be array when present');
  }
  if (summary1.usedInMachineGroups && !Array.isArray(summary1.usedInMachineGroups)) {
    throw new Error('summary usedInMachineGroups must be array when present');
  }
  if (summary1.producedByCategoryGroups && !Array.isArray(summary1.producedByCategoryGroups)) {
    throw new Error('summary producedByCategoryGroups must be array when present');
  }
  if (summary1.usedInCategoryGroups && !Array.isArray(summary1.usedInCategoryGroups)) {
    throw new Error('summary usedInCategoryGroups must be array when present');
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

  if (summary1.machineGroups.length > 0) {
    const group = summary1.machineGroups[0];
    const params = new URLSearchParams({ machineType: group.machineType });
    if (group.voltageTier) {
      params.set('voltageTier', group.voltageTier);
    }
    const groupPack = await mustJson(`/api/recipe-bootstrap/${encodeURIComponent(sampleItemId)}/produced-by-group?${params.toString()}`);
    if (!Array.isArray(groupPack.recipes)) {
      throw new Error('produced-by-group endpoint did not return recipes array');
    }
    console.log(`[OK] produced-by-group fetched machine=${group.machineType} recipes=${groupPack.recipes.length}`);
  }

  if (Array.isArray(summary1.producedByCategoryGroups) && summary1.producedByCategoryGroups.length > 0) {
    const category = summary1.producedByCategoryGroups[0];
    const groupPack = await mustJson(`/api/recipe-bootstrap/${encodeURIComponent(sampleItemId)}/category-group?tab=producedBy&categoryKey=${encodeURIComponent(category.categoryKey)}`);
    if (!Array.isArray(groupPack.recipes)) {
      throw new Error('category-group producedBy endpoint did not return recipes array');
    }
    console.log(`[OK] category-group producedBy fetched key=${category.categoryKey} recipes=${groupPack.recipes.length}`);
  }

  if (Array.isArray(summary1.usedInMachineGroups) && summary1.usedInMachineGroups.length > 0) {
    const group = summary1.usedInMachineGroups[0];
    const params = new URLSearchParams({ machineType: group.machineType });
    if (group.voltageTier) {
      params.set('voltageTier', group.voltageTier);
    }
    const groupPack = await mustJson(`/api/recipe-bootstrap/${encodeURIComponent(sampleItemId)}/used-in-group?${params.toString()}`);
    if (!Array.isArray(groupPack.recipes)) {
      throw new Error('used-in-group endpoint did not return recipes array');
    }
    console.log(`[OK] used-in-group fetched machine=${group.machineType} recipes=${groupPack.recipes.length}`);
  }

  if (Array.isArray(summary1.usedInCategoryGroups) && summary1.usedInCategoryGroups.length > 0) {
    const category = summary1.usedInCategoryGroups[0];
    const groupPack = await mustJson(`/api/recipe-bootstrap/${encodeURIComponent(sampleItemId)}/category-group?tab=usedIn&categoryKey=${encodeURIComponent(category.categoryKey)}`);
    if (!Array.isArray(groupPack.recipes)) {
      throw new Error('category-group usedIn endpoint did not return recipes array');
    }
    console.log(`[OK] category-group usedIn fetched key=${category.categoryKey} recipes=${groupPack.recipes.length}`);
  }

  const sampleRecipeType = bootstrap.indexedCrafting[0]?.recipeType || bootstrap.indexedUsage[0]?.recipeType || '';
  if (sampleRecipeType) {
    const searchPayload = await mustJson(
      `/api/recipe-bootstrap/${encodeURIComponent(sampleItemId)}/search?tab=producedBy&q=${encodeURIComponent(`type:${sampleRecipeType}`)}`,
    );
    if (!Array.isArray(searchPayload.recipeIds) || !Array.isArray(searchPayload.itemMatches)) {
      throw new Error('recipe-bootstrap search endpoint did not return search payload arrays');
    }
    console.log(`[OK] recipe search fetched recipeIds=${searchPayload.recipeIds.length} items=${searchPayload.itemMatches.length}`);
  }

  console.log('[REGRESSION] PASS');
}

main().catch((error) => {
  console.error('[REGRESSION] FAIL', error.message || error);
  process.exit(1);
});
