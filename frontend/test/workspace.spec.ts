import { test, expect, chromium } from '@playwright/test';
import { createRequire } from 'node:module';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

test('one workspace retains the browser through recipe intents, topics and history navigation', async ({ page, request }, testInfo) => {
  const manifest = await (await request.get('/api/catalog')).json();
  const errors: string[] = [], recipeRequests: string[] = [], interactionWorkers: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('worker', worker => { if (/\/interaction\.worker-/.test(worker.url())) interactionWorkers.push(worker.url()); });
  page.on('request', request => {
    if (/\/api\/catalog\/[^/]+\/recipes(?:\/|\?|$)/.test(new URL(request.url()).pathname)) recipeRequests.push(request.url());
  });
  await page.goto(`/?catalog=${manifest.id}`);
  const navigation = page.getByRole('navigation', { name: /^(工作区|Workspace)$/, exact: true });
  await expect(navigation).toBeVisible();
  await expect(navigation.getByRole('link')).toHaveCount(1);
  await page.locator('.chrome-search-input').fill('shitou');
  const stone = page.locator('.items-column').getByRole('button', { name: /Stone 石头/ }).first();
  await expect(stone).toBeVisible();
  await page.locator('.items-column').evaluate(node => { (window as any).__workspaceBrowser = node; });
  await stone.click({ button: 'right' });
  const status = page.locator('.workspace-presentation-status');
  await expect(status).toHaveAttribute('data-status', 'presentationUnavailable');
  await expect(status).toHaveAttribute('data-direction', 'uses');
  await expect(stone).toHaveClass(/--selected/);
  await expect(page.locator('.history-strip .native-browser-surface__fallback-item').first()).toHaveAttribute('title', /Stone 石头/);
  const intent = new URL(page.url());
  expect(intent.pathname).toBe('/');
  expect(intent.searchParams.get('direction')).toBe('uses');
  expect(intent.searchParams.get('item')).toMatch(/^item_/);
  const sequence = await status.getAttribute('data-sequence');
  await stone.click({ button: 'right' });
  await expect(status).not.toHaveAttribute('data-sequence', sequence!);
  expect(await page.evaluate(id => JSON.parse(localStorage.getItem('viewHistory:' + id) ?? '[]').length, manifest.id)).toBe(1);
  const acknowledged = await status.getAttribute('data-sequence');
  await stone.click({ modifiers: ['Alt'] });
  const star = stone.locator('..').locator('.native-browser-surface__favorite');
  await expect(star).toHaveAttribute('aria-pressed', 'true');
  await expect(status).toHaveAttribute('data-sequence', acknowledged!);
  expect(await page.evaluate(id => JSON.parse(localStorage.getItem('viewHistory:' + id) ?? '[]').length, manifest.id)).toBe(1);
  await stone.click({ modifiers: ['Alt'] });
  await expect(star).toHaveAttribute('aria-pressed', 'false');
  expect(await page.locator('.items-column').boundingBox()).toEqual({ x: 892.8125, y: 0, width: 547.1875, height: 1000 });
  expect(await page.locator('.history-strip').boundingBox()).toEqual({ x: 892.8125, y: 848, width: 547.1875, height: 152 });
  await page.locator('.items-column').screenshot({ path: testInfo.outputPath('protected-browser.png') });
  await page.locator('.history-strip').screenshot({ path: testInfo.outputPath('protected-history.png') });
  expect(recipeRequests).toEqual([]);
  const recipeUrl = page.url();
  await navigation.locator('summary').click();
  await navigation.getByRole('link', { name: /^(要素|Aspects)$/, exact: true }).click();
  await expect(page.locator('.topic-browser')).toBeVisible();
  await expect(page.locator('.chrome-search-input')).toHaveValue('shitou');
  await expect.poll(() => page.locator('.items-column').evaluate(node => node === (window as any).__workspaceBrowser)).toBe(true);
  await page.goBack();
  await expect(page).toHaveURL(recipeUrl);
  await expect(status).toHaveAttribute('data-status', 'presentationUnavailable');
  await navigation.getByRole('button', { name: /^(设置|Settings)$/, exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText(/数据与离线|Data and offline access/);
  await expect(page.getByRole('dialog')).not.toContainText('样板管理');
  await expect(page.getByRole('dialog')).not.toContainText('UI Studio');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('workspace.png'), fullPage: true });
  expect(recipeRequests).toEqual([]);
  expect(interactionWorkers).toEqual([]);
  expect(errors).toEqual([]);
});

test('recipe bookmarks retain exact intent and invalid targets are not silently mapped', async ({ page, request }) => {
  const manifest = await (await request.get('/api/catalog')).json();
  const locale = manifest.locale === 'zh_CN' ? 'zh-CN' : 'en-US';
  const items = await (await request.get(`/api/catalog/${manifest.id}/items?query=shitou&limit=1`)).json();
  const item = items.rows[0].id;
  const recipes = await (await request.get(`/api/catalog/${manifest.id}/recipes?item=${item}&direction=uses&limit=1`)).json();
  const recipe = recipes.rows[0].id;
  const links = [
    [`/recipe/${item}`, 'item', item, 'recipes'],
    [`/entry/${item}`, 'item', item, 'uses'],
    [`/oracle/${item}`, 'item', item, 'uses'],
    [`/recipe-by-id/${recipe}`, 'recipe', recipe, 'uses'],
  ];
  for (const [path, kind, target, direction] of links) {
    await page.goto(`${path}?catalog=${manifest.id}&direction=${direction}&lang=${locale}#native`);
    const status = page.locator('.workspace-presentation-status');
    await expect(status).toHaveAttribute('data-status', 'presentationUnavailable');
    await expect(status).toHaveAttribute('data-target', target);
    const current = new URL(page.url());
    expect(current.pathname).toBe('/');
    expect(current.searchParams.get(kind)).toBe(target);
    expect(current.searchParams.get('catalog')).toBe(manifest.id);
    expect(current.searchParams.get('lang')).toBe(locale);
    expect(current.hash).toBe('#native');
  }
  for (const target of ['item_' + '0'.repeat(64), 'minecraft:stone/not-an-id']) {
    await page.goto(`/recipe/${encodeURIComponent(target)}?catalog=${manifest.id}&q=inert`);
    await expect(page.locator('.workspace-presentation-status')).toHaveAttribute('data-status', 'invalidTarget');
    expect(new URL(page.url()).searchParams.get('item')).toBe(target);
    await expect(page.locator('.chrome-search-input')).toHaveValue('');
  }
  await page.goto(`/recipe/${item}?catalog=${manifest.id}&lang=${locale === 'en-US' ? 'zh-CN' : 'en-US'}`);
  await expect(page.locator('.workspace-content [role="alert"]')).toBeVisible();
  await expect(page.locator('.workspace-presentation-status')).toHaveAttribute('data-status', 'failed');
});

test('breeding routes use the current Catalog and expose parent conditions in the topic page', async ({ page, request }, testInfo) => {
  const manifest = await (await request.get('/api/catalog')).json();
  const topics = await (await request.get(`/api/catalog/${manifest.id}/topics?kind=bee&offset=0&limit=100`)).json();
  let selected = '';
  for (const topic of topics.rows) {
    const detail = await (await request.get(`/api/catalog/${manifest.id}/species/${topic.id}`)).json();
    if (detail.origins > 0) { selected = topic.id; break; }
  }
  expect(selected).toBeTruthy();
  await page.goto(`/bee/${selected}?catalog=${manifest.id}&view=tree`);
  await expect(page.getByRole('region', { name: /^(育种路线图|Breeding tree)$/ })).toBeVisible();
  await expect(page.locator('.breeding-node')).toHaveCount(3);
  await expect(page.locator('.breeding-tree')).toContainText(/基础概率|Base chance/);
  await expect(page.locator('.breeding-tree [role="alert"]')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('breeding-tree.png'), fullPage: true });
  const target = await page.locator('.breeding-parents .breeding-species').first().textContent();
  await page.locator('.breeding-parents .breeding-species').first().click();
  await expect(page.locator('.genetics-detail h2')).toContainText(target!.trim());
});

test('retired links redirect into current topics and settings without losing snapshot identity', async ({ page, request }) => {
  const manifest = await (await request.get('/api/catalog')).json();
  await page.goto(`/gt-diagrams?catalog=${manifest.id}&tab=materials#parts`);
  await expect(page).toHaveURL(new RegExp(`/materials\\?catalog=${manifest.id}.*#parts`));
  await expect(page.locator('.topic-browser')).toBeVisible();
  await page.goto(`/forestry-bee-tree?catalog=${manifest.id}`);
  await expect(page).toHaveURL(/\/bees\?.*view=tree/);
  await expect(page.locator('.topic-browser')).toBeVisible();
  await page.goto(`/runtime-health?catalog=${manifest.id}`);
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(new URL(page.url()).searchParams.get('catalog')).toBe(manifest.id);
  await page.getByRole('button', { name: /^(关闭设置中心|Close settings)$/ }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).not.toHaveURL(/settings=1/);
});

test('narrow workspace switches between content and its mounted item browser', async ({ page, request }, testInfo) => {
  const manifest = await (await request.get('/api/catalog')).json();
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`/aspects?catalog=${manifest.id}`);
  await expect(page.locator('.topic-browser')).toBeVisible();
  await page.getByRole('button', { name: /^(浏览物品|Browse items)$/, exact: true }).click();
  await expect(page.locator('.items-column')).toBeVisible();
  await expect(page.locator('.workspace-content')).toBeHidden();
  await page.getByRole('button', { name: /^(返回内容|Back to content)$/, exact: true }).click();
  await expect(page.locator('.topic-browser')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('mobile-topics.png'), fullPage: true });
  await page.getByRole('button', { name: /^(浏览物品|Browse items)$/, exact: true }).click();
  await page.locator('.chrome-search-input').fill('shitou');
  await page.locator('.items-column').getByRole('button', { name: /Stone 石头/ }).first().click({ button: 'right' });
  await expect(page.locator('.workspace-presentation-status')).toHaveAttribute('data-status', 'presentationUnavailable');
  await expect(page.locator('.workspace-presentation-status')).toBeVisible();
  await page.getByRole('button', { name: /^(浏览物品|Browse items)$/, exact: true }).click();
  expect(await page.locator('.items-column').boundingBox()).toEqual({ x: 0, y: 0, width: 375, height: 812 });
  expect(await page.locator('.history-strip').boundingBox()).toEqual({ x: 0, y: 660, width: 375, height: 152 });
  await page.locator('.items-column').screenshot({ path: testInfo.outputPath('protected-browser.png') });
  await page.locator('.history-strip').screenshot({ path: testInfo.outputPath('protected-history.png') });
});

test('workspace reopens offline with its backend stopped, including cold topics and recipe intents', async ({}, testInfo) => {
  // Two persistent contexts plus several cold offline documents exceed a single interaction's budget.
  test.setTimeout(60000);
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const { createApp } = createRequire(import.meta.url)(process.env.NEONEI_TEST_BACKEND ?? '../../backend/dist/app.js');
  const server = createApp({ catalog: process.env.NEONEI_TEST_CATALOG ?? join(root, 'fixtures/semantic-40'), web: process.env.NEONEI_TEST_WEB ?? join(root, 'frontend/dist') }).listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const baseURL = `http://127.0.0.1:${server.address().port}`;
  const directory = await mkdtemp(join(tmpdir(), 'neonei-workspace-'));
  const options = { headless: true, baseURL, viewport: { width: 1440, height: 1000 } };
  let context = await chromium.launchPersistentContext(directory, options);
  const errors: string[] = [], apiRequests: string[] = [];
  try {
    const manifest = await (await fetch(baseURL + '/api/catalog')).json();
    let page = await context.newPage();
    await page.goto(`/offline?catalog=${manifest.id}`);
    await page.getByRole('button', { name: /^(保存完整资料|Save complete data)$/, exact: true }).click();
    await expect(page.locator('.offline-copy')).toHaveAttribute('data-state', 'ready', { timeout: 20000 });
    await context.close();
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error: Error | undefined) => error ? reject(error) : resolve()));
    context = await chromium.launchPersistentContext(directory, { ...options, offline: true });
    context.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/')) apiRequests.push(request.url()); });
    page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    const response = await page.goto(`/aspects?catalog=${manifest.id}&offline=1`);
    expect(response?.fromServiceWorker()).toBe(true);
    await expect(page.locator('.topic-browser')).toBeVisible();
    await expect(page.locator('.topic-list > button').first()).toBeVisible();
    await page.locator('.topic-list > button').first().click();
    await expect(page.locator('.magic-detail h2')).toBeVisible();
    await page.getByRole('navigation', { name: /^(工作区|Workspace)$/ }).getByRole('link', { name: /^(物品与配方|Items and recipes)$/ }).click();
    await page.locator('.chrome-search-input').fill('shitou');
    await page.locator('.items-column').getByRole('button', { name: /Stone 石头/ }).first().click({ button: 'right' });
    await expect(page.locator('.workspace-presentation-status')).toHaveAttribute('data-status', 'presentationUnavailable');
    await page.reload();
    await expect(page.locator('.workspace-presentation-status')).toHaveAttribute('data-status', 'presentationUnavailable');
    await page.screenshot({ path: testInfo.outputPath('offline-reopened.png'), fullPage: true });
    if (process.env.NEONEI_TEST_NATIVE_REFERENCES === '1') {
      await page.goto(`/mobs?catalog=${manifest.id}&offline=1`);
      await expect(page.getByRole('link', { name: 'Native fixture mob', exact: true })).toBeVisible();
      await page.getByRole('link', { name: 'Native fixture mob', exact: true }).click();
      await expect(page.locator('.drop-card')).toContainText('数量 3');
      await expect(page.locator('.drop-card')).toContainText('Native conditional note');
      await page.reload(); await expect(page.locator('.drop-card')).toContainText('附魔强度 30');
      await page.goto(`/lexicon?catalog=${manifest.id}&offline=1`);
      await expect(page.locator('.lexicon-entry')).toContainText('Native botania.entry.fixture');
      await expect(page.locator('.lexicon-entry')).toContainText('Second line');
      await page.screenshot({ path: testInfo.outputPath('native-references-offline.png'), fullPage: true });
      await page.goto(`/infernal-drops?catalog=${manifest.id}&offline=1`);
      await expect(page.locator('.infernal-pool-item')).toHaveCount(2);
      await expect(page.locator('.infernal-pool-item').first()).toContainText('加载时数量 3');
      await page.getByRole('button',{name:'超级',exact:true}).click();
      await expect(page.locator('.infernal-pool-item')).toContainText('原生随机附魔书');
      await page.reload();await expect(page.locator('.infernal-pool-item')).toHaveCount(1);
      await page.screenshot({path:testInfo.outputPath('infernal-offline-reopened.png'),fullPage:true});
      await page.goto(`/draconic-reactor?catalog=${manifest.id}&offline=1`);
      await expect(page.locator('.reactor-page tbody tr')).toHaveCount(7);
      await expect(page.locator('.reactor-rules')).toContainText('严格大于');
      await page.reload();await expect(page.locator('.reactor-page')).toContainText('11664');
      await page.screenshot({path:testInfo.outputPath('reactor-offline-reopened.png'),fullPage:true});
      await page.locator('.reactor-page .reactor-section').last().scrollIntoViewIfNeeded();
      await page.locator('.workspace-content').evaluate(element=>{element.scrollTop=element.scrollHeight;});
      await expect(page.locator('.reactor-page dd').last()).toBeInViewport();
      expect(await page.locator('.reactor-page dd').last().evaluate(element=>{
        const box=element.getBoundingClientRect();return element.contains(document.elementFromPoint(box.x+box.width/2,box.y+box.height/2));
      })).toBe(true);
      await page.screenshot({path:testInfo.outputPath('reactor-config-offline.png'),fullPage:true});
    }
    expect(apiRequests).toEqual([]); expect(errors).toEqual([]);
  } finally {
    await context.close();
    if (server.listening) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(resolve)); }
  }
});
