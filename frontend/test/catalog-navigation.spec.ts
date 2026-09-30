import { test, expect } from '@playwright/test';

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
  await slot.click({ button: 'right' });
  await expect(page).toHaveURL(new RegExp(`/recipe/${stone.id}\\?`));
  expect(new URL(page.url()).searchParams.get('catalog')).toBe(manifest.id);
  expect(new URL(page.url()).searchParams.get('mode')).toBe('u');
  await expect(page.locator('.recipe-by-id-page')).toHaveCount(0);
  await expect(page.locator('.recipe-view .recipe-content')).toBeVisible();
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
