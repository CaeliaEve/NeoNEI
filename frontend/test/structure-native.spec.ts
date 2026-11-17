import { test, expect, chromium } from '@playwright/test';
import { createRequire } from 'node:module';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('Native structure data, component navigation and geometry survive stopped-backend offline reopen', async ({}, testInfo) => {
  test.skip(process.env.NEONEI_TEST_NATIVE_REFERENCES !== '1', 'Requires actual Compiler native-reference selection fixture');
  test.setTimeout(50000);
  const { createApp } = createRequire(import.meta.url)(process.env.NEONEI_TEST_BACKEND!);
  const server = createApp({ catalog: process.env.NEONEI_TEST_CATALOG!, web: process.env.NEONEI_TEST_WEB! }).listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const baseURL = `http://127.0.0.1:${server.address().port}`;
  const directory = await mkdtemp(join(tmpdir(), 'neonei-structure-'));
  const options = { headless: true, baseURL, viewport: { width: 1440, height: 1000 } };
  let context = await chromium.launchPersistentContext(directory, options);
  const errors: string[] = [], offlineApi: string[] = [], componentRequests: string[] = [];
  try {
    const manifest = await (await fetch(baseURL + '/api/catalog')).json();
    const structureId = 'structure_60121920be22a7def181e7913289a931a1f9644ff26833b3621742ff442e0057';
    const endpoint = `${baseURL}/api/catalog/${manifest.id}/structures/${structureId}`;
    const response = await fetch(endpoint);
    expect(response.status).toBe(200);
    const detail = await response.json();
    expect(manifest.scope).toBe('selection');
    expect(detail.structure.definitionKind).toBe('construction');
    expect(detail.structure.pieces).toEqual([]);
    expect(detail.information.controller.data.maxTier).toBe(3);
    expect(detail.information.controller.data.channels).toEqual({ coil: 3 });
    const matched = await (await fetch(endpoint + '/components?offset=0&limit=1')).json();
    const unresolved = await (await fetch(endpoint + '/components?offset=1&limit=1')).json();
    expect(matched.total).toBe(2);
    expect(matched.rows[0].data.items).toHaveLength(1);
    expect(matched.related.items[0].registry).toBe('minecraft:stick');
    expect(unresolved.rows[0].data.items).toEqual([]);
    const build = await (await fetch(`${baseURL}/api/catalog/${manifest.id}/builds/${detail.structure.variants[0].build}`)).json();
    expect(build.build.facing).toBe('north');
    expect(build.build.rendered).toBe(false);
    expect(build.build.size).toEqual([2, 1, 1]);
    expect(build.blocks.map((block: { registry: string }) => block.registry).sort()).toEqual(['minecraft:furnace', 'minecraft:stone']);

    let page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (new URL(request.url()).pathname.endsWith('/components')) componentRequests.push(request.url()); });
    const target = `/structure/${structureId}?catalog=${manifest.id}`;
    await page.goto(target);
    await expect(page.getByRole('heading', { name: 'Furnace', exact: true })).toBeVisible();
    await expect(page.locator('.native-structure-information')).toContainText('参数上限：3');
    await expect(page.locator('.native-structure-information')).toContainText('coil');
    await expect(page.getByRole('button', { name: '片段定义', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: '原生外观', exact: true })).toBeDisabled();
    await expect(page.locator('.structure-detail')).toContainText('2 个已放置方块');
    await expect(page.locator('.structure-detail')).toContainText('构建朝向北');
    await expect(page.getByRole('img', { name: '多方块三维结构' })).toBeVisible();
    expect(componentRequests).toEqual([]);
    await page.getByRole('button', { name: '查看部件关联', exact: true }).click();
    await expect(page.locator('.native-component-row')).toHaveCount(2);
    await expect(page.locator('.native-component-row')).toContainText(['构建参数 2', '没有可显示的物品列表样本']);
    await page.locator('.native-component-row .item-link').click({ button: 'right' });
    await expect(page).toHaveURL(/\/recipe\/item_602cd4fd.*direction=uses/, { timeout: 1500 });
    await page.goBack();
    await page.getByRole('button', { name: '查看部件关联', exact: true }).click();
    await expect(page.locator('.native-component-row')).toHaveCount(2);
    await page.screenshot({ path: testInfo.outputPath('structure-online.png'), fullPage: true });
    const canvas = page.getByRole('img', { name: '多方块三维结构' });
    await canvas.scrollIntoViewIfNeeded();
    const pixelColors = await canvas.evaluate((element: HTMLCanvasElement) => {
      const gl = element.getContext('webgl2')!;
      const pixels = new Uint8Array(element.width * element.height * 4);
      gl.readPixels(0, 0, element.width, element.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      const colors = new Set<number>();
      for (let index = 0; index < pixels.length; index += 16) colors.add(pixels[index]! * 65536 + pixels[index + 1]! * 256 + pixels[index + 2]!);
      return colors.size;
    });
    expect(pixelColors).toBeGreaterThan(2);
    await page.screenshot({ path: testInfo.outputPath('structure-geometry.png'), fullPage: true });
    const blocks = page.getByRole('region', { name: '装配方块', exact: true });
    await blocks.getByRole('button', { name: /^minecraft:furnace\s*:\s*3\s*×\s*1$/ }).click();
    const nbt = blocks.getByRole('button', { name: '方块实体数据', exact: true });
    await nbt.click();
    await expect(blocks.locator('.block-data')).toContainText('BurnTime');
    await page.locator('.workspace-content').evaluate(element => { element.scrollTop = element.scrollHeight; });
    await expect(nbt).toBeInViewport();
    expect(await nbt.evaluate(element => {
      const rect = element.getBoundingClientRect();
      return element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
    })).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('structure-block-nbt.png'), fullPage: true });
    await page.reload();
    await expect(page.locator('.structure-detail')).toContainText('2 个已放置方块');
    await expect(page.getByRole('alert')).toHaveCount(0);

    await page.goto(`/offline?catalog=${manifest.id}`);
    await page.getByRole('button', { name: '保存完整资料', exact: true }).click();
    await expect(page.locator('.offline-copy')).toHaveAttribute('data-state', 'ready', { timeout: 20000 });
    await context.close();
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error: Error | undefined) => error ? reject(error) : resolve()));
    context = await chromium.launchPersistentContext(directory, { ...options, offline: true });
    context.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/')) offlineApi.push(request.url()); });
    page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    const offlineResponse = await page.goto(target + '&offline=1');
    expect(offlineResponse?.fromServiceWorker()).toBe(true);
    await expect(page.locator('.structure-detail')).toContainText('2 个已放置方块');
    await page.getByRole('button', { name: '查看部件关联', exact: true }).click();
    await expect(page.locator('.native-component-row')).toHaveCount(2);
    await expect(page.locator('.native-component-row')).toContainText(['构建参数 2', '没有可显示的物品列表样本']);
    await page.reload();
    await expect(page.locator('.structure-detail')).toContainText('构建朝向北');
    await expect(page.getByRole('alert')).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath('structure-offline-reopened.png'), fullPage: true });
    expect(errors).toEqual([]);
    expect(offlineApi).toEqual([]);
    await writeFile(testInfo.outputPath('verification.json'), JSON.stringify({
      scope: 'local native selection fixture; model pixels and full pack unverified',
      catalog: manifest.id, structure: structureId, definitionKind: detail.structure.definitionKind,
      maxTier: 3, nativeChannels: { coil: 3 }, componentLookups: matched.total, unresolvedLookups: 1,
      build: { facing: build.build.facing, cells: build.build.cells, rendered: build.build.rendered },
      geometryPixelColors: pixelColors, blockNbtReadable: true, componentNavigation: true, offlineReopened: true, errors, offlineApi,
    }, null, 2));
  } finally {
    await context.close();
    if (server.listening) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(resolve)); }
  }
});
