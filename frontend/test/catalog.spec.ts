import { test, expect, chromium } from '@playwright/test';
import type { Manifest } from '@elysium/contracts';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('a slow search cannot replace a newer search and errors are visible', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.locator('.native-browser-surface__fallback-item').first()).toBeVisible();
  await context.route('**/items?**', async route => {
    const query = new URL(route.request().url()).searchParams.get('query');
    if (query === 'water') await new Promise(resolve => setTimeout(resolve, 400));
    if (query === 'broken') {
      await route.fulfill({
        status: 422, contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'invalid_catalog', message: '测试：索引校验失败' } }),
      });
    } else await route.continue();
  });
  const search = page.locator('.chrome-search-input');
  const pending = context.waitForEvent('request', request => new URL(request.url()).searchParams.get('query') === 'water');
  await search.fill('water');
  await pending;
  await search.fill('shitou');
  await expect(page.locator('.native-browser-surface__fallback-item')).toHaveCount(1);
  await expect(page.getByRole('button', { name: /Stone 石头/ }).first()).toBeVisible();
  await page.waitForTimeout(450);
  await expect(page.getByRole('button', { name: /Stone 石头/ }).first()).toBeVisible();
  await search.fill('broken');
  await expect(page.getByRole('alert').filter({ hasText: '测试：索引校验失败' })).toBeVisible();
});

test('offline copies resume, repair corruption, survive browser restart and remove across tabs', async ({ request, baseURL }) => {
  const manifest = await (await request.get('/api/catalog')).json() as Manifest;
  const directory = await mkdtemp(join(tmpdir(), 'neonei-browser-'));
  const options = { headless: true, baseURL };
  let context = await chromium.launchPersistentContext(directory, options);
  try {
    let page = await context.newPage();
    const seen: string[] = [];
    let resumed = false, corrupted = false, blocked = false;
    let release!: () => void;
    const continued = new Promise<void>(resolve => { release = resolve; });
    const image = manifest.files.find(file => file.kind === 'image')!;
    await context.route('**/assets/**', async route => {
      const path = new URL(route.request().url()).pathname;
      seen.push(path);
      if (!resumed && path.endsWith(manifest.files[4]!.path)) { blocked = true; await continued; }
      if (corrupted && path.endsWith(image.path)) await route.fulfill({ status: 200, body: Buffer.alloc(image.bytes) });
      else await route.continue();
    });
    await page.goto('/offline');
    await page.getByRole('button', { name: '保存完整资料', exact: true }).click();
    await expect.poll(async () => {
      expect(await page.getByRole('alert').allTextContents()).toEqual([]);
      return blocked;
    }).toBe(true);
    await page.getByRole('button', { name: '暂停下载', exact: true }).click();
    resumed = true; release();
    const copy = page.locator('.offline-copy');
    await expect(copy).toHaveAttribute('data-state', 'partial');
    await expect(page.getByRole('link', { name: '离线打开', exact: true })).toHaveCount(0);
    await copy.getByRole('button', { name: '继续下载', exact: true }).click();
    await expect(copy).toHaveAttribute('data-state', 'ready');
    for (const file of manifest.files.slice(0, 2)) expect(seen.filter(path => path.endsWith(file.path))).toHaveLength(1);

    await page.evaluate(async ({ id, path }) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const open = indexedDB.open('neonei.catalog');
        open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error);
      });
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = database.transaction('files', 'readwrite');
          tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error);
          tx.objectStore('files').put({ catalog: id, path, body: new Uint8Array([0]).buffer });
        });
      } finally { database.close(); }
    }, { id: manifest.id, path: image.path });
    corrupted = true;
    await copy.getByRole('button', { name: '校验与修复', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('摘要与清单不一致');
    await expect(copy).toHaveAttribute('data-state', 'partial');
    await expect(page.getByRole('link', { name: '离线打开', exact: true })).toHaveCount(0);

    await page.evaluate(async () => {
      for (const name of await caches.keys()) {
        if (name.startsWith('neonei.shell.')) await (await caches.open(name)).delete('/index.html');
      }
      const registration = await navigator.serviceWorker.getRegistration('/');
      if (!registration || !await registration.unregister()) throw new Error('Expected the existing shell registration');
    });
    corrupted = false;
    await copy.getByRole('button', { name: '继续下载', exact: true }).click();
    await expect(copy).toHaveAttribute('data-state', 'ready');
    expect(seen.filter(path => path.endsWith(image.path))).toHaveLength(3);
    await context.close();

    context = await chromium.launchPersistentContext(directory, options);
    await context.setOffline(true);
    page = await context.newPage();
    await page.goto('/');
    await expect(page.getByText('离线副本', { exact: true })).toBeVisible();
    await page.locator('.chrome-search-input').fill('shitou');
    await expect(page.getByRole('button', { name: /Stone 石头/ }).first()).toBeVisible();
    await expect.poll(() => page.locator('.native-browser-surface__fallback-item canvas').first().evaluate(element => {
      const canvas = element as HTMLCanvasElement;
      return canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
        .some((value, index) => index % 4 === 3 && value > 0);
    })).toBe(true);
    const library = await context.newPage();
    await page.goto('/?catalog=' + 'a'.repeat(64) + '&offline=1');
    await expect(page.getByRole('alert')).toContainText('尚未完整保存');
    await page.goto('/?catalog=' + manifest.id + '&offline=1');
    await expect(page.getByText('离线副本', { exact: true })).toBeVisible();
    await library.goto('/offline');
    await library.locator('.offline-copy').getByRole('button', { name: '移除副本', exact: true }).click();
    await expect(library.locator('.offline-copy')).toHaveCount(0);
    await expect(page.getByRole('alert')).toContainText('尚未完整保存');
    const counts = await library.evaluate(async () => {
      const database = await new Promise<IDBDatabase>(resolve => {
        const open = indexedDB.open('neonei.catalog'); open.onsuccess = () => resolve(open.result);
      });
      try {
        return await Promise.all(['catalogs', 'manifests', 'files'].map(store => new Promise<number>(resolve => {
          const count = database.transaction(store).objectStore(store).count(); count.onsuccess = () => resolve(count.result);
        })));
      } finally { database.close(); }
    });
    expect(counts).toEqual([0, 0, 0]);
  } finally { await context.close(); }
});
