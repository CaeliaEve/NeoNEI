import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('villager page renders raw offer semantics and preserves item navigation', async ({ page, request }, testInfo) => {
  const fixture = JSON.parse(await readFile(new URL('../../../elysium-compiler/contracts/fixtures/villager-trades-contract.json', import.meta.url), 'utf8'));
  const manifest = await (await request.get('/api/catalog')).json();
  const professions = fixture.records.filter(row => row.data.kind === 'villagerProfession');
  const offers = fixture.records.filter(row => row.data.kind === 'villagerOffer');
  const strings = fixture.items.map((item, index) => ({ id: 'text_villager_' + index, locale: 'en_US', text: item.registry.split(':')[1] }));
  const items = fixture.items.map((item, index) => ({ ...item, durability: 0, stackLimit: 64, tools: {}, armor: false, tooltip: [], icon: null, order: null, aspects: null, name: strings[index].id }));
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/catalog/*/villager-trades?*', async route => {
    const url = new URL(route.request().url());
    await route.fulfill({ json: { domain: fixture.records[0].domain, professions, rows: offers, total: offers.length,
      offset: Number(url.searchParams.get('offset')), limit: Number(url.searchParams.get('limit')),
      related: { items, strings, categories: [], textures: [], fluids: [], topics: [] } } });
  });
  await page.goto('/?catalog=' + manifest.id);
  const navigation = page.getByRole('navigation', { name: '工作区', exact: true });
  await navigation.locator('summary').click();
  await navigation.getByRole('link', { name: '村民交易', exact: true }).click();
  await expect(page.getByRole('heading', { name: '村民交易', exact: true })).toBeVisible();
  await expect(page.locator('.offer')).toHaveCount(1);
  await expect(page.locator('.exchange')).toContainText('-2147483648 / -3 / 0 / 2 / 5 / 2147483647');
  await expect(page.locator('.exchange')).toContainText('随机附魔等级 30');
  await expect(page.locator('.native-count-note')).toContainText('不是可执行的物品消耗规则');
  await page.locator('.offer summary').click();
  await expect(page.locator('.offer details')).toContainText('1.25');
  await expect(page.locator('.offer details')).toContainText('不是兑换成功率');
  await page.getByRole('combobox', { name: '职业', exact: true }).selectOption('3');
  await expect(page).toHaveURL(/profession=3/);
  await expect(page.locator('.offer')).toHaveCount(1);
  await page.setViewportSize({ width: 700, height: 850 });
  await page.screenshot({ path: testInfo.outputPath('villager-trade.png'), fullPage: true });
  const input = offers[0].data.inputs[0].item;
  await page.locator('.offer [data-item="' + input + '"]').click({ button: 'right' });
  await expect(page).toHaveURL(new RegExp('/recipe/' + input + '.*tab=usedIn'));
  await page.goBack();
  await expect(page.locator('.offer')).toHaveCount(1);
  expect(errors).toEqual([]);
});
