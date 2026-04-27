#!/usr/bin/env node

const baseUrl = (process.env.BENCH_BASE_URL || 'http://127.0.0.1:3002').replace(/\/+$/, '');

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

function p95(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  return sorted[index];
}

async function sample(label, path, runs = 5) {
  const durations = [];
  let lastData = null;
  for (let i = 0; i < runs; i += 1) {
    const result = await timedJson(path);
    durations.push(result.durationMs);
    lastData = result.data;
  }
  console.log(
    JSON.stringify(
      {
        label,
        path,
        runs,
        avg_ms: Number((durations.reduce((a, b) => a + b, 0) / durations.length).toFixed(2)),
        p95_ms: Number((p95(durations) ?? 0).toFixed(2)),
      },
      null,
      2,
    ),
  );
  return lastData;
}

async function findSummaryCapableItem(items) {
  const candidates = Array.isArray(items?.data) ? items.data.slice(0, 20) : [];
  for (const entry of candidates) {
    const itemId = entry?.itemId;
    if (!itemId) continue;
    const resp = await fetch(`${baseUrl}/api/recipes-indexed/item/${encodeURIComponent(itemId)}/summary`);
    if (resp.ok) {
      return itemId;
    }
  }
  return null;
}

async function main() {
  console.log(`[ACCEL_BENCH] base=${baseUrl}`);

  const acceleration = await sample('acceleration-overview', '/api/ecosystem/acceleration', 3);
  console.log(`[OK] acceleration db exists=${acceleration.exists} atlas=${acceleration.generatedAtlasCount}`);

  const itemsPage = await sample('items-page', '/api/items?page=1&pageSize=50', 5);
  const sampleItemId = await findSummaryCapableItem(itemsPage);
  if (!sampleItemId) {
    throw new Error('items-page returned no summary-capable sample item');
  }

  await sample('mods', '/api/items/mods', 5);
  await sample('home-bootstrap', '/api/publish/home-bootstrap?page=1&pageSize=108&slotSize=45', 5);
  await sample('browser-page-pack', '/api/items/browser/page-pack?page=1&pageSize=108&slotSize=45', 5);
  await sample('search-tailagang', '/api/items/search/fast?q=tailagang&limit=10', 5);
  await sample('search-terrasteel', '/api/items/search/fast?q=terrasteel&limit=10', 5);
  await sample('browser-search-pack', '/api/items/search/pack', 3);
  await sample('recipe-summary', `/api/recipes-indexed/item/${encodeURIComponent(sampleItemId)}/summary`, 5);
  await sample('page-atlas-precomputed', '/api/items/page-atlas/precomputed?page=1&pageSize=108&slotSize=45', 5);

  console.log('[ACCEL_BENCH] PASS');
}

main().catch((error) => {
  console.error('[ACCEL_BENCH] FAIL', error.message || error);
  process.exit(1);
});
