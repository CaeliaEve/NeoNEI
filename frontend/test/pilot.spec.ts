import { test, expect } from '@playwright/test';

for (const offline of [false, true]) test(`${offline ? 'offline' : 'online'} optimize homepage searches and opens recipes`, async ({ page, context, request }) => {
  const manifest = await (await request.get('/api/catalog')).json();
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  if (offline) {
    await page.goto('/offline');
    await page.getByRole('button', { name: '保存完整资料', exact: true }).click();
    await expect(page.getByRole('link', { name: '离线打开', exact: true })).toBeVisible({ timeout: 20000 });
    await context.setOffline(true);
  }
  await page.goto(`/?catalog=${manifest.id}${offline ? '&offline=1' : ''}`);
  await expect(page.locator('.items-column')).toBeVisible();
  await page.locator('.chrome-search-input').fill('shitou');
  await expect(page.locator('.native-browser-surface__fallback-item')).toHaveCount(1);
  const stone = page.getByRole('button', { name: /Stone 石头/ }).first();
  await expect(stone).toBeVisible();
  await expect.poll(() => stone.locator('canvas').evaluate((canvas: HTMLCanvasElement) =>
    canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data.some((v, i) => i % 4 === 3 && v > 0))).toBe(true);
  await stone.click({ button: 'right' });
  await expect(page.locator('.recipe-preview-panel')).toBeVisible();
  await expect(page.locator('.recipe-preview-panel')).not.toContainText('正在加载配方');
  await expect(page.locator('.recipe-preview-panel')).not.toContainText('读取配方失败');
  await expect(page.locator('.recipe-preview-panel .recipe-view')).toBeVisible();
  await expect(page.locator('.recipe-preview-panel [role="alert"]')).toHaveCount(0);
  const animations = page.getByRole('img', { name: '配方进度动画', exact: true });
  await expect(animations).toHaveCount(2);
  const frames = new Set<string>();
  await expect.poll(async () => {
    frames.add(await animations.first().evaluate((canvas: HTMLCanvasElement) => {
      const ctx = canvas.getContext('2d')!;
      return [[.25,.25],[.75,.25],[.25,.75],[.75,.75]].map(([x,y]) => ctx.getImageData(Math.floor(x!*canvas.width),Math.floor(y!*canvas.height),1,1).data[3]! > 0 ? '1' : '0').join('');
    }));
    return frames.size;
  }, { intervals: [40], timeout: 5000 }).toBe(4);
  await page.getByText('用量与条件', { exact: true }).click();
  await expect(page.locator('.recipe-preview-panel')).toContainText('9,007,199,254,740,993');
  const input = page.locator('.recipe-preview-panel .recipe-view .stack-slot').first();
  await input.getByRole('button', { name: '查看 3 个候选输入', exact: true }).click();
  const choices = page.locator('.choices-dialog');
  await expect(choices.locator('.choice-note').nth(2)).toContainText('排除 1 条前序匹配：Priority reference 前序匹配（精确匹配）');
  await expect(choices.locator('.choice-note').nth(1)).toHaveText('消耗 · 仅忽略字段：frypanKill；其余 NBT 精确匹配');
  await choices.locator('.choice-list .item-link').nth(1).click();
  await expect(input.locator('.quantity')).toHaveText('7');
  await expect(input.locator(':scope > .item-link')).toHaveAttribute('title', /仅忽略字段：frypanKill；其余 NBT 精确匹配/);
  await page.screenshot({ path: `test-results/pilot-${offline ? 'offline' : 'online'}.png`, fullPage: true });
  expect(errors).toEqual([]);
});

test('production offline library saves the shell and verified images', async ({ page, context, request }) => {
  const manifest = await (await request.get('/api/catalog')).json();
  const image = manifest.files.find((file: { kind: string }) => file.kind === 'image');
  await page.goto('/offline');
  await page.getByRole('button', { name: '保存完整资料', exact: true }).click();
  await expect(page.getByRole('link', { name: '离线打开', exact: true })).toBeVisible({ timeout: 20000 });
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('link', { name: '离线打开', exact: true })).toBeVisible();
  const digest = await page.evaluate(async (url: string) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Offline image failed: ' + response.status);
    return [...new Uint8Array(await crypto.subtle.digest('SHA-256', await response.arrayBuffer()))].map(n => n.toString(16).padStart(2, '0')).join('');
  }, `/assets/${manifest.id}/${image.path}`);
  expect(digest).toBe(image.sha256);
  await page.evaluate(async ({ id, path }) => {
    const db = await new Promise<IDBDatabase>(resolve => { const open = indexedDB.open('neonei.catalog'); open.onsuccess = () => resolve(open.result); });
    await new Promise<void>((resolve, reject) => { const tx = db.transaction('files', 'readwrite'); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.objectStore('files').put({ catalog: id, path, body: new Uint8Array([0]).buffer }); });
    db.close();
  }, { id: manifest.id, path: image.path });
  expect(await page.evaluate(async url => (await fetch(url)).status, `/assets/${manifest.id}/${image.path}`)).toBe(503);
});
