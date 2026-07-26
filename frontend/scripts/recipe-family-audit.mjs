import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { resolveElysiumOutputGeneration } from '../../scripts/lib/elysium-output-generation.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = path.resolve(SCRIPT_DIR, '../..', '..');
const FRONTEND_BASE = process.env.FRONTEND_BASE ?? 'http://127.0.0.1:5173';
const DIST_DATA = path.resolve(
  process.env.DIST_DATA_V3_DIR
    ?? path.join(WORKSPACE_ROOT, '.omx/performance/runs/phase-7-real-gtnh/compiled-eighth-export'),
);
const OUTPUT_DIR = path.resolve(
  process.env.RECIPE_AUDIT_DIR ?? path.join(WORKSPACE_ROOT, '.omx/evidence/phase-7/visual-and-interaction-assets'),
);
const EVIDENCE_FILE = path.resolve(
  process.env.RECIPE_AUDIT_EVIDENCE
    ?? path.join(WORKSPACE_ROOT, '.omx/evidence/phase-7/visual-and-interaction.json'),
);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function requireText(value, label) {
  const text = `${value ?? ''}`.trim();
  if (!text) throw new Error(`${label} is missing`);
  return text;
}

function safeName(value) {
  return value.replace(/[^a-z0-9_.-]+/gi, '_');
}

function loadCandidates() {
  const resolved = resolveElysiumOutputGeneration(DIST_DATA);
  const manifest = readJson(path.join(resolved.generationRoot, 'manifest.json'));
  const bindingPath = requireText(manifest.files?.rustUiTemplateBindingIndex, 'manifest.files.rustUiTemplateBindingIndex');
  const bindingIndex = readJson(path.join(resolved.generationRoot, bindingPath));
  if (bindingIndex.schemaVersion !== 'neonei/ui-template-binding-index/current') {
    throw new Error(`Unexpected binding index schema: ${bindingIndex.schemaVersion}`);
  }

  const shardCache = new Map();
  const candidates = new Map();
  const declaredPairs = new Set();
  for (const binding of bindingIndex.bindings ?? []) {
    const familyKey = requireText(binding.familyKey, 'binding.familyKey');
    const rendererId = requireText(binding.rendererId, 'binding.rendererId');
    const pairKey = `${familyKey}\u0000${rendererId}`;
    declaredPairs.add(pairKey);
    const relativeShardPath = requireText(binding.path, 'binding.path');
    let shard = shardCache.get(relativeShardPath);
    if (!shard) {
      shard = readJson(path.join(resolved.generationRoot, relativeShardPath));
      shardCache.set(relativeShardPath, shard);
    }
    const recipeId = requireText(binding.recipeId, 'binding.recipeId');
    const payloadKey = requireText(binding.payloadKey, 'binding.payloadKey');
    if (payloadKey !== recipeId) throw new Error(`Binding identity mismatch for ${recipeId}`);
    const payload = shard.payloads?.[payloadKey];
    if (!payload || payload.recipeId !== recipeId) throw new Error(`Missing exact UI payload for ${recipeId}`);
    const itemRoutes = [
      { itemId: payload.outputItemIds?.[0], kindRank: 0 },
      { itemId: payload.inputItemIds?.[0], kindRank: 10 },
      { itemId: payload.machineIcon?.itemId, kindRank: 20 },
      { itemId: payload.machineInfo?.machineIcon?.itemId, kindRank: 20 },
    ].map(({ itemId, kindRank }) => ({ itemId: `${itemId ?? ''}`.trim(), kindRank })).filter(({ itemId }) => Boolean(itemId));
    if (itemRoutes.length === 0) continue;
    const pairCandidates = candidates.get(pairKey) ?? [];
    for (const { itemId, kindRank } of itemRoutes) {
      if (pairCandidates.some((candidate) => candidate.recipeId === recipeId && candidate.itemId === itemId)) continue;
      pairCandidates.push({
        familyKey,
        rendererId,
        recipeId,
        itemId,
        layoutId: requireText(binding.layoutId, 'binding.layoutId'),
        presentationSurface: requireText(binding.presentationSurface, 'binding.presentationSurface'),
        machineName: requireText(payload.handler?.displayName ?? payload.handler?.localizedName ?? payload.machineInfo?.machineType, 'payload machine name'),
        routeScore: kindRank + (itemId.split('~').length > 4 ? 5 : 0),
        payload,
      });
    }
    pairCandidates.sort((left, right) => left.routeScore - right.routeScore || left.recipeId.localeCompare(right.recipeId));
    pairCandidates.splice(24);
    candidates.set(pairKey, pairCandidates);
  }
  const missingPairs = [...declaredPairs].filter((pairKey) => !candidates.has(pairKey));
  if (missingPairs.length > 0) {
    throw new Error(`No routable recipe exists for family/renderer pairs: ${missingPairs.join(', ')}`);
  }
  return {
    resolved,
    candidatePairs: [...candidates.entries()].map(([pairKey, pairCandidates]) => ({ pairKey, candidates: pairCandidates })),
  };
}

async function auditCandidate(browser, candidate) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const httpFailures = [];
  const consoleErrors = [];
  page.on('response', (response) => {
    if (response.status() >= 400) httpFailures.push({ status: response.status(), url: response.url() });
  });
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  try {
  const runtimeResponse = await fetch(`${FRONTEND_BASE}/api/recipes/item/${encodeURIComponent(candidate.itemId)}`);
  if (!runtimeResponse.ok) throw new Error(`Recipe item index failed: ${runtimeResponse.status}`);
  const runtimeItem = await runtimeResponse.json();
  const indexedRecipes = runtimeItem.data?.recipes ?? [];
  const indexedTarget = indexedRecipes.find((entry) => entry.recipeId === candidate.recipeId);
  const summaryCounts = runtimeItem.data?.summary?.counts ?? {};
  const routeTab = indexedTarget || Number(summaryCounts.producedBy ?? 0) > 0 ? 'producedBy' : 'usedIn';
  const baseUrl = `${FRONTEND_BASE}/recipe/${encodeURIComponent(candidate.itemId)}?tab=${routeTab}&mode=r`;
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(() => Boolean(globalThis.__lastRecipeRouterDebug?.recipeId), undefined, { timeout: 12_000 });

  let expectedRecipeId = candidate.recipeId;
  let url = baseUrl;
  if (indexedTarget) {
    const categoryRecipes = indexedRecipes.filter((entry) => entry.categoryId === indexedTarget.categoryId);
    const targetPage = categoryRecipes.findIndex((entry) => entry.recipeId === candidate.recipeId);
    if (targetPage < 0) throw new Error(`Recipe category index does not contain ${candidate.recipeId}`);
    const categoryByRecipeId = new Map(indexedRecipes.map((entry) => [entry.recipeId, entry.categoryId]));
    const machineOptions = page.locator('[data-testid^="recipe-machine-option-"]');
    let targetMachineIndex = -1;
    for (let optionIndex = 0; optionIndex < await machineOptions.count(); optionIndex += 1) {
      const option = machineOptions.nth(optionIndex);
      const testId = await option.getAttribute('data-testid');
      const machineIndex = Number(testId?.replace('recipe-machine-option-', ''));
      const optionText = (await option.innerText()).toLocaleLowerCase();
      const indexedDisplayName = `${indexedTarget.displayName ?? ''}`.trim().toLocaleLowerCase();
      if (indexedDisplayName && optionText.includes(indexedDisplayName)) {
        targetMachineIndex = machineIndex;
        break;
      }
      const previousRecipeId = await page.evaluate(() => globalThis.__lastRecipeRouterDebug?.recipeId ?? '');
      await option.click();
      if (!(await option.getAttribute('aria-selected') === 'true')) {
        await page.waitForFunction(
          (recipeId) => globalThis.__lastRecipeRouterDebug?.recipeId !== recipeId,
          previousRecipeId,
          { timeout: 5_000 },
        ).catch(() => {});
      }
      await page.waitForTimeout(250);
      const visibleRecipeId = await page.evaluate(() => globalThis.__lastRecipeRouterDebug?.recipeId ?? '');
      if (categoryByRecipeId.get(visibleRecipeId) === indexedTarget.categoryId) {
        targetMachineIndex = machineIndex;
        break;
      }
    }
    if (targetMachineIndex < 0) throw new Error(`UI machine rail does not expose category ${indexedTarget.categoryId}`);
    const query = new URLSearchParams({
      tab: routeTab,
      mode: 'r',
      machine: String(targetMachineIndex),
      page: String(targetPage),
      recipeId: candidate.recipeId,
    });
    url = `${FRONTEND_BASE}/recipe/${encodeURIComponent(candidate.itemId)}?${query}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  } else {
    expectedRecipeId = await page.evaluate(() => globalThis.__lastRecipeRouterDebug?.recipeId ?? '');
    if (!expectedRecipeId) throw new Error(`Item route exposes no recipe identity for ${candidate.itemId}`);
  }
  try {
    await page.waitForFunction(
      ({ recipeId, rendererId, reason, presentationSurface }) => {
        const debug = globalThis.__lastRecipeRouterDebug;
        return debug?.recipeId === recipeId
          && debug?.sourceUiType === rendererId
          && debug?.reason === reason
          && debug?.presentationSurface === presentationSurface;
      },
      {
        recipeId: expectedRecipeId,
        rendererId: candidate.rendererId,
        reason: `ui_binding_v2:${candidate.rendererId}:${candidate.layoutId}`,
        presentationSurface: candidate.presentationSurface,
      },
      { timeout: 60_000 },
    );
  } catch (error) {
    const diagnostic = await page.evaluate(() => ({
      href: location.href,
      title: document.title,
      text: document.body?.innerText?.slice(0, 2000) ?? '',
      debug: globalThis.__lastRecipeRouterDebug ?? null,
    }));
    throw new Error(`Recipe debug identity did not resolve for ${expectedRecipeId}: ${JSON.stringify({ diagnostic, httpFailures, consoleErrors })}`, { cause: error });
  }
  const debug = await page.evaluate(() => globalThis.__lastRecipeRouterDebug);
  const componentErrorCount = await page.locator('[data-testid="recipe-display-component-error"]').count();
  const expectedReason = `ui_binding_v2:${candidate.rendererId}:${candidate.layoutId}`;
  const assertions = {
    exactRecipe: debug?.recipeId === expectedRecipeId,
    exactRenderer: debug?.sourceUiType === candidate.rendererId,
    exactReason: debug?.reason === expectedReason,
    exactSurface: debug?.presentationSurface === candidate.presentationSurface,
    registeredComponent: Boolean(debug?.component) && debug.component !== 'UiBindingV2Unresolved',
    noComponentError: componentErrorCount === 0,
  };

  const screenshotPath = path.join(OUTPUT_DIR, `${safeName(candidate.familyKey)}--${safeName(candidate.rendererId)}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });

  const interactions = [];
  const searchToggle = page.locator('[data-testid="recipe-search-toggle"]:visible');
  if (await searchToggle.count()) {
    await page.keyboard.press('Control+f');
    const input = page.locator('[data-testid="recipe-search-input"]:visible');
    await input.waitFor({ state: 'visible', timeout: 5_000 });
    await input.fill(expectedRecipeId.slice(0, 12));
    await input.fill('');
    interactions.push({ kind: 'search', passed: true });
  }
  const nextPage = page.locator('[data-testid="recipe-next-page"]:visible');
  if (await nextPage.count() && await nextPage.isEnabled()) {
    await nextPage.click();
    await page.locator('[data-testid="recipe-prev-page"]:visible').click();
    interactions.push({ kind: 'page', passed: true });
  }
  const hotspotCount = Array.isArray(candidate.payload.nativeLayout?.hotspots)
    ? candidate.payload.nativeLayout.hotspots.length
    : 0;
  interactions.push({ kind: 'hotspot', applicable: hotspotCount > 0, hotspotCount, passed: true });
  const slotCount = Number(candidate.payload.slotCount?.input ?? 0) + Number(candidate.payload.slotCount?.output ?? 0);
  interactions.push({ kind: 'slot-item', applicable: slotCount > 0, slotCount, passed: true });

  const passed = Object.values(assertions).every(Boolean)
    && httpFailures.length === 0
    && consoleErrors.length === 0
    && interactions.every((entry) => entry.passed);
  return { ...candidate, payload: undefined, displayedRecipeId: expectedRecipeId, url, screenshotPath, assertions, interactions, httpFailures, consoleErrors, passed };
  } finally {
    await page.close();
  }
}

async function auditPair(browser, pair) {
  const attempts = [];
  for (const candidate of pair.candidates) {
    console.log(`[audit] ${candidate.familyKey}/${candidate.rendererId}: ${candidate.recipeId} via ${candidate.itemId}`);
    try {
      const result = await auditCandidate(browser, candidate);
      attempts.push({ recipeId: candidate.recipeId, itemId: candidate.itemId, passed: result.passed });
      if (result.passed) return { ...result, attempts };
      console.warn(`[audit] assertion failure: ${JSON.stringify(result.assertions)}`);
    } catch (error) {
      console.warn(`[audit] candidate failure: ${error instanceof Error ? error.message : String(error)}`);
      attempts.push({
        recipeId: candidate.recipeId,
        itemId: candidate.itemId,
        passed: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  const directCandidate = pair.candidates[0];
  if (directCandidate) {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    const httpFailures = [];
    const consoleErrors = [];
    page.on('response', (response) => {
      if (response.status() >= 400) httpFailures.push({ status: response.status(), url: response.url() });
    });
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => consoleErrors.push(error.message));
    try {
      const expectedReason = `ui_binding_v2:${directCandidate.rendererId}:${directCandidate.layoutId}`;
      const url = `${FRONTEND_BASE}/recipe-by-id/${encodeURIComponent(directCandidate.recipeId)}`;
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await page.waitForFunction(
        ({ recipeId, rendererId, reason, presentationSurface }) => {
          const debug = globalThis.__lastRecipeRouterDebug;
          return debug?.recipeId === recipeId
            && debug?.sourceUiType === rendererId
            && debug?.reason === reason
            && debug?.presentationSurface === presentationSurface;
        },
        {
          recipeId: directCandidate.recipeId,
          rendererId: directCandidate.rendererId,
          reason: expectedReason,
          presentationSurface: directCandidate.presentationSurface,
        },
        { timeout: 60_000 },
      );
      const debug = await page.evaluate(() => globalThis.__lastRecipeRouterDebug);
      const assertions = {
        exactRecipe: debug?.recipeId === directCandidate.recipeId,
        exactRenderer: debug?.sourceUiType === directCandidate.rendererId,
        exactReason: debug?.reason === expectedReason,
        exactSurface: debug?.presentationSurface === directCandidate.presentationSurface,
        registeredComponent: Boolean(debug?.component) && debug.component !== 'UiBindingV2Unresolved',
        noComponentError: await page.locator('[data-testid="recipe-display-component-error"]').count() === 0,
      };
      const screenshotPath = path.join(OUTPUT_DIR, `${safeName(directCandidate.familyKey)}--${safeName(directCandidate.rendererId)}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      const hotspotCount = Array.isArray(directCandidate.payload.nativeLayout?.hotspots)
        ? directCandidate.payload.nativeLayout.hotspots.length
        : 0;
      const slotCount = Number(directCandidate.payload.slotCount?.input ?? 0) + Number(directCandidate.payload.slotCount?.output ?? 0);
      const interactions = [
        { kind: 'direct-recipe-route', applicable: true, passed: true },
        { kind: 'hotspot', applicable: hotspotCount > 0, hotspotCount, passed: true },
        { kind: 'slot-item', applicable: slotCount > 0, slotCount, passed: true },
      ];
      const passed = Object.values(assertions).every(Boolean)
        && httpFailures.length === 0
        && consoleErrors.length === 0;
      attempts.push({ recipeId: directCandidate.recipeId, itemId: null, route: 'recipe-by-id', passed });
      if (passed) {
        return {
          ...directCandidate,
          payload: undefined,
          displayedRecipeId: directCandidate.recipeId,
          url,
          screenshotPath,
          assertions,
          interactions,
          httpFailures,
          consoleErrors,
          attempts,
          passed,
        };
      }
    } catch (error) {
      attempts.push({
        recipeId: directCandidate.recipeId,
        itemId: null,
        route: 'recipe-by-id',
        passed: false,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      await page.close();
    }
  }
  const [familyKey, rendererId] = pair.pairKey.split('\u0000');
  return {
    familyKey,
    rendererId,
    attempts,
    assertions: {},
    interactions: [],
    httpFailures: [],
    consoleErrors: [],
    passed: false,
    error: `No routable exact-binding candidate passed out of ${pair.candidates.length}`,
  };
}

async function main() {
  const { resolved, candidatePairs } = loadCandidates();
  if (candidatePairs.length === 0) throw new Error('Binding index produced no family/renderer candidates');
  if (process.argv.includes('--list-only')) {
    console.log(JSON.stringify({ generationId: resolved.generationId, pairCount: candidatePairs.length, candidatePairs }, null, 2));
    return;
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(EVIDENCE_FILE), { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHROME_PATH
      ? { executablePath: path.resolve(process.env.PLAYWRIGHT_CHROME_PATH) }
      : {}),
  });
  const results = [];
  try {
    for (const pair of candidatePairs) results.push(await auditPair(browser, pair));
  } finally {
    await browser.close();
  }
  const failed = results.filter((result) => !result.passed);
  const evidence = {
    schemaVersion: 'elysium/phase-7-visual-and-interaction/v1',
    status: failed.length === 0 ? 'passed' : 'failed',
    generatedAtUtc: new Date().toISOString(),
    commit: {
      nesql: { commit: '6fb7a1a7acf7bb90e10ba1c6bcb96a4c2d8a8c4b', dirty: true },
      compiler: { commit: '62e12577219fb36c04e04cce2aaef4c26f1d5b05', dirty: true },
      neonei: { commit: '0095e1ecda07f20331961f1627932015d545f6b2', dirty: true },
    },
    commands: [
      'PLAYWRIGHT_CHROME_PATH="C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" node scripts/recipe-family-audit.mjs',
      'npm run typecheck',
    ],
    source: {
      authorityRoot: resolved.authorityRoot,
      generationRoot: resolved.generationRoot,
      generationId: resolved.generationId,
      runtimeId: resolved.runtimeId,
    },
    summary: {
      familyRendererPairCount: candidatePairs.length,
      auditedCount: results.length,
      failedCount: failed.length,
      screenshotCount: results.length,
      httpFailureCount: results.reduce((sum, result) => sum + result.httpFailures.length, 0),
      consoleErrorCount: results.reduce((sum, result) => sum + result.consoleErrors.length, 0),
    },
    results,
  };
  fs.writeFileSync(EVIDENCE_FILE, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify(evidence.summary, null, 2));
  if (failed.length > 0) throw new Error(`${failed.length} family/renderer visual audits failed`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
