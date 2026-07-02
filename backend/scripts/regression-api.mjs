#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const baseUrl = (process.env.REGRESSION_BASE_URL || process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3002').replace(/\/+$/, '');
const MAX_PUBLISH_BUNDLE_BYTES = 512 * 1024 * 1024;

function unwrapEnvelope(payload) {
  return payload && typeof payload === 'object' && Object.prototype.hasOwnProperty.call(payload, 'data')
    ? payload.data
    : payload;
}

function itemFromBrowserEntry(entry) {
  if (entry?.kind === 'item') return entry.item || null;
  return entry?.group?.representative || null;
}

function measureDirectoryBytes(rootDir) {
  if (!fs.existsSync(rootDir)) return 0;
  let totalBytes = 0;
  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(fullPath);
      else totalBytes += fs.statSync(fullPath).size;
    }
  }
  return totalBytes;
}

async function mustJsonResponse(routePath, init) {
  const resp = await fetch(`${baseUrl}${routePath}`, init);
  if (!resp.ok) throw new Error(`${routePath} failed with ${resp.status}`);
  return { data: await resp.json(), headers: resp.headers, status: resp.status };
}

async function mustJson(routePath, init) {
  return (await mustJsonResponse(routePath, init)).data;
}

async function optionalJson(routePath, init) {
  const resp = await fetch(`${baseUrl}${routePath}`, init);
  if (resp.status === 404) return null;
  if (!resp.ok) throw new Error(`${routePath} failed with ${resp.status}`);
  return resp.json();
}

async function expectNotFound(routePath) {
  const resp = await fetch(`${baseUrl}${routePath}`);
  if (resp.status !== 404) {
    throw new Error(`${routePath} should be retired and return 404, got ${resp.status}`);
  }
}

async function expectEtag304(routePath, etag) {
  if (!etag) throw new Error(`${routePath} missing etag`);
  const resp = await fetch(`${baseUrl}${routePath}`, { headers: { 'If-None-Match': etag } });
  if (resp.status !== 304) {
    throw new Error(`${routePath} conditional request expected 304, got ${resp.status}`);
  }
}

async function main() {
  console.log(`[REGRESSION] base=${baseUrl}`);

  const health = await mustJson('/api/health');
  console.log(`[OK] health status=${health.status}`);

  const currentRuntime = unwrapEnvelope(await mustJson('/api/runtime/current'));
  if (!currentRuntime?.runtimeId || !currentRuntime?.manifestUrl) {
    throw new Error('current runtime overview missing runtimeId or manifestUrl');
  }
  console.log(`[OK] current runtime=${currentRuntime.runtimeId}`);

  const runtimeManifestResp = await mustJsonResponse('/api/runtime/current/manifest');
  const runtimeManifest = unwrapEnvelope(runtimeManifestResp.data);
  if (!runtimeManifest || typeof runtimeManifest !== 'object') {
    throw new Error('current runtime manifest endpoint returned no manifest object');
  }
  await expectEtag304('/api/runtime/current/manifest', runtimeManifestResp.headers.get('etag'));
  console.log('[OK] current runtime manifest etag 304 verified');

  const publishManifestResp = await mustJsonResponse('/api/publish/manifest');
  if (!publishManifestResp.data?.sourceSignature) {
    throw new Error('publish manifest missing sourceSignature');
  }
  await expectEtag304('/api/publish/manifest', publishManifestResp.headers.get('etag'));
  console.log('[OK] publish manifest etag 304 verified');

  if (publishManifestResp.data.publishBundle) {
    const bundle = publishManifestResp.data.publishBundle;
    const publishBundleDir = path.resolve('data', 'publish', publishManifestResp.data.sourceSignature);
    if (!bundle?.files?.manifest) {
      throw new Error('publish manifest advertised publishBundle without files.manifest');
    }
    if (bundle.files.recipeBootstrapShardBasePath) {
      throw new Error('published bundle should not expose static recipe shard assets');
    }
    const publishedManifestResp = await mustJsonResponse(bundle.files.manifest, {
      headers: { 'Accept-Encoding': 'br, gzip' },
    });
    const publishedManifest = publishedManifestResp.data;
    if (publishedManifest?.sourceSignature !== publishManifestResp.data.sourceSignature) {
      throw new Error('published manifest sourceSignature mismatch');
    }
    const manifestContentEncoding = (publishedManifestResp.headers.get('content-encoding') || '').toLowerCase();
    if (manifestContentEncoding !== 'br' && manifestContentEncoding !== 'gzip') {
      throw new Error(`published manifest did not serve compressed sidecar (got ${manifestContentEncoding || 'none'})`);
    }
    if (!Array.isArray(publishedManifest?.compression?.sidecars) || !publishedManifest.compression.sidecars.includes('br') || !publishedManifest.compression.sidecars.includes('gzip')) {
      throw new Error('published manifest missing advertised br/gzip sidecar support');
    }
    const publishBundleBytes = measureDirectoryBytes(publishBundleDir);
    if (publishBundleBytes > MAX_PUBLISH_BUNDLE_BYTES) {
      throw new Error(`published bundle grew too large (${publishBundleBytes} bytes)`);
    }
    console.log(`[OK] published bundle manifest verified bytes=${publishBundleBytes}`);
  }

  const homePath = '/api/publish/home-bootstrap?page=1&pageSize=10&slotSize=48';
  const homeBootstrapResp = await mustJsonResponse(homePath);
  if (!Array.isArray(homeBootstrapResp.data?.mods)) {
    throw new Error('home bootstrap missing mods array');
  }
  const entries = homeBootstrapResp.data?.pagePack?.data || [];
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error('home bootstrap missing pagePack data array');
  }
  await expectEtag304(homePath, homeBootstrapResp.headers.get('etag'));
  console.log('[OK] home bootstrap etag 304 verified');

  const sampleItem = entries.map(itemFromBrowserEntry).find((item) => item?.itemId);
  if (!sampleItem?.itemId) {
    throw new Error('home bootstrap did not expose a sample item');
  }

  const producedBy = unwrapEnvelope(await optionalJson(`/api/recipes/current/item/${encodeURIComponent(sampleItem.itemId)}`));
  const usedIn = unwrapEnvelope(await optionalJson(`/api/recipes/current/usage/${encodeURIComponent(sampleItem.itemId)}`));
  for (const [label, payload] of [['producedBy', producedBy], ['usedIn', usedIn]]) {
    if (!payload) continue;
    if (payload.itemId !== sampleItem.itemId || !Array.isArray(payload.recipes)) {
      throw new Error(`current recipe ${label} query returned invalid shape`);
    }
  }
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

  await expectNotFound('/lab/items');
  await expectNotFound('/lab/recipes');
  await expectNotFound('/lab/recipe-bootstrap');
  console.log('[OK] retired lab dynamic read namespaces return 404');

  console.log('[REGRESSION] PASS');
}

main().catch((error) => {
  console.error('[REGRESSION] FAIL', error.message || error);
  process.exit(1);
});
