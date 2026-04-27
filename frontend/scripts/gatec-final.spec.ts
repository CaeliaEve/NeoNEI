import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

test.describe.configure({ timeout: 240000 });

const BASE_URL = process.env.GATEC_BASE_URL || 'http://127.0.0.1:5173';
const BACKEND_BASE_URL = process.env.GATEC_BACKEND_URL || 'http://127.0.0.1:3002';
const ARTIFACT_DIR = process.env.GATEC_ARTIFACT_DIR || resolve(process.cwd(), 'gatec-artifacts-final');
const HOME_SHOT = `${ARTIFACT_DIR}/home.png`;
const RECIPE_SHOT = `${ARTIFACT_DIR}/recipe.png`;
const ORACLE_SHOT = `${ARTIFACT_DIR}/oracle.png`;
const SUMMARY_JSON = `${ARTIFACT_DIR}/summary.json`;
const DETAIL_LOG = `${ARTIFACT_DIR}/detail.log`;

function hasRecipeUiScaffoldSync(page: any) {
  return page.evaluate(() => {
    return Boolean(
      document.querySelector('[data-testid="recipe-search-toggle"]') ||
      document.querySelector('[data-testid="recipe-search-input"]') ||
      document.querySelector('.recipe-display') ||
      document.querySelector('[data-testid="recipe-pagination"]')
    );
  });
}

async function pickLocator(candidates: any[]) {
  for (const candidate of candidates) {
    if ((await candidate.count()) > 0) {
      return candidate.first();
    }
  }
  return candidates[0].first();
}

async function isVisibleSafe(locator: any) {
  return (await locator.count()) > 0 && (await locator.isVisible());
}

async function captureEvidenceShot(page: any, path: string, locators: any[]) {
  for (const locator of locators) {
    try {
      if (await isVisibleSafe(locator)) {
        await locator.screenshot({ path });
        return 'locator';
      }
    } catch {
      // try next target
    }
  }

  await page.screenshot({ path });
  return 'page';
}

async function clickWithResponse(
  page: any,
  button: any,
  infoLocator: any,
  label: string,
  options: { attempts?: number; settleMs?: number; stopOnChange?: boolean } = {},
) {
  const attempts = Math.max(1, Math.min(5, options.attempts ?? 2));
  const settleMs = Math.max(80, Math.min(500, options.settleMs ?? 140));
  const stopOnChange = options.stopOnChange ?? true;
  const exists = (await button.count()) > 0;
  if (!exists) {
    return {
      exists: false,
      requestedClicks: 0,
      actualClicks: 0,
      changedCount: 0,
      responded: false,
      notes: `${label} button not found`,
    };
  }

  let actualClicks = 0;
  let changedCount = 0;
  let sawEnabled = false;
  let previous = (await infoLocator.count()) > 0 ? (await infoLocator.innerText()) : '';

  for (let i = 0; i < attempts; i++) {
    let disabled = false;
    try {
      disabled = await button.isDisabled();
    } catch {
      continue;
    }
    if (disabled) {
      continue;
    }

    sawEnabled = true;

    const clicked = await button
      .click({ timeout: 1200, force: true })
      .then(() => true)
      .catch(async () => {
        try {
          await button.dispatchEvent('click');
          return true;
        } catch {
          return false;
        }
      });

    if (!clicked) {
      continue;
    }

    actualClicks += 1;
    await page.waitForTimeout(settleMs);
    const current = (await infoLocator.count()) > 0 ? (await infoLocator.innerText()) : '';
    if (current !== previous) {
      changedCount += 1;
      previous = current;
      if (stopOnChange) {
        break;
      }
    }
  }

  return {
    exists: true,
    enabled: sawEnabled,
    requestedClicks: attempts,
    actualClicks,
    changedCount,
    responded: changedCount > 0,
    notes: sawEnabled
      ? (actualClicks === 0 ? `${label} button enabled but click failed` : 'ok')
      : `${label} button always disabled during run`,
  };
}

async function pickRecipeItemId(page: any, lines: string[]) {
  const candidates = [
    {
      source: 'items-search-fast-afsu',
      url: `${BACKEND_BASE_URL}/api/items/search/fast?q=AFSU&limit=50`,
      extractor: (json: any) => (Array.isArray(json) ? json.map((x: any) => x?.itemId).filter(Boolean) : []),
    },
    {
      source: 'items-search-fast-iron',
      url: `${BACKEND_BASE_URL}/api/items/search/fast?q=iron&limit=80`,
      extractor: (json: any) => (Array.isArray(json) ? json.map((x: any) => x?.itemId).filter(Boolean) : []),
    },
    {
      source: 'items-page-1',
      url: `${BACKEND_BASE_URL}/api/items?page=1&limit=200`,
      extractor: (json: any) => (Array.isArray(json?.data) ? json.data.map((x: any) => x?.itemId).filter(Boolean) : []),
    },
  ];

  for (const candidate of candidates) {
    try {
      const res = await page.request.get(candidate.url);
      if (res.status() < 200 || res.status() >= 300) {
        lines.push(`[recipe-fixture] source=${candidate.source} status=${res.status()} skip`);
        continue;
      }

      const json = await res.json();
      const itemIds: string[] = candidate.extractor(json);
      lines.push(`[recipe-fixture] source=${candidate.source} status=${res.status()} candidates=${itemIds.length}`);

      let checked = 0;
      const validated: Array<{ itemId: string; source: string; machinesCount: number; recipeCount: number }> = [];

      for (const itemId of itemIds) {
        if (checked >= 24) {
          break;
        }
        checked += 1;

        const recipeRes = await page.request.get(`${BACKEND_BASE_URL}/api/recipes-indexed/${encodeURIComponent(itemId)}/machines`);
        if (recipeRes.status() < 200 || recipeRes.status() >= 300) {
          continue;
        }
        const recipeJson = await recipeRes.json();
        const machines = Array.isArray(recipeJson?.machines) ? recipeJson.machines : [];
        const recipeCount = machines.reduce((sum: number, machine: any) => {
          const count = Number(machine?.recipeCount ?? 0);
          return sum + (Number.isFinite(count) ? count : 0);
        }, 0);

        if (machines.length <= 0 || recipeCount <= 0) {
          continue;
        }

        const itemRes = await page.request.get(`${BACKEND_BASE_URL}/api/items/${encodeURIComponent(itemId)}`);
        if (itemRes.status() < 200 || itemRes.status() >= 300) {
          lines.push(`[recipe-fixture] candidate itemId=${itemId} source=${candidate.source} rejected=item-api-status-${itemRes.status()}`);
          continue;
        }

        const itemJson = await itemRes.json();
        const itemData = itemJson?.data ?? itemJson;
        const hasItemData = Boolean(itemData && typeof itemData === 'object' && Object.keys(itemData).length > 0);
        if (!hasItemData) {
          lines.push(`[recipe-fixture] candidate itemId=${itemId} source=${candidate.source} rejected=item-api-empty`);
          continue;
        }

        lines.push(`[recipe-fixture] candidate itemId=${itemId} source=${candidate.source} machines=${machines.length} recipeCount=${recipeCount} itemApi=ok`);
        validated.push({ itemId, source: candidate.source, machinesCount: machines.length, recipeCount });
      }

      const selected = validated.sort((a, b) => b.recipeCount - a.recipeCount)[0] ?? null;
      if (selected) {
        lines.push(
          `[recipe-fixture] selected itemId=${selected.itemId} source=${selected.source} machines=${selected.machinesCount} recipeCount=${selected.recipeCount} strategy=backend-validated`,
        );
        return selected;
      }
    } catch (error: any) {
      lines.push(`[recipe-fixture] source=${candidate.source} error=${error?.message || String(error)}`);
    }
  }

  return null;
}

test('Gate C final acceptance', async ({ page }) => {
  await mkdir(ARTIFACT_DIR, { recursive: true });
  const lines: string[] = [];
  const summary: any = {
    runAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    backendChecks: {},
    routes: {
      home: { pass: false, details: {} },
      recipe: { pass: false, details: {} },
      oracle: { pass: false, details: {} },
    },
    blockers: [] as string[],
    warnings: [] as string[],
    conclusion: 'NO-GO',
    evidence: {
      summaryJson: SUMMARY_JSON,
      detailLog: DETAIL_LOG,
      screenshots: [HOME_SHOT, RECIPE_SHOT, ORACLE_SHOT],
    },
  };

  const backendUrls = {
    health: `${BACKEND_BASE_URL}/api/health`,
    items: `${BACKEND_BASE_URL}/api/items?page=1&limit=1`,
    fast: `${BACKEND_BASE_URL}/api/items/search/fast?q=iron`,
  };

  for (const [k, u] of Object.entries(backendUrls)) {
    const res = await page.request.get(u);
    summary.backendChecks[k] = res.status();
    lines.push(`[backend] ${k} => ${res.status()} ${u}`);
  }

  await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);

  const itemsColumn = page.locator('.items-column').first();
  const legacyGrid = page.locator('.items-grid-container .grid').first();
  const canvasHost = page.locator('.home-canvas-grid').first();
  const canvas = page.locator('.home-canvas-grid__canvas').first();
  const homePagerInfo = page.locator('.pagination-top .pager-indicator').first();
  const homePrev = await pickLocator([
    itemsColumn.getByRole('button', { name: /上一页/i }),
    page.getByRole('button', { name: /上一页/i }),
  ]);
  const homeNext = await pickLocator([
    itemsColumn.getByRole('button', { name: /下一页/i }),
    page.getByRole('button', { name: /下一页/i }),
  ]);

  const legacyGridVisible = await isVisibleSafe(legacyGrid);
  const canvasVisible = await isVisibleSafe(canvasHost) && await isVisibleSafe(canvas);
  const homeSurfaceType = canvasVisible ? 'canvas' : (legacyGridVisible ? 'legacy-grid' : 'none');
  const gridVisible = homeSurfaceType !== 'none';
  const gridItems = legacyGridVisible ? await legacyGrid.locator(':scope > *').count() : 0;
  const canvasMetrics = canvasVisible
    ? await canvas.evaluate((el: HTMLCanvasElement) => ({
        width: el.width,
        height: el.height,
        clientWidth: el.clientWidth,
        clientHeight: el.clientHeight,
      }))
    : null;
  const canvasReady = Boolean(
    canvasMetrics
    && canvasMetrics.width > 0
    && canvasMetrics.height > 0
    && canvasMetrics.clientWidth > 0
    && canvasMetrics.clientHeight > 0,
  );

  const homePageInfoBefore = (await homePagerInfo.count()) > 0 ? (await homePagerInfo.innerText()) : '';
  let wheelChangedPage = false;
  if ((await itemsColumn.count()) > 0 && (await itemsColumn.isVisible()) && homePageInfoBefore) {
    await itemsColumn.hover();
    await page.mouse.wheel(0, 820);
    await page.waitForTimeout(350);
    const homePageInfoAfterWheel = (await homePagerInfo.count()) > 0 ? (await homePagerInfo.innerText()) : '';
    wheelChangedPage = homePageInfoAfterWheel !== homePageInfoBefore;
    lines.push(`[home] wheel page before="${homePageInfoBefore}" after="${homePageInfoAfterWheel}" changed=${wheelChangedPage}`);
  }

  const homePrevResult = wheelChangedPage
    ? {
        exists: (await homePrev.count()) > 0,
        enabled: null,
        requestedClicks: 0,
        actualClicks: 0,
        changedCount: 0,
        responded: false,
        notes: 'skipped after wheel verification',
      }
    : await clickWithResponse(page, homePrev, homePagerInfo, 'home-prev', { attempts: 1, settleMs: 160 });
  const homeNextResult = wheelChangedPage
    ? {
        exists: (await homeNext.count()) > 0,
        enabled: null,
        requestedClicks: 0,
        actualClicks: 0,
        changedCount: 0,
        responded: false,
        notes: 'skipped after wheel verification',
      }
    : await clickWithResponse(page, homeNext, homePagerInfo, 'home-next', { attempts: 1, settleMs: 160 });

  const homeShotMode = await captureEvidenceShot(page, HOME_SHOT, [itemsColumn, canvasHost, page.locator('main').first()]);

  summary.routes.home.details = {
    surfaceType: homeSurfaceType,
    gridVisible,
    gridItems,
    canvasReady,
    canvasMetrics,
    pageInfoBefore: homePageInfoBefore,
    wheelChangedPage,
    prev: homePrevResult,
    next: homeNextResult,
    screenshotMode: homeShotMode,
  };
  summary.routes.home.pass = Boolean(
    gridVisible
    && (homeSurfaceType !== 'canvas' || canvasReady)
    && (homeSurfaceType !== 'legacy-grid' || gridItems > 0)
    && (wheelChangedPage || homePrevResult.exists || homeNextResult.exists),
  );
  lines.push(
    `[home] pass=${summary.routes.home.pass} surface=${homeSurfaceType} gridVisible=${gridVisible} gridItems=${gridItems} canvasReady=${canvasReady} wheelChanged=${wheelChangedPage} prev=${JSON.stringify(homePrevResult)} next=${JSON.stringify(homeNextResult)}`,
  );

  const recipeFixture = await pickRecipeItemId(page, lines);
  if (!recipeFixture) {
    summary.routes.recipe.details = {
      fixtureSelected: false,
      reason: 'No candidate item with machine recipes from backend API',
    };
    summary.routes.recipe.pass = false;
    summary.blockers.push('Recipe fixture selection failed: no valid itemId from backend API');
  } else {
    await page.goto(`${BASE_URL}/recipe/${encodeURIComponent(recipeFixture.itemId)}`, { waitUntil: 'domcontentloaded' });

    let recipeScaffoldReady = false;
    for (let i = 0; i < 10; i++) {
      recipeScaffoldReady = await hasRecipeUiScaffoldSync(page);
      if (recipeScaffoldReady) break;
      await page.waitForTimeout(250);
    }

    const searchToggle = page.getByTestId('recipe-search-toggle');
    const searchInput = page.getByTestId('recipe-search-input');
    const recipePageInfo = page.locator('[data-testid="recipe-pagination"] .page-info').first();
    const recipePrev = await pickLocator([
      page.getByTestId('recipe-prev-page'),
      page.getByRole('button', { name: /(?:\u4E0A\u4E00\u9875|prev)/i }),
    ]);
    const recipeNext = await pickLocator([
      page.getByTestId('recipe-next-page'),
      page.getByRole('button', { name: /(?:\u4E0B\u4E00\u9875|next)/i }),
    ]);

    const hasToggle = (await searchToggle.count()) > 0;
    let searchVisible = await isVisibleSafe(searchInput);
    let searchToggled = false;
    if (!searchVisible && hasToggle) {
      await searchToggle.click();
      searchToggled = true;
      await page.waitForTimeout(120);
      searchVisible = await isVisibleSafe(searchInput);
    }
    const readSearchDiag = async (stage: string) => {
      const exists = (await searchInput.count()) > 0;
      const visible = exists ? await searchInput.isVisible() : false;
      const value = exists ? await searchInput.inputValue() : '';
      const activeTag = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el) return 'null';
        const testId = el.getAttribute('data-testid') || '';
        return `${el.tagName.toLowerCase()}${testId ? `#${testId}` : ''}`;
      });
      const routeQ = await page.evaluate(() => new URL(window.location.href).searchParams.get('q') || '');
      lines.push(`[recipe-search-diag] stage=${stage} exists=${exists} visible=${visible} value="${value}" active=${activeTag} routeQ="${routeQ}"`);
      return { exists, visible, value, activeTag, routeQ };
    };

    let searchTyped = false;
    if (searchVisible) {
      await readSearchDiag('before-fill');
      await searchInput.fill('iron');
      await readSearchDiag('after-fill-immediate');
      await page.waitForTimeout(120);
      await readSearchDiag('after-fill-120ms');
      await page.waitForTimeout(280);
      await readSearchDiag('after-fill-400ms');
      await page.waitForTimeout(500);
      const finalDiag = await readSearchDiag('after-fill-900ms');
      searchTyped = finalDiag.value === 'iron';
    }

    const prevResult = await clickWithResponse(page, recipePrev, recipePageInfo, 'recipe-prev', { attempts: 1, settleMs: 120 });
    const nextResult = await clickWithResponse(page, recipeNext, recipePageInfo, 'recipe-next', { attempts: 1, settleMs: 120 });

    const recipeShotMode = await captureEvidenceShot(page, RECIPE_SHOT, [
      page.locator('.recipe-display').first(),
      page.locator('[data-testid="recipe-viewer"]').first(),
      page.locator('main').first(),
    ]);

    summary.routes.recipe.details = {
      fixtureSelected: true,
      fixtureSource: recipeFixture.source,
      itemId: recipeFixture.itemId,
      machinesCount: recipeFixture.machinesCount,
      recipeCount: recipeFixture.recipeCount,
      scaffoldReady: recipeScaffoldReady,
      searchVisible,
      searchToggled,
      searchTyped,
      prev: prevResult,
      next: nextResult,
      screenshotMode: recipeShotMode,
    };

    summary.routes.recipe.pass = Boolean(recipeScaffoldReady && searchVisible && searchTyped && prevResult.exists && nextResult.exists);
    lines.push(`[recipe] pass=${summary.routes.recipe.pass} itemId=${recipeFixture.itemId} source=${recipeFixture.source} scaffoldReady=${recipeScaffoldReady} searchVisible=${searchVisible} searchTyped=${searchTyped} prev=${JSON.stringify(prevResult)} next=${JSON.stringify(nextResult)}`);
  }

  await page.goto(`${BASE_URL}/oracle`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);

  const oracleInput = page.locator('.query-input').first();
  await expect(oracleInput).toBeVisible();
  await oracleInput.fill('AFSU');

  const oracleResult = page.locator('.result-list .result-item').first();
  await oracleResult.waitFor({ state: 'visible', timeout: 10000 });
  const selectedText = (await oracleResult.innerText()).slice(0, 200);
  await oracleResult.click();
  await page.waitForTimeout(1200);

  const stage = page.locator('.display-stage .oracle-stage-slot').first();
  const stageVisible = (await stage.count()) > 0 && (await stage.isVisible());

  const oracleInfo = page.locator('.stage-footer .recipe-progress').first();
  const oraclePrev = await pickLocator([
    page.getByTestId('oracle-prev-recipe'),
    page.getByRole('button', { name: /(?:\u4E0A\u4E00\u914D\u65B9|prev)/i }),
  ]);
  const oracleNext = await pickLocator([
    page.getByTestId('oracle-next-recipe'),
    page.getByRole('button', { name: /(?:\u4E0B\u4E00\u914D\u65B9|next)/i }),
  ]);

  const oraclePrevResult = await clickWithResponse(page, oraclePrev, oracleInfo, 'oracle-prev', { attempts: 1, settleMs: 120 });
  const oracleNextResult = await clickWithResponse(page, oracleNext, oracleInfo, 'oracle-next', { attempts: 1, settleMs: 120 });

  const oracleShotMode = await captureEvidenceShot(page, ORACLE_SHOT, [
    page.locator('.oracle-panel').first(),
    page.locator('.display-stage').first(),
    page.locator('main').first(),
  ]);

  summary.routes.oracle.details = {
    searchInputVisible: true,
    searchKeyword: 'AFSU',
    selectedResultPreview: selectedText,
    stageVisible,
    prev: oraclePrevResult,
    next: oracleNextResult,
    screenshotMode: oracleShotMode,
  };
  summary.routes.oracle.pass = Boolean(stageVisible && oraclePrevResult.exists && oracleNextResult.exists);
  lines.push(`[oracle] pass=${summary.routes.oracle.pass} stageVisible=${stageVisible} prev=${JSON.stringify(oraclePrevResult)} next=${JSON.stringify(oracleNextResult)}`);

  if (!summary.routes.home.pass) summary.blockers.push('Home route check failed');
  if (!summary.routes.recipe.pass) summary.blockers.push('Recipe route check failed');
  if (!summary.routes.oracle.pass) summary.blockers.push('Oracle route check failed');

  const recipePrevDetails = summary.routes.recipe.details?.prev;
  const recipeNextDetails = summary.routes.recipe.details?.next;
  if (!recipePrevDetails?.exists) {
    summary.blockers.push('Recipe prev button missing');
  } else if (recipePrevDetails.actualClicks > 0 && !recipePrevDetails.responded) {
    summary.warnings.push('Recipe prev button did not change page state during clicks');
  }
  if (!recipeNextDetails?.exists) {
    summary.blockers.push('Recipe next button missing');
  } else if (recipeNextDetails.actualClicks > 0 && !recipeNextDetails.responded) {
    summary.warnings.push('Recipe next button did not change page state during clicks');
  }
  if (!summary.routes.oracle.details.prev.exists) {
    summary.blockers.push('Oracle prev button missing');
  } else if (summary.routes.oracle.details.prev.actualClicks > 0 && !summary.routes.oracle.details.prev.responded) {
    summary.warnings.push('Oracle prev button did not change page state during clicks');
  }
  if (!summary.routes.oracle.details.next.exists) {
    summary.blockers.push('Oracle next button missing');
  } else if (summary.routes.oracle.details.next.actualClicks > 0 && !summary.routes.oracle.details.next.responded) {
    summary.warnings.push('Oracle next button did not change page state during clicks');
  }

  summary.conclusion = summary.blockers.length > 0 ? 'NO-GO' : (summary.warnings.length > 0 ? 'CONDITIONAL-GO' : 'GO');

  await writeFile(SUMMARY_JSON, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  await writeFile(DETAIL_LOG, `${lines.join('\n')}\n`, 'utf8');

  console.log(`SUMMARY_JSON=${SUMMARY_JSON}`);
  console.log(`DETAIL_LOG=${DETAIL_LOG}`);
  console.log(`HOME_SHOT=${HOME_SHOT}`);
  console.log(`RECIPE_SHOT=${RECIPE_SHOT}`);
  console.log(`ORACLE_SHOT=${ORACLE_SHOT}`);
  console.log(`FINAL_CONCLUSION=${summary.conclusion}`);

  expect(summary.blockers, 'Gate C blockers').toEqual([]);
});
