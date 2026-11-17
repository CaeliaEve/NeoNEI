import { test, expect, chromium } from '@playwright/test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('ore registry pages show original registration metadata and empty groups', async ({ page, request }, testInfo) => {
  const manifest = await (await request.get('/api/catalog')).json();
  const response = await request.get(`/api/catalog/${manifest.id}/topics?kind=ore`);
  expect(response.status()).toBe(200);
  const topics = await response.json();
  const group = topics.rows.find((row: any) => row.name === 'oreFixture');
  expect(group).toBeTruthy();
  // Keep the real API and compiled records; reduce response page size to exercise navigation with this small fixture.
  await page.route('**/ore-groups/*/members?*', async route => {
    const url = new URL(route.request().url()); url.searchParams.set('limit', '2');
    await route.fulfill({ response: await route.fetch({ url: url.toString() }) });
  });
  await page.goto(`/ore/${group.id}?catalog=${manifest.id}`);
  await expect(page.locator('.ore-detail h2')).toHaveText('oreFixture');
  await expect(page.locator('.ore-member')).toHaveCount(2);
  await expect(page.locator('.ore-member').first()).toContainText('32767');
  await expect(page.locator('.ore-member').nth(1)).toContainText('-4');
  await page.locator('.ore-member').first().getByRole('button', { name: '查看原始 NBT' }).click();
  await expect(page.locator('.ore-member pre')).toContainText('wildcard');
  await page.screenshot({ path: testInfo.outputPath('ore-page.png'), fullPage: true });
  await page.getByRole('button', { name: '登记成员下一页' }).click();
  await expect(page.locator('.ore-member')).toHaveCount(1);
  await expect(page.locator('.ore-member')).toContainText('无展示项');
  await expect(page.locator('.ore-position')).toHaveText('#3');
  await page.getByRole('button', { name: '查看 oreVacant', exact: true }).click();
  await expect(page.locator('.ore-detail')).toContainText('此组没有登记成员');
  await page.getByRole('navigation', { name: '工作区' }).locator('summary').click();
  await page.getByRole('navigation', { name: '工作区' }).getByRole('link', { name: '矿辞', exact: true }).click();
  await expect(page).toHaveURL(/\/ore-groups\?/);
});

test('saved ore registry pages reopen cold without a network', async ({ request, baseURL }) => {
  test.setTimeout(60000);
  const manifest = await (await request.get('/api/catalog')).json();
  const api = `/api/catalog/${manifest.id}`;
  const topics = await (await request.get(`${api}/topics?kind=ore`)).json();
  const group = topics.rows.find((row: any) => row.name === 'oreFixture');
  expect(group).toBeTruthy();
  const directory = await mkdtemp(join(tmpdir(), 'neonei-domains-offline-'));
  const options = { headless: true, baseURL, viewport: { width: 1440, height: 1000 } };
  const errors: string[] = [], offlineApiRequests: string[] = [];
  let context = await chromium.launchPersistentContext(directory, options);
  async function reopen(path: string) {
    await context.close();
    context = await chromium.launchPersistentContext(directory, { ...options, offline: true });
    context.on('request', request => {
      if (new URL(request.url()).pathname.startsWith('/api/')) offlineApiRequests.push(request.url());
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    const response = await page.goto(`${path}?catalog=${manifest.id}&offline=1`);
    expect(response?.fromServiceWorker()).toBe(true);
    expect(await page.evaluate(() => navigator.onLine)).toBe(false);
    return page;
  }
  try {
    let page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    // Save the complete application and catalog without warming either domain route.
    await page.goto(`/offline?catalog=${manifest.id}`);
    await page.getByRole('button', { name: '保存完整资料', exact: true }).click();
    await expect(page.locator('.offline-copy')).toHaveAttribute('data-state', 'ready');
    await expect(page.getByRole('link', { name: '离线打开', exact: true })).toBeVisible();
    await page.waitForFunction(() => navigator.serviceWorker.controller?.state === 'activated');

    page = await reopen(`/ore/${group.id}`);
    await expect(page.getByText('离线副本', { exact: true })).toBeVisible();
    await expect(page.locator('.ore-detail h2')).toHaveText('oreFixture');
    await expect(page.locator('.ore-member')).toHaveCount(3);
    await expect(page.locator('.ore-member').first()).toContainText('32767');
    await expect(page.locator('.ore-member').nth(1)).toContainText('-4');
    await expect(page.locator('.ore-member').last()).toContainText('无展示项');
    await page.locator('.ore-member').first().getByRole('button', { name: '查看原始 NBT' }).click();
    await expect(page.locator('.ore-member pre')).toContainText('wildcard');
    await page.getByRole('button', { name: '查看 oreVacant', exact: true }).click();
    await expect(page.locator('.ore-detail')).toContainText('此组没有登记成员');
    expect(new URL(page.url()).searchParams.get('offline')).toBe('1');
    await expect(page.getByRole('alert')).toHaveCount(0);

    await expect(page.getByRole('alert')).toHaveCount(0);
    expect(offlineApiRequests).toEqual([]);
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});

test('aspect details retain readable domain layout on direct entry', async ({ page, request }) => {
  const manifest = await (await request.get('/api/catalog')).json();
  const topics = await (await request.get(`/api/catalog/${manifest.id}/topics?kind=aspect&offset=0&limit=20`)).json();
  expect(topics.rows.length).toBeGreaterThan(0);
  await page.goto(`/aspect/${topics.rows[0].id}?catalog=${manifest.id}`);
  await expect(page.locator('.magic-title h2')).toBeVisible();
  await expect(page.locator('.industry-workspace')).toHaveCSS('display', 'grid');
  await expect(page.locator('.topic-list')).toHaveCSS('flex-direction', 'column');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(5, 6, 8)');
  const color = await page.locator('.magic-detail').evaluate(el => getComputedStyle(el).color);
  const channels = color.match(/\d+/g)!.slice(0, 3).map(Number);
  expect(Math.min(...channels)).toBeGreaterThan(150);
  const titleIcon = page.locator('.magic-title canvas');
  await expect(titleIcon).toHaveCount(1);
  await expect(titleIcon).toHaveCSS('width', '48px');
  await expect.poll(() => titleIcon.evaluate((c: HTMLCanvasElement) => c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data.some((v, i) => i % 4 === 3 && v > 0))).toBe(true);
});

test('registered butterfly and flower pages retain their own traits and breeding routes', async ({ page, request }) => {
  const manifest = await (await request.get('/api/catalog')).json();
  for (const [kind, list, name] of [['butterfly', 'butterflies', '蝴蝶'], ['flower', 'flowers', '花卉']]) {
    const topics = await (await request.get(`/api/catalog/${manifest.id}/topics?kind=${kind}`)).json();
    expect(topics.rows).toHaveLength(1);
    await page.goto(`/${kind}/${topics.rows[0].id}?catalog=${manifest.id}`);
    await expect(page.locator('.genetics-detail h2')).toContainText(name);
    await expect(page.getByRole('region', { name: '物种形态' })).toBeVisible();
    await expect(page.locator('.mutation-card')).toHaveCount(1);
    await expect(page.getByRole('heading', { name: '产物', exact: true })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: '特产', exact: true })).toHaveCount(0);
    if (kind === 'flower') await expect(page.locator('.species-traits')).toContainText('土壤酸碱度：中性');
    else await expect(page.locator('.species-traits')).toContainText('自然活动：夜间');
    await page.locator('.mutation-card .mutation-cross a').first().click();
    await expect(page).toHaveURL(new RegExp(`/${kind}/${topics.rows[0].id}\\?`));
    await page.getByRole('navigation', { name: '工作区' }).locator('summary').click();
    await page.getByRole('navigation', { name: '工作区' }).getByRole('link', { name, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/${list}\\?`));
  }
});
