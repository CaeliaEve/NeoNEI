import { test, expect, chromium } from '@playwright/test';
import { createRequire } from 'node:module';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('Native quest declarations preserve optional tasks and choices after stopped-backend offline reopen', async ({}, testInfo) => {
  test.skip(process.env.NEONEI_TEST_NATIVE_REFERENCES !== '1', 'Requires actual Compiler native-reference fixture');
  test.setTimeout(45000);
  const { createApp } = createRequire(import.meta.url)(process.env.NEONEI_TEST_BACKEND!);
  const server = createApp({ catalog: process.env.NEONEI_TEST_CATALOG!, web: process.env.NEONEI_TEST_WEB! }).listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const baseURL = `http://127.0.0.1:${server.address().port}`, directory = await mkdtemp(join(tmpdir(), 'neonei-quests-'));
  const options = { headless: true, baseURL, viewport: { width: 1440, height: 1000 } };
  let context = await chromium.launchPersistentContext(directory, options);
  const errors: string[] = [], offlineApi: string[] = [];
  try {
    const manifest = await (await fetch(baseURL + '/api/catalog')).json();
    let page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    await page.goto('/quests?catalog=' + manifest.id);
    await expect(page.getByRole('heading', { name: '任务资料', exact: true })).toBeVisible();
    await expect(page.locator('.quest-entry')).toHaveCount(1);
    await expect(page.locator('.quest-task')).toHaveCount(13); await expect(page.locator('.quest-reward')).toHaveCount(6);
    await expect(page.locator('.quest-prerequisites')).toContainText('已登记但本次隐藏');
    await expect(page.locator('.quest-prerequisites')).toContainText('原生目标缺失');
    const optional = page.locator('.quest-task').nth(1); await optional.locator('summary').first().click();
    await expect(optional.locator('.quest-optional')).toContainText('不作为任务逻辑的必需条件');
    await expect(optional.locator('.quest-stack')).toHaveCount(12);
    await expect(optional).toContainText('250,000');
    await optional.getByRole('button', { name: '下一组材料', exact: true }).click(); await expect(optional.locator('.quest-stack')).toHaveCount(5);
    await expect(optional.locator('.quest-rule-pager')).toContainText('13～17 / 17');
    await page.screenshot({ path: testInfo.outputPath('quests-optional.png'), fullPage: true });
    await optional.locator('summary').first().click();
    const choice = page.locator('.quest-reward').nth(1); await choice.locator('summary').first().click();
    await expect(choice.locator('.quest-choice')).toContainText('选择 1 项');
    await expect(choice.locator('.quest-stack-policy')).toContainText('矿辞候选不是额外奖励');
    const scoreboard = page.locator('.quest-reward').nth(4); await scoreboard.locator('summary').first().click();
    await expect(scoreboard).toContainText('deathCount');
    await page.locator('.quest-policy summary').click();
    await page.locator('.workspace-content').evaluate(element => { element.scrollTop = element.scrollHeight; });
    const policy = page.locator('.quest-policy'); await expect(policy).toBeInViewport();
    expect(await policy.evaluate(element => { const rect = element.getBoundingClientRect(); return element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)); })).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('quests-rewards.png'), fullPage: true });
    await page.getByRole('searchbox', { name: '查找任务' }).fill('no-native-quest');
    await page.getByRole('button', { name: '搜索', exact: true }).click();
    await expect(page.getByText('没有符合筛选条件的可见任务。', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '清空筛选', exact: true }).click(); await expect(page.locator('.quest-entry')).toHaveCount(1);
    await page.locator('.quest-identity button').click(); await expect(page).toHaveURL(/quest=00000000-0000-0000-0000-000000000001/);
    await page.reload(); await expect(page.locator('.quest-entry')).toHaveCount(1); const target = page.url();
    await page.goto('/offline?catalog=' + manifest.id); await page.getByRole('button', { name: '保存完整资料', exact: true }).click();
    await expect(page.locator('.offline-copy')).toHaveAttribute('data-state', 'ready', { timeout: 20000 });
    await context.close(); server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close((error: Error | undefined) => error ? reject(error) : resolve()));
    context = await chromium.launchPersistentContext(directory, { ...options, offline: true });
    context.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/')) offlineApi.push(request.url()); });
    page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    const location = new URL(target); location.searchParams.set('offline', '1');
    const response = await page.goto(location.toString()); expect(response?.fromServiceWorker()).toBe(true);
    await expect(page.locator('.quest-entry')).toHaveCount(1); await page.reload(); await expect(page.locator('.quest-task')).toHaveCount(13);
    await page.locator('.quest-reward').nth(1).locator('summary').first().click(); await expect(page.locator('.quest-choice')).toContainText('选择 1 项');
    await page.screenshot({ path: testInfo.outputPath('quests-offline-reopened.png'), fullPage: true });
    expect(offlineApi).toEqual([]); expect(errors).toEqual([]);
  } finally {
    await context.close(); if (server.listening) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(resolve)); }
  }
});
