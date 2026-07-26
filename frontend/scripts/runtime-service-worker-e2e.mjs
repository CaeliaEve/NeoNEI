import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { chromium } from '@playwright/test';

const workerSource = await readFile(new URL('../public/neonei-sw.js', import.meta.url));
let mode = 'alpha';

const browserExecutable = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  chromium.executablePath(),
  process.env.ProgramFiles ? join(process.env.ProgramFiles, 'Google', 'Chrome', 'Application', 'chrome.exe') : null,
  process.env['ProgramFiles(x86)'] ? join(process.env['ProgramFiles(x86)'], 'Microsoft', 'Edge', 'Application', 'msedge.exe') : null,
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].find((candidate) => candidate && existsSync(candidate));
if (!browserExecutable) throw new Error('No Chromium-compatible browser executable is available');

const server = createServer((request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (url.pathname === '/neonei-sw.js') {
    response.writeHead(200, {
      'content-type': 'text/javascript',
      'cache-control': 'no-store',
      'service-worker-allowed': '/',
    });
    response.end(workerSource);
    return;
  }
  if (url.pathname === '/') {
    response.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' });
    response.end(`<!doctype html><script>
      window.registerRuntimeWorker = async () => {
        await navigator.serviceWorker.register('/neonei-sw.js', { scope: '/' });
        await navigator.serviceWorker.ready;
      };
      window.runtimeCacheStatus = () => new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('status timeout')), 2000);
        const listener = (event) => {
          if (event.data?.type !== 'NEONEI_RUNTIME_CACHE_STATUS_RESULT') return;
          clearTimeout(timer);
          navigator.serviceWorker.removeEventListener('message', listener);
          resolve(event.data.payload);
        };
        navigator.serviceWorker.addEventListener('message', listener);
        navigator.serviceWorker.controller.postMessage({ type: 'NEONEI_RUNTIME_CACHE_STATUS' });
      });
    </script>`);
    return;
  }
  if (url.pathname === '/control') {
    mode = url.searchParams.get('mode') || mode;
    response.writeHead(204, { 'cache-control': 'no-store' });
    response.end();
    return;
  }
  if (url.pathname === '/api/runtime/current/manifest') {
    if (mode === 'offline') {
      request.socket.destroy();
      return;
    }
    const body = mode === 'corrupt'
      ? '{not-json'
      : JSON.stringify({ ok: true, data: { runtimeId: mode }, meta: { runtimeId: mode } });
    response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    response.end(body);
    return;
  }
  if (url.pathname === '/api/runtime/current/asset/rust/browser.bin') {
    if (mode === 'offline') {
      request.socket.destroy();
      return;
    }
    response.writeHead(200, {
      'content-type': 'application/octet-stream',
      'cache-control': 'no-store',
      'x-neonei-runtime-id': mode,
    });
    response.end(`${mode}-pack`);
    return;
  }
  response.writeHead(404);
  response.end('not found');
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
const origin = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({
  headless: true,
  executablePath: browserExecutable,
});
const context = await browser.newContext({ serviceWorkers: 'allow' });
const page = await context.newPage();

async function setMode(nextMode) {
  await page.request.get(`${origin}/control?mode=${encodeURIComponent(nextMode)}`);
}

async function fetchManifest() {
  return page.evaluate(async () => {
    const response = await fetch('/api/runtime/current/manifest');
    return {
      runtimeId: response.headers.get('x-neonei-runtime-id'),
      text: await response.text(),
    };
  });
}

async function fetchPack() {
  return page.evaluate(async () => (await fetch('/api/runtime/current/asset/rust/browser.bin')).text());
}

try {
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => window.registerRuntimeWorker());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));

  const alpha = await fetchManifest();
  assert.equal(alpha.runtimeId, 'alpha');
  assert.equal(await fetchPack(), 'alpha-pack');

  await setMode('beta');
  const beta = await fetchManifest();
  assert.equal(beta.runtimeId, 'beta');
  assert.equal(await fetchPack(), 'beta-pack');

  await setMode('offline');
  const offline = await fetchManifest();
  assert.equal(offline.runtimeId, 'beta');
  assert.equal(await fetchPack(), 'beta-pack');

  await setMode('corrupt');
  const afterCorruption = await fetchManifest();
  assert.equal(afterCorruption.runtimeId, 'beta');
  assert.match(afterCorruption.text, /"runtimeId":"beta"/);

  await setMode('alpha');
  const rollback = await fetchManifest();
  assert.equal(rollback.runtimeId, 'alpha');
  assert.equal(await fetchPack(), 'alpha-pack');
  const status = await page.evaluate(() => window.runtimeCacheStatus());
  assert.equal(status.runtimeId, 'alpha');
  assert.ok(status.entryCount >= 2);

  console.log(JSON.stringify({
    status: 'passed',
    browser: 'chromium',
    scenarios: ['initial', 'update', 'offline', 'corrupt-manifest', 'rollback'],
    finalRuntimeId: status.runtimeId,
    finalEntryCount: status.entryCount,
    finalApproxBytes: status.approxBytes,
  }, null, 2));
} finally {
  await context.close();
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
