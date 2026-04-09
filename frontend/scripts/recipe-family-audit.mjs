import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const FRONTEND_BASE = process.env.FRONTEND_BASE ?? 'http://127.0.0.1:5173';
const EXPORT_ROOT = process.env.NESQL_REPOSITORY_PATH ?? 'E:/GTNH/.minecraft/versions/GT New Horizons 2.8.0/nesql/ae2-test';
const RECIPES_ROOT = path.join(EXPORT_ROOT, 'recipes');
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = process.env.RECIPE_AUDIT_DIR ?? path.resolve(SCRIPT_DIR, '../.audit/recipe-families');

const FAMILY_RULES = [
  { family: 'thaumcraft_arcane', match: ({ machineType, recipeType, recipe }) => /arcane|奥术|有序奥术|无序奥术/i.test(`${machineType} ${recipeType}`) || Boolean(recipe.metadata?.aspects || recipe.additionalData?.aspects) },
  { family: 'thaumcraft_infusion', match: ({ machineType, recipeType }) => /infusion|注魔/i.test(`${machineType} ${recipeType}`) },
  { family: 'botania_rune_altar', match: ({ machineType, recipeType }) => /rune altar|符文祭坛/i.test(`${machineType} ${recipeType}`) },
  { family: 'botania_mana_pool', match: ({ machineType, recipeType }) => /mana pool|魔力池/i.test(`${machineType} ${recipeType}`) },
  { family: 'botania_terra_plate', match: ({ machineType, recipeType }) => /terra plate/i.test(`${machineType} ${recipeType}`) },
  { family: 'botania_elven_trade', match: ({ machineType, recipeType }) => /elven trade|alfheim|精灵交易/i.test(`${machineType} ${recipeType}`) },
  { family: 'blood_magic_altar', match: ({ machineType, recipeType }) => /blood altar|血祭坛/i.test(`${machineType} ${recipeType}`) },
  { family: 'blood_alchemy_table', match: ({ machineType, recipeType }) => /alchemy table|炼金台|blood alchemy/i.test(`${machineType} ${recipeType}`) },
  { family: 'blood_binding_ritual', match: ({ machineType, recipeType }) => /binding ritual|束缚仪式|绑定仪式/i.test(`${machineType} ${recipeType}`) },
  { family: 'blood_orb_crafting', match: ({ machineType, recipeType }) => /blood orb|血宝珠|特定血宝珠合成|不定血宝珠合成/i.test(`${machineType} ${recipeType}`) },
  { family: 'gt_assembly_line', match: ({ machineType, recipeType }) => /assembly line|装配线/i.test(`${machineType} ${recipeType}`) },
  { family: 'gt_research_station', match: ({ machineType, recipeType }) => /research station|研究站/i.test(`${machineType} ${recipeType}`) },
  { family: 'gt_blast_furnace', match: ({ machineType, recipeType }) => /blast furnace|高炉/i.test(`${machineType} ${recipeType}`) },
  { family: 'gt_generic', match: ({ machineType, recipeType }) => /gregtech/i.test(`${machineType} ${recipeType}`) },
  { family: 'standard_crafting', match: ({ machineType, recipeType }) => !machineType && /crafting|shaped|shapeless/i.test(`${recipeType}`) },
];

function readJsonGz(filePath) {
  return JSON.parse(zlib.gunzipSync(fs.readFileSync(filePath)).toString('utf8'));
}

function walkRecipeFiles(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkRecipeFiles(full, acc);
    else if (entry.isFile() && entry.name === 'recipes.json.gz') acc.push(full);
  }
  return acc;
}

function buildCandidates() {
  const files = walkRecipeFiles(RECIPES_ROOT);
  const candidates = new Map();

  for (const filePath of files) {
    const recipes = readJsonGz(filePath);
    for (const recipe of recipes) {
      const machineType = String(recipe.machineInfo?.machineType || recipe.recipeTypeData?.machineType || '');
      const recipeType = String(recipe.recipeType || '');
      const outputItemId = recipe.outputs?.[0]?.item?.itemId ?? null;
      if (!outputItemId) continue;

      for (const rule of FAMILY_RULES) {
        if (candidates.has(rule.family)) continue;
        if (rule.match({ machineType, recipeType, recipe })) {
          candidates.set(rule.family, {
            outputItemId,
            machineType,
            recipeType,
            recipeId: recipe.id ?? recipe.recipeId ?? null,
            filePath,
          });
        }
      }
    }
  }

  return candidates;
}

async function auditPage(browser, family, candidate) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1800 } });
  const failed = [];
  page.on('response', (resp) => {
    if (resp.status() >= 400) failed.push(`${resp.status()} ${resp.url()}`);
  });

  const url = `${FRONTEND_BASE}/recipe/${encodeURIComponent(candidate.outputItemId)}`;
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(7000);

  const debugButton = await page.$('text=Show Debug');
  if (debugButton) {
    await debugButton.click();
    await page.waitForTimeout(300);
  }

  const debugText = await page.$eval('#recipe-display-debug-panel', (el) => el.textContent ?? '').catch(() => '');
  const snapshot = await page.evaluate(() => ({
    body: document.body.innerText.slice(0, 4000),
    hasHorizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
    hasVerticalOverflow: document.documentElement.scrollHeight > window.innerHeight * 1.5,
    hasThaumArcane: !!document.querySelector('.thaum-arcane'),
    hasThaumInfusion: !!document.querySelector('.thaum-infusion'),
    aspectRows: document.querySelectorAll('.aspect-row').length,
  }));

  const screenshotPath = path.join(OUTPUT_DIR, `${family}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await page.close();

  return {
    family,
    candidate,
    url,
    failed,
    debugText,
    snapshot,
    screenshotPath,
  };
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const candidates = buildCandidates();
  const browser = await chromium.launch({ headless: true });
  const results = [];

  for (const rule of FAMILY_RULES) {
    const candidate = candidates.get(rule.family);
    if (!candidate) {
      results.push({ family: rule.family, missingCandidate: true });
      continue;
    }
    results.push(await auditPage(browser, rule.family, candidate));
  }

  await browser.close();
  fs.writeFileSync(path.join(OUTPUT_DIR, 'audit.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
