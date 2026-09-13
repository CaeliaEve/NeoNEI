import { test, expect, chromium } from '@playwright/test';
import type { Manifest } from '@elysium/contracts';
import type { Locator } from '@playwright/test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function painted(scene: Locator): Promise<number> {
  return scene.evaluate(element => {
    const canvas = element as HTMLCanvasElement, gl = canvas.getContext('webgl2');
    if (!gl) return 0;
    const pixels = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    let count = 0;
    for (let index = 0; index < pixels.length; index += 4) if (pixels[index]! + pixels[index + 1]! + pixels[index + 2]! > 100) count++;
    return count;
  });
}

async function modelPixels(scene: Locator): Promise<{ texture: number; glass: number }> {
  return scene.evaluate(element => {
    const canvas = element as HTMLCanvasElement, gl = canvas.getContext('webgl2')!;
    const pixels = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    let texture = 0, glass = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      const r = pixels[index]!, g = pixels[index + 1]!, b = pixels[index + 2]!;
      if (r > 90 && b > 50 && Math.abs(r - g - 16) < 3 && Math.abs(g - b - 16) < 3) texture++;
      if (r > 40 && b > 40 && g > r + 8 && g > b + 8) glass++;
    }
    return { texture, glass };
  });
}

async function clipping(canvas: Locator): Promise<string> {
  return canvas.evaluateAll(elements => {
    const states = elements.map(element => {
      const canvas = element as HTMLCanvasElement, context = canvas.getContext('2d')!;
      return [[.25, .25], [.75, .25], [.25, .75], [.75, .75]].map(([x, y]) =>
        context.getImageData(Math.floor(canvas.width * x!), Math.floor(canvas.height * y!), 1, 1).data[3]! > 0 ? '1' : '0').join('');
    });
    if (!states.length || states.some(state => state !== states[0])) throw new Error('Native UI layers lost their shared phase');
    return states[0]!;
  });
}

for (const offline of [false, true]) test(`${offline ? 'offline' : 'online'} browse, search, recipes and all domain pages share the same catalog`, async ({ page, context }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  if (offline) {
    await page.goto('/offline');
    await page.getByRole('button', { name: '保存完整资料', exact: true }).click();
    await expect(page.getByRole('link', { name: '离线打开', exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller?.state)).toBe('activated');
    await page.screenshot({ path: 'test-results/offline-library.png', fullPage: true });
    await context.setOffline(true);
  }
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '物品浏览' })).toBeVisible();
  if (offline) await expect(page.getByText('离线副本', { exact: true })).toBeVisible();
  const stone = page.getByRole('button', { name: 'Stone 石头', exact: true });
  await expect(stone).toBeVisible();
  for (const [query, name, registry] of [
    ['Armor Stand', 'Armor Stand 盔甲架', 'BiblioCraft:Armor Stand'],
    ['ProjRed|Core', 'ProjectRed part 注册样本', 'ProjRed|Core:projectred.core.part'],
    ['Liquid Crystal', 'Liquid Crystal 流体样本', 'Liquid Crystal'],
  ]) {
    await page.getByRole('searchbox', { name: '搜索物品', exact: true }).fill(query!);
    const match = page.getByRole('button', { name: name!, exact: true });
    await expect(match).toBeVisible();
    expect(await match.getAttribute('title')).toContain(registry);
  }
  await page.getByRole('searchbox', { name: '搜索物品', exact: true }).fill('');
  await expect(stone).toBeVisible();
  await expect.poll(() => stone.locator('canvas').evaluate(canvas => {
    const context = (canvas as HTMLCanvasElement).getContext('2d')!;
    return Array.from(context.getImageData(0, 0, canvas.width, canvas.height).data).filter((_, index) => index % 4 === 3).some(alpha => alpha > 0);
  })).toBe(true);
  await page.getByRole('searchbox', { name: '搜索物品', exact: true }).fill('shitou');
  await expect(page.locator('.browser-cell')).toHaveCount(1);
  await stone.click({ button: 'right' });
  await expect(page.locator('.recipe-card')).toHaveCount(1);
  await expect(page.getByRole('button', { name: '用途', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const animations = page.getByRole('img', { name: '配方进度动画', exact: true }), animation = animations.first();
  await expect(animations).toHaveCount(2);
  await expect(animation).toBeVisible();
  const states = new Set<string>();
  await expect.poll(async () => { states.add(await clipping(animations)); return states.size; }, { intervals: [40], timeout: 4000 }).toBe(4);
  expect([...states].sort()).toEqual(['0000', '0110', '1010', '1111']);
  await page.getByRole('button', { name: '打开设置', exact: true }).click();
  await page.getByLabel('播放纹理与界面动画').uncheck();
  await page.getByRole('button', { name: '关闭设置', exact: true }).click();
  const paused = await clipping(animations);
  await page.waitForTimeout(300);
  expect(await clipping(animations)).toBe(paused);
  await page.locator('.recipe-view .stack-slot').first().getByRole('button').click({ button: 'right' });
  await expect(page.getByRole('button', { name: '用途', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '打开设置', exact: true }).click();
  await page.getByLabel('播放纹理与界面动画').check();
  await page.getByRole('button', { name: '关闭设置', exact: true }).click();
  await expect.poll(() => clipping(animations), { intervals: [40] }).not.toBe(paused);
  await expect.poll(() => clipping(animations), { intervals: [40] }).toBe('1111');
  await page.screenshot({ path: `test-results/motion-${offline ? 'offline' : 'online'}.png`, fullPage: true });
  await page.getByText('用量与条件', { exact: true }).click();
  await expect(page.getByText('9,007,199,254,740,993', { exact: true })).toBeVisible();
  await expect(page.getByText('1/3 · ≈33.33%', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '添加书签', exact: true }).click();
  await page.getByRole('button', { name: '打开设置', exact: true }).click();
  await page.getByLabel('图标尺寸').selectOption('64');
  await page.getByRole('button', { name: '关闭设置', exact: true }).click();
  await page.screenshot({ path: 'test-results/catalog.png', fullPage: true });
  const url = page.url();
  expect(url).toMatch(/catalog=[a-f0-9]{64}/);
  await page.reload();
  await expect(page.getByRole('button', { name: '移除书签', exact: true })).toBeVisible();
  await page.getByRole('link', { name: '相关蜜蜂', exact: true }).click();
  await expect(page.locator('.topic-list > button')).toHaveCount(2);
  await page.getByRole('searchbox', { name: '搜索蜜蜂资料' }).fill('zajiaofeng');
  await page.getByRole('button', { name: '查看 Fixture hybrid 杂交蜂', exact: true }).click();
  await expect(page.getByRole('region', { name: '产物', exact: true }).getByText('基础概率 30%', { exact: true })).toBeVisible();
  await expect(page.locator('.mutation-card')).toHaveCount(2);
  await expect(page.getByText('基础概率 7.5%', { exact: true })).toBeVisible();
  await page.getByText('默认基因', { exact: true }).click();
  await expect(page.getByText('Fixture speed', { exact: true })).toBeVisible();
  await page.locator('.mutation-card').first().getByText('突变结果基因', { exact: true }).click();
  await expect(page.locator('.mutation-card').first().getByText('Fixture fast allele', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/genetics.png', fullPage: true });
  await page.reload();
  await expect(page.locator('.mutation-card')).toHaveCount(2);
  await page.getByRole('button', { name: '参与杂交 · 1', exact: true }).click();
  await expect(page.locator('.mutation-card')).toHaveCount(1);
  await page.locator('.mutation-card').getByRole('link', { name: 'Fixture bee 蜜蜂', exact: true }).click();
  await expect(page.locator('.genetics-detail h2')).toHaveText('Fixture bee 蜜蜂');
  await page.getByRole('button', { name: '参与杂交 · 2', exact: true }).click();
  await expect(page.locator('.mutation-card')).toHaveCount(2);
  await page.getByRole('navigation', { name: '浏览分类' }).getByRole('link', { name: '树木', exact: true }).click();
  await page.getByRole('button', { name: '查看 Fixture tree 树木', exact: true }).click();
  await expect(page.getByText('可能产物 · 概率未提供', { exact: true })).toBeVisible();
  await expect(page.getByText('已列入黑名单', { exact: true })).toBeVisible();
  await expect(page.getByText('基础概率 100%', { exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.genetics-detail h2')).toHaveText('Fixture tree 树木');
  await page.goto(url);
  await expect(page.locator('.browser-cell').first()).toHaveCSS('width', '64px');
  await expect(page.locator('.recipe-card')).toHaveCount(1);
  await page.getByRole('button', { name: '单独打开此配方', exact: true }).click();
  await expect(page).toHaveURL(/\/recipe\/recipe_/);
  await expect(page.locator('.recipe-card')).toHaveCount(1);
  await page.getByRole('navigation', { name: '浏览分类' }).getByRole('link', { name: '材料', exact: true }).click();
  await page.getByRole('searchbox', { name: '搜索材料资料' }).fill('hejin');
  await expect(page.locator('.topic-list > button')).toHaveCount(1);
  await page.getByRole('button', { name: '查看 Fixture alloy 合金', exact: true }).click();
  await expect(page.getByRole('region', { name: '材料组成' }).getByText('9,007,199,254,740,993')).toBeVisible();
  await expect(page.getByText('1/9 材料单位 / 件', { exact: true })).toBeVisible();
  await expect(page.locator('.material-parts article')).toHaveCount(2);
  await page.screenshot({ path: 'test-results/industry.png', fullPage: true });
  await page.reload();
  await expect(page.locator('.material-parts article')).toHaveCount(2);
  await page.getByRole('region', { name: '材料组成' }).getByRole('link').click();
  await expect(page.locator('.industry-detail h2')).toHaveText('Fixture base 基材');
  await page.getByRole('navigation', { name: '浏览分类' }).getByRole('link', { name: '电路', exact: true }).click();
  await page.getByRole('button', { name: '查看 Fixture circuit 电路', exact: true }).click();
  await expect(page.locator('.tier')).toHaveText('LV32 EU');
  await page.locator('.circuit-steps').getByRole('button').click();
  await expect(page).toHaveURL(/\/entry\/item_/);
  await expect(page.getByRole('button', { name: '移除书签', exact: true })).toBeVisible();
  await page.getByRole('link', { name: '相关结构', exact: true }).click();
  await page.getByRole('searchbox', { name: '搜索多方块结构' }).fill('duofangkuai');
  await page.getByRole('button', { name: '查看 Fixture furnace 多方块', exact: true }).click();
  await expect(page.getByRole('button', { name: '整体装配', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('region', { name: '装配方块' }).getByRole('button', { name: /fixture:controller/ })).toBeVisible();
  await page.getByRole('region', { name: '装配方块' }).getByRole('button', { name: /fixture:controller/ }).click();
  await page.getByRole('button', { name: '方块实体数据', exact: true }).click();
  await expect(page.locator('.block-data')).toContainText('9007199254740993');
  await expect.poll(() => painted(page.getByRole('img', { name: '多方块三维结构', exact: true }))).toBeGreaterThan(100);
  const modelScene = page.getByRole('img', { name: '多方块三维结构', exact: true });
  await expect(page.getByRole('button', { name: '原生外观', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => (await modelPixels(modelScene)).texture).toBeGreaterThan(1000);
  await expect.poll(async () => (await modelPixels(modelScene)).glass).toBeGreaterThan(100);
  await modelScene.click();
  await expect(page.locator('.structure-position')).toContainText('坐标 A');
  await page.getByRole('button', { name: '方块示意', exact: true }).click();
  await expect.poll(async () => (await modelPixels(modelScene)).texture).toBe(0);
  await page.getByRole('button', { name: '原生外观', exact: true }).click();
  await expect.poll(async () => (await modelPixels(modelScene)).texture).toBeGreaterThan(1000);
  await page.screenshot({ path: 'test-results/assembly.png', fullPage: true });
  const parameters = page.getByRole('combobox', { name: '构建参数' });
  await expect(parameters).toHaveValue('0');
  await expect(parameters.locator('option')).toHaveText(['数量 1 · 默认通道', '数量 4 · coil=2']);
  await parameters.selectOption('1');
  await expect(page).toHaveURL(/variant=1/);
  await expect(page.getByText('坐标范围 3 × 3 × 4 · 34 个已放置方块', { exact: true })).toBeVisible();
  await expect(page.getByText('原生渲染中有 1 个位置不单独绘制，方块数量仍计入统计。', { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: '装配方块' }).getByRole('button', { name: 'minecraft:stone : 0 × 33', exact: true })).toBeVisible();
  await expect.poll(() => painted(page.getByRole('img', { name: '多方块三维结构', exact: true }))).toBeGreaterThan(100);
  await page.reload();
  await expect(parameters).toHaveValue('1');
  await expect(page.getByText('坐标范围 3 × 3 × 4 · 34 个已放置方块', { exact: true })).toBeVisible();
  await page.goBack();
  await expect(parameters).toHaveValue('0');
  await expect(page.getByText('坐标范围 3 × 3 × 3 · 26 个已放置方块', { exact: true })).toBeVisible();
  await page.goForward();
  await expect(parameters).toHaveValue('1');
  await expect(page.getByText('坐标范围 3 × 3 × 4 · 34 个已放置方块', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/parameters.png', fullPage: true });
  const selectedVariant = page.url(), missingVariant = new URL(selectedVariant);
  missingVariant.searchParams.set('variant', '99');
  await page.goto(missingVariant.href);
  await expect(page.getByRole('alert')).toContainText('请求的构建参数不存在');
  await expect(page.getByRole('img', { name: '多方块三维结构', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '查看首组参数', exact: true }).click();
  await expect(page.getByText('坐标范围 3 × 3 × 3 · 26 个已放置方块', { exact: true })).toBeVisible();
  await page.goto(selectedVariant);
  await expect(parameters).toHaveValue('1');
  await page.getByRole('button', { name: '片段定义', exact: true }).click();
  const scene = page.getByRole('img', { name: '多方块三维结构', exact: true });
  await expect(scene).toBeVisible();
  await expect.poll(() => painted(scene)).toBeGreaterThan(100);
  await scene.click();
  await expect(page.locator('.structure-position')).toContainText('坐标 A');
  const layer = page.getByRole('slider', { name: '结构高度层' });
  await layer.focus(); await layer.press('Home'); await layer.press('ArrowRight'); await layer.press('ArrowRight');
  await expect(layer).toHaveValue('1');
  await page.getByLabel('显示空气', { exact: true }).check();
  await page.screenshot({ path: 'test-results/structures.png', fullPage: true });
  await page.reload();
  await expect(page.locator('.structure-detail h2')).toHaveText('Fixture furnace 多方块');
  await expect(parameters).toHaveValue('1');
  await expect(page.getByRole('img', { name: '多方块三维结构', exact: true })).toBeVisible();
  await page.goto(url);
  await expect(page.getByRole('region', { name: '物品要素' })).toContainText('× 3');
  await page.getByRole('region', { name: '物品要素' }).getByRole('link', { name: 'Lux 光', exact: true }).click();
  await expect(page.locator('.magic-detail h2')).toHaveText('Lux 光');
  await expect(page.getByRole('region', { name: '要素组成' }).getByRole('link')).toHaveCount(2);
  await page.getByRole('region', { name: '要素组成' }).getByRole('link', { name: 'Aer 气', exact: true }).click();
  await expect(page.locator('.knowledge-state')).toHaveText('快照知识：状态未知');
  await page.getByRole('navigation', { name: '魔法资料分类' }).getByRole('link', { name: '研究', exact: true }).click();
  await page.getByRole('searchbox', { name: '搜索研究资料' }).fill('lianjin');
  await page.getByRole('button', { name: '查看 Fixture alchemy 炼金', exact: true }).click();
  await expect(page.locator('.knowledge-state')).toHaveText('快照知识：尚未完成');
  await expect(page.getByRole('region', { name: '前置研究', exact: true })).toContainText('状态未知');
  await expect(page.getByRole('region', { name: '隐藏连线的前置条件' })).toContainText('@fixture_scanned');
  await page.screenshot({ path: 'test-results/magic.png', fullPage: true });
  await page.reload();
  await expect(page.locator('.magic-detail h2')).toHaveText('Fixture alchemy 炼金');
  await page.getByRole('region', { name: '前置研究', exact: true }).getByRole('link').click();
  await expect(page.locator('.magic-detail h2')).toHaveText('Fixture basics 基础');
  await expect(page.locator('.knowledge-state')).toHaveText('快照知识：状态未知');
  await page.getByRole('navigation', { name: '浏览分类' }).getByRole('link', { name: '物品', exact: true }).click();
  await page.getByRole('button', { name: 'Paper 纸', exact: true }).click();
  await expect(page.locator('.recipe-card')).toHaveCount(4);
  const infusion = page.locator('.recipe-card').filter({ has: page.getByRole('heading', { name: 'Infusion 注魔', exact: true }) });
  await expect(infusion.getByText('基础不稳定性：5', { exact: true })).toBeVisible();
  await expect(infusion.locator('.magic-central')).toContainText('Paper 纸');
  const arcane = page.locator('.recipe-card').filter({ has: page.getByRole('heading', { name: 'Arcane 奥术合成', exact: true }) });
  await expect(arcane.locator('.recipe-stats')).toContainText('2 × 2 网格 · 可镜像');
  await expect(arcane.getByLabel('配方研究条件')).toContainText('快照状态未知');
  await page.screenshot({ path: 'test-results/magic-recipes.png', fullPage: true });
  await arcane.getByRole('link', { name: 'Ignis 火 · 7 Vis', exact: true }).click();
  await expect(page.locator('.magic-detail h2')).toHaveText('Ignis 火');
  await page.getByRole('navigation', { name: '浏览分类' }).getByRole('link', { name: '物品', exact: true }).click();
  await page.getByRole('searchbox', { name: '搜索物品', exact: true }).fill('铭记纸');
  await page.getByRole('button', { name: 'Marked memory 铭记纸', exact: true }).click();
  const imprint = page.locator('.recipe-card').filter({ has: page.getByRole('heading', { name: 'Tag infusion 标签注魔', exact: true }) });
  await expect(imprint).toBeVisible();
  await expect(imprint.locator('.recipe-view .stack-slot').first().getByRole('button').first()).toHaveAttribute('aria-label', /^Memory 记忆纸/);
  await expect(imprint.locator('.recipe-view .stack-slot').last().getByRole('button')).toHaveAttribute('aria-label', /^Marked memory 铭记纸/);
  await imprint.getByText('当前结果 NBT', { exact: true }).click();
  const resultNbt = imprint.locator('.recipe-changes details').last().locator('pre');
  await expect(resultNbt).toContainText('9007199254740993');
  await imprint.getByRole('button', { name: '查看 2 个候选输入', exact: true }).click();
  await imprint.locator('.choices-dialog').getByRole('button', { name: /^Paper 纸/ }).click();
  await expect(imprint.locator('.recipe-view .stack-slot').last().getByRole('button')).toHaveAttribute('aria-label', /^Marked paper 印记纸/);
  await expect(resultNbt).not.toContainText('energy');
  await page.reload();
  await expect(imprint.locator('.recipe-view .stack-slot').last().getByRole('button')).toHaveAttribute('aria-label', /^Marked memory 铭记纸/);
  await page.screenshot({ path: `test-results/changes-${offline ? 'offline' : 'online'}.png`, fullPage: true });
  await page.getByRole('searchbox', { name: '搜索物品', exact: true }).fill('继承法袍');
  await page.getByRole('button', { name: 'Robe inherited 继承法袍', exact: true }).click();
  const inheritance = page.locator('.recipe-card').filter({ has: page.getByRole('heading', { name: 'NBT inheritance 数据继承', exact: true }) });
  await expect(inheritance.locator('.recipe-view .stack-slot').first().getByRole('button').first()).toHaveAttribute('aria-label', /^Armor named 铭名护甲/);
  await inheritance.getByText('当前结果 NBT', { exact: true }).click();
  const merged = inheritance.locator('.recipe-changes pre');
  await expect(merged).toBeVisible();
  const inherited = JSON.parse((await merged.textContent())!);
  expect(inherited.value.display.value.Color.value).toBe('9');
  expect(inherited.value.energy.value).toBe('9007199254740993');
  expect(inherited.value.notes.value.map((tag: { value: string }) => tag.value)).toEqual(['base', 'source']);
  expect(inherited.value.conflict.value).toBe('keep');
  expect(inherited.value.empty.element).toBe('end');
  await inheritance.getByRole('button', { name: '查看 3 个候选输入', exact: true }).click();
  await inheritance.locator('.choices-dialog').getByRole('button', { name: /^Memory 记忆纸/ }).click();
  await expect(inheritance.locator('.recipe-view .stack-slot').last().getByRole('button')).toHaveAttribute('aria-label', /^Robe mold 产物模板/);
  await expect(merged).not.toContainText('energy');
  await page.getByRole('searchbox', { name: '搜索物品', exact: true }).fill('充能法杖');
  await page.getByRole('button', { name: 'Charged wand 充能法杖', exact: true }).click({ button: 'right' });
  const wandCore = page.locator('.recipe-card').filter({ has: page.getByRole('heading', { name: 'Wand core replacement 更换杖芯', exact: true }) });
  await expect(wandCore.locator('.recipe-view .stack-slot')).toHaveCount(9);
  await expect(wandCore.getByRole('region', { name: '供能方式', exact: true })).toContainText('每种要素最多 4 Vis');
  await expect(wandCore.getByRole('region', { name: '供能方式', exact: true })).toContainText('示例按额外法杖供能');
  await wandCore.getByText('当前结果 NBT', { exact: true }).click();
  const wandNbt = wandCore.locator('.recipe-changes details').last().locator('pre');
  let wandData = JSON.parse((await wandNbt.textContent())!);
  expect(wandData.value.fire.value).toBe('400');
  expect(wandData.value.owner.value).toBe('9007199254740993');
  await wandCore.getByRole('button', { name: '查看 2 个候选输入', exact: true }).click();
  await wandCore.locator('.choices-dialog').getByRole('button', { name: /^Focused wand 焦点法杖/ }).click();
  await expect(wandCore.locator('.recipe-view .stack-slot').last().getByRole('button')).toHaveAttribute('aria-label', /^Wand core 2 /);
  wandData = JSON.parse((await wandNbt.textContent())!);
  expect(wandData.value.fire.value).toBe('-4');
  expect(wandData.value.air.value).toBe('5');
  expect(wandData.value.focus.value[0].value).toBe('Retained focus');
  await wandCore.screenshot({ path: `test-results/wands-${offline ? 'offline' : 'online'}.png` });
  const wandCaps = page.locator('.recipe-card').filter({ has: page.getByRole('heading', { name: 'Wand cap replacement 更换杖端', exact: true }) });
  await expect(wandCaps.locator('.recipe-view .stack-slot')).toHaveCount(4);
  await expect(wandCaps.getByRole('region', { name: '供能方式', exact: true })).toContainText('每种要素最多 8 Vis');
  await wandCaps.getByText('当前结果 NBT', { exact: true }).click();
  expect(JSON.parse((await wandCaps.locator('.recipe-changes details').last().locator('pre').textContent())!).value.fire.value).toBe('900');
  const reset = page.locator('.recipe-card').filter({ has: page.getByRole('heading', { name: 'Wand reset 清空充能', exact: true }) });
  await expect(reset.getByRole('region', { name: '供能方式', exact: true })).toContainText('完成替换后清空充能');
  const creative = page.locator('.recipe-card').filter({ has: page.getByRole('heading', { name: 'Creative replacement 创造模式替换', exact: true }) });
  await expect(creative).toContainText('仅在创造模式免消耗配置下可用');
  await page.getByRole('searchbox', { name: '搜索物品', exact: true }).fill('零值双用杖');
  await page.getByRole('button', { name: 'Staffter false 零值双用杖', exact: true }).click({ button: 'right' });
  const staff = page.locator('.recipe-card').filter({ has: page.getByRole('heading', { name: 'Staff replacement 长杖属性替换', exact: true }) });
  await expect(staff.getByRole('region', { name: '供能方式', exact: true })).not.toContainText('自行供能');
  await expect(staff.locator('.recipe-view .stack-slot').first().getByRole('button').first()).toHaveAttribute('aria-label', /必须存在：sceptre/);
  await staff.getByText('当前结果 NBT', { exact: true }).click();
  const staffData = JSON.parse((await staff.locator('.recipe-changes details').last().locator('pre').textContent())!);
  expect(staffData.value.sceptre.value).toBe('0');
  expect(staffData.value.AttributeModifiers.value).toHaveLength(1);
  expect(staffData.value.AttributeModifiers.value[0].value.Name.value).toBe('Weapon modifier');
  expect(errors).toEqual([]);
});

test('a slow search cannot replace a newer search and errors are visible', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.browser-cell')).toHaveCount(32);
  await page.route('**/items?**', async route => {
    const query = new URL(route.request().url()).searchParams.get('query');
    if (query === 'water') await new Promise(resolve => setTimeout(resolve, 400));
    if (query === 'broken') {
      await route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ error: { code: 'invalid_catalog', message: '测试：索引校验失败' } }) });
    } else await route.continue();
  });
  const search = page.getByRole('searchbox', { name: '搜索物品', exact: true });
  await search.fill('water');
  await page.waitForRequest(request => new URL(request.url()).searchParams.get('query') === 'water');
  await search.fill('shitou');
  await expect(page.locator('.browser-cell')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Stone 石头', exact: true })).toBeVisible();
  await page.waitForTimeout(450);
  await expect(page.getByRole('button', { name: 'Stone 石头', exact: true })).toBeVisible();
  await search.fill('broken');
  await expect(page.getByRole('alert').filter({ hasText: '测试：索引校验失败' })).toBeVisible();
});

test('offline copies resume, repair corruption, survive browser restart and remove across tabs', async ({ request, baseURL }) => {
  const manifest = await (await request.get('/api/catalog')).json() as Manifest;
  // Chromium appends long hashed paths for CacheStorage; keep its profile outside deep checkout paths.
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
        const open = indexedDB.open('neonei.catalog'); open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error);
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

    // An incomplete application cache must be repaired as well as the catalog.
    await page.evaluate(async () => {
      for (const name of await caches.keys()) if (name.startsWith('neonei.shell.')) await (await caches.open(name)).delete('/index.html');
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
    await page.getByRole('searchbox', { name: '搜索物品', exact: true }).fill('shitou');
    await expect(page.getByRole('button', { name: 'Stone 石头', exact: true })).toBeVisible();
    await expect.poll(() => page.locator('.item-button canvas').first().evaluate(element => {
      const canvas = element as HTMLCanvasElement;
      return canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data.some((value, index) => index % 4 === 3 && value > 0);
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
      const database = await new Promise<IDBDatabase>(resolve => { const open = indexedDB.open('neonei.catalog'); open.onsuccess = () => resolve(open.result); });
      try {
        return await Promise.all(['catalogs', 'manifests', 'files'].map(store => new Promise<number>(resolve => {
          const count = database.transaction(store).objectStore(store).count(); count.onsuccess = () => resolve(count.result);
        })));
      } finally { database.close(); }
    });
    expect(counts).toEqual([0, 0, 0]);
  } finally { await context.close(); }
});
