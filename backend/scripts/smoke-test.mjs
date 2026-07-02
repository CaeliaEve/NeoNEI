#!/usr/bin/env node
const baseUrl = (process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3002').replace(/\/+$/, '');

function unwrapEnvelope(payload) {
  return payload && typeof payload === 'object' && Object.prototype.hasOwnProperty.call(payload, 'data')
    ? payload.data
    : payload;
}

function itemFromBrowserEntry(entry) {
  if (entry?.kind === 'item') return entry.item || null;
  return entry?.group?.representative || null;
}

async function mustJson(path, init) {
  const resp = await fetch(`${baseUrl}${path}`, init);
  if (!resp.ok) {
    throw new Error(`${path} failed with ${resp.status}`);
  }
  return resp.json();
}

async function optionalJson(path, init) {
  const resp = await fetch(`${baseUrl}${path}`, init);
  if (resp.status === 404) return null;
  if (!resp.ok) {
    throw new Error(`${path} failed with ${resp.status}`);
  }
  return resp.json();
}

async function main() {
  console.log(`[SMOKE] base=${baseUrl}`);

  const health = await mustJson('/api/health');
  console.log(`[OK] health status=${health.status}`);

  const currentRuntime = unwrapEnvelope(await mustJson('/api/runtime/current'));
  if (!currentRuntime?.runtimeId) {
    throw new Error('current runtime endpoint did not return runtimeId');
  }
  console.log(`[OK] current runtime=${currentRuntime.runtimeId}`);

  const homeBootstrap = await mustJson('/api/publish/home-bootstrap?page=1&pageSize=5&slotSize=48');
  const entries = homeBootstrap?.pagePack?.data || [];
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error('publish home bootstrap returned no browser entries');
  }
  const sampleItem = entries.map(itemFromBrowserEntry).find((item) => item?.itemId);
  if (!sampleItem?.itemId) {
    throw new Error('home bootstrap did not expose a sample item');
  }
  console.log(`[OK] home bootstrap entries=${entries.length} sample=${sampleItem.itemId}`);

  const producedBy = unwrapEnvelope(await optionalJson(`/api/recipes/current/item/${encodeURIComponent(sampleItem.itemId)}`));
  const usedIn = unwrapEnvelope(await optionalJson(`/api/recipes/current/usage/${encodeURIComponent(sampleItem.itemId)}`));
  const recipeRefs = [
    ...(Array.isArray(producedBy?.recipes) ? producedBy.recipes : []),
    ...(Array.isArray(usedIn?.recipes) ? usedIn.recipes : []),
  ];
  console.log(`[OK] current recipe queries sampled=${recipeRefs.length}`);

  const firstRecipeId = recipeRefs.find((entry) => entry?.recipeId)?.recipeId;
  if (firstRecipeId) {
    const recipePage = unwrapEnvelope(await mustJson(`/api/recipes/page/${encodeURIComponent(firstRecipeId)}`));
    if (!recipePage?.recipe) {
      throw new Error('current recipe page did not return recipe payload');
    }
    console.log(`[OK] current recipe page=${firstRecipeId}`);
  } else {
    console.log('[WARN] sample item has no current recipe refs; skipped recipe page fetch');
  }

  console.log('[SMOKE] PASS');
}

main().catch((error) => {
  console.error('[SMOKE] FAIL', error.message || error);
  process.exit(1);
});
