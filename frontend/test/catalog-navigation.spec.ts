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
  await page.getByRole('navigation', { name: '浏览分类' }).getByRole('link', { name: '矿辞', exact: true }).click();
  await expect(page).toHaveURL(/\/ore-groups\?/);
});

test('direct recipe slots navigate to uses without losing the catalog', async ({ page, request }) => {
  const manifest = await (await request.get('/api/catalog')).json();
  const base = `/api/catalog/${manifest.id}`;
  const items = await (await request.get(`${base}/items?query=stone&offset=0&limit=24`)).json();
  const stone = items.rows.find((item: any) => item.registry === 'minecraft:stone');
  expect(stone).toBeTruthy();
  const recipes = await (await request.get(`${base}/recipes?item=${stone.id}&direction=uses&offset=0&limit=4`)).json();
  expect(recipes.rows.length).toBeGreaterThan(0);
  await page.goto(`/recipe-by-id/${recipes.rows[0].id}?catalog=${manifest.id}`);
  const slot = page.locator('.recipe-card .item-link').filter({ has: page.getByRole('img', { name: /Stone 石头/ }) }).first();
  await expect(slot).toBeVisible();
  const alternatives = slot.locator('..').getByRole('button', { name: /查看 \d+ 个候选输入/ });
  await alternatives.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: '关闭候选输入' }).click();
  await alternatives.click({ button: 'right' });
  await expect(page).toHaveURL(new RegExp(`/recipe/${stone.id}\\?`));
  expect(new URL(page.url()).searchParams.get('catalog')).toBe(manifest.id);
  expect(new URL(page.url()).searchParams.get('mode')).toBe('u');
  await expect(page.locator('.recipe-by-id-page')).toHaveCount(0);
  await expect(page.locator('.recipe-view .recipe-content')).toBeVisible();
  const category = recipes.related.categories.find((c: any) => c.id === recipes.rows[0].category);
  const categoryName = recipes.related.strings.find((s: any) => s.id === category.name).text;
  await expect(page.locator('.recipe-view-root')).toContainText(categoryName);
  if (category.icon?.kind === 'item' || category.machines.some((m: any) => m.kind === 'item')) {
    await expect.poll(() => page.locator('.machine-icon-container canvas').first().evaluate((c: HTMLCanvasElement) => c.getContext('2d')!.getImageData(0,0,c.width,c.height).data.some((v,i)=>i%4===3&&v>0))).toBe(true);
  }
  await expect(page.locator('.recipe-view-root')).not.toContainText(/(?:item|string)_[a-f0-9]{64}/);
});

test('floating flower recipe describes last special input and fresh output while preserving item navigation', async ({ page, request }, testInfo) => {
  const manifest = await (await request.get('/api/catalog')).json();
  const api = `/api/catalog/${manifest.id}`;
  const items = await (await request.get(`${api}/items?query=Floating%20pure%20daisy`)).json();
  expect(items.rows).toHaveLength(1);
  const recipes = await (await request.get(`${api}/recipes?direction=recipes&item=${items.rows[0].id}`)).json();
  const row = recipes.rows.find((row: any) => row.process?.kind === 'floatingFlowers');
  expect(row).toBeTruthy();
  await page.goto(`/recipe-by-id/${row.id}?catalog=${manifest.id}`);
  await expect(page.locator('.recipe-changes')).toContainText('最后一朵特殊花');
  await expect(page.locator('.recipe-changes')).toContainText('只保留类型');
  await expect(page.locator('.recipe-card')).toContainText('3 个占用格、其中 2 朵特殊花');
  const finalInput = page.locator('.recipe-card .stack-slot .item-link').filter({ has: page.getByRole('img', { name: 'Special flower 特殊花' }) }).last();
  await expect(finalInput).toHaveAttribute('title', /type 必须缺失或为字符串/);
  await page.screenshot({ path: testInfo.outputPath('floating-flower.png'), fullPage: true });
  await finalInput.click({ button: 'right' });
  await expect(page).toHaveURL(new RegExp(`/recipe/${row.inputs[2].choices[0].id}\\?`));
  expect(new URL(page.url()).searchParams.get('mode')).toBe('u');
  expect(new URL(page.url()).searchParams.get('catalog')).toBe(manifest.id);
});

test('saved ore and floating flower pages reopen cold without a network', async ({ request, baseURL }) => {
  test.setTimeout(60000);
  const manifest = await (await request.get('/api/catalog')).json();
  const api = `/api/catalog/${manifest.id}`;
  const topics = await (await request.get(`${api}/topics?kind=ore`)).json();
  const group = topics.rows.find((row: any) => row.name === 'oreFixture');
  expect(group).toBeTruthy();
  const items = await (await request.get(`${api}/items?query=Floating%20pure%20daisy`)).json();
  expect(items.rows).toHaveLength(1);
  const recipes = await (await request.get(`${api}/recipes?direction=recipes&item=${items.rows[0].id}`)).json();
  const recipe = recipes.rows.find((row: any) => row.process?.kind === 'floatingFlowers');
  expect(recipe).toBeTruthy();

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

    // Restart again so the recipe route also loads into a fresh offline process.
    page = await reopen(`/recipe-by-id/${recipe.id}`);
    await expect(page.locator('.recipe-changes')).toContainText('最后一朵特殊花');
    await expect(page.locator('.recipe-changes')).toContainText('只保留类型');
    await expect(page.locator('.recipe-card')).toContainText('3 个占用格、其中 2 朵特殊花');
    const finalInput = page.locator('.recipe-card .stack-slot .item-link').filter({ has: page.getByRole('img', { name: 'Special flower 特殊花' }) }).last();
    await expect(finalInput).toHaveAttribute('title', /type 必须缺失或为字符串/);
    await page.getByText('当前结果 NBT', { exact: true }).click();
    expect(JSON.parse((await page.locator('.recipe-changes pre').textContent())!)).toEqual({
      type: 'compound', value: { type: { type: 'string', value: 'pureDaisy' } },
    });
    const output = page.locator('.recipe-card .stack-slot').getByRole('img', { name: 'Floating pure daisy 浮空白雏菊', exact: true }).first();
    await expect.poll(() => output.evaluate((canvas: HTMLCanvasElement) => canvas.width > 0 && canvas.getContext('2d')!
      .getImageData(0, 0, canvas.width, canvas.height).data.some((value, index) => index % 4 === 3 && value > 0))).toBe(true);
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
    await page.getByRole('navigation', { name: '浏览分类' }).getByRole('link', { name, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/${list}\\?`));
  }
});
