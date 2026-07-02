#!/usr/bin/env node

const baseUrl = (process.env.BENCH_BASE_URL || 'http://127.0.0.1:3002').replace(/\/+$/, '');

function unwrapEnvelope(payload) {
  return payload && typeof payload === 'object' && Object.prototype.hasOwnProperty.call(payload, 'data')
    ? payload.data
    : payload;
}

function itemFromBrowserEntry(entry) {
  if (entry?.kind === 'item') return entry.item || null;
  return entry?.group?.representative || null;
}

async function timedJson(path) {
  const startedAt = performance.now();
  const resp = await fetch(`${baseUrl}${path}`);
  const durationMs = performance.now() - startedAt;
  if (!resp.ok) {
    throw new Error(`${path} failed with ${resp.status}`);
  }
  const data = await resp.json();
  return { data, durationMs };
}

async function optionalTimedJson(path) {
  const startedAt = performance.now();
  const resp = await fetch(`${baseUrl}${path}`);
  const durationMs = performance.now() - startedAt;
  if (resp.status === 404) return { data: null, durationMs, skipped: true };
  if (!resp.ok) {
    throw new Error(`${path} failed with ${resp.status}`);
  }
  const data = await resp.json();
  return { data, durationMs, skipped: false };
}

function p95(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  return sorted[index];
}

async function sample(label, path, runs = 5, options = {}) {
  const durations = [];
  let lastData = null;
  let skipped = 0;
  for (let i = 0; i < runs; i += 1) {
    const result = options.optional ? await optionalTimedJson(path) : await timedJson(path);
    durations.push(result.durationMs);
    lastData = result.data;
    if (result.skipped) skipped += 1;
  }
  console.log(
    JSON.stringify(
      {
        label,
        path,
        runs,
        skipped,
        avg_ms: Number((durations.reduce((a, b) => a + b, 0) / durations.length).toFixed(2)),
        p95_ms: Number((p95(durations) ?? 0).toFixed(2)),
      },
      null,
      2,
    ),
  );
  return lastData;
}

async function pickRecipeCapableItem(entries) {
  const candidates = (Array.isArray(entries) ? entries : [])
    .map(itemFromBrowserEntry)
    .filter((item) => item?.itemId)
    .slice(0, 24);
  for (const item of candidates) {
    const [producedBy, usedIn] = await Promise.all([
      optionalTimedJson(`/api/recipes/current/item/${encodeURIComponent(item.itemId)}`),
      optionalTimedJson(`/api/recipes/current/usage/${encodeURIComponent(item.itemId)}`),
    ]);
    const producedPayload = unwrapEnvelope(producedBy.data);
    const usedPayload = unwrapEnvelope(usedIn.data);
    const recipeCount = (Array.isArray(producedPayload?.recipes) ? producedPayload.recipes.length : 0)
      + (Array.isArray(usedPayload?.recipes) ? usedPayload.recipes.length : 0);
    if (recipeCount > 0) return item.itemId;
  }
  return candidates[0]?.itemId ?? null;
}

async function main() {
  console.log(`[ACCEL_BENCH] base=${baseUrl}`);

  const runtimeSummary = await sample('runtime-summary', '/api/diagnostics/runtime-summary', 3);
  console.log(`[OK] runtime status=${runtimeSummary?.data?.status ?? runtimeSummary?.status ?? 'unknown'}`);

  await sample('current-runtime', '/api/runtime/current', 5);
  await sample('current-runtime-manifest', '/api/runtime/current/manifest', 5);
  await sample('publish-manifest', '/api/publish/manifest', 5);
  const homeBootstrap = await sample('home-bootstrap', '/api/publish/home-bootstrap?page=1&pageSize=108&slotSize=45', 5);
  const sampleItemId = await pickRecipeCapableItem(homeBootstrap?.pagePack?.data);
  if (!sampleItemId) {
    throw new Error('home-bootstrap returned no sample item');
  }

  await sample('recipe-produced-by-current', `/api/recipes/current/item/${encodeURIComponent(sampleItemId)}`, 5, { optional: true });
  await sample('recipe-used-in-current', `/api/recipes/current/usage/${encodeURIComponent(sampleItemId)}`, 5, { optional: true });

  console.log('[ACCEL_BENCH] PASS');
}

main().catch((error) => {
  console.error('[ACCEL_BENCH] FAIL', error.message || error);
  process.exit(1);
});
