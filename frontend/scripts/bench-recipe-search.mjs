#!/usr/bin/env node

/**
 * Synthetic benchmark for NEI recipe search pipeline.
 * Usage:
 *   node scripts/bench-recipe-search.mjs
 *   node scripts/bench-recipe-search.mjs --recipes 10000 --runs 8 --query dust
 */

import { performance } from 'node:perf_hooks';

const parseArg = (name, fallback) => {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx < 0) return fallback;
  const value = process.argv[idx + 1];
  if (value === undefined) return fallback;
  return value;
};

const RECIPE_COUNT = Number(parseArg('recipes', 10_000));
const RUNS = Number(parseArg('runs', 10));
const QUERY = String(parseArg('query', 'dust')).toLowerCase();

const mkItem = (prefix, i) => `${prefix}~${i % 2400}`;

const makeRecipes = (count) => {
  const recipes = [];
  for (let i = 0; i < count; i++) {
    const inputs = [];
    for (let r = 0; r < 3; r++) {
      const row = [];
      for (let c = 0; c < 3; c++) {
        const id = (i + r * 13 + c * 17) % 2500;
        row.push([{ itemId: mkItem(r % 2 ? 'ore' : 'dust', id), count: 1 }]);
      }
      inputs.push(row);
    }

    recipes.push({
      recipeId: `r-${i}`,
      recipeType: i % 7 === 0 ? 'gregtech - macerator' : 'minecraft:crafting',
      outputs: [{ itemId: mkItem(i % 3 === 0 ? 'dust' : 'ingot', i), count: 1 }],
      inputs,
    });
  }
  return recipes;
};

const recipeMatchesTextQuery = (recipe, q) => {
  if (!q) return true;
  if ((recipe.recipeType || '').toLowerCase().includes(q)) return true;
  for (const output of recipe.outputs || []) {
    if ((output.itemId || '').toLowerCase().includes(q)) return true;
  }
  for (const row of recipe.inputs || []) {
    for (const cell of row || []) {
      if (!Array.isArray(cell)) continue;
      for (const candidate of cell) {
        if ((candidate.itemId || '').toLowerCase().includes(q)) return true;
      }
    }
  }
  return false;
};

const run = () => {
  const recipes = makeRecipes(RECIPE_COUNT);
  const timings = [];
  let matched = 0;

  for (let i = 0; i < RUNS; i++) {
    const t0 = performance.now();
    const result = recipes.filter((recipe) => recipeMatchesTextQuery(recipe, QUERY));
    const t1 = performance.now();
    matched = result.length;
    timings.push(t1 - t0);
  }

  timings.sort((a, b) => a - b);
  const avg = timings.reduce((sum, v) => sum + v, 0) / timings.length;
  const p95 = timings[Math.floor((timings.length - 1) * 0.95)];

  console.log('=== bench-recipe-search ===');
  console.log(`recipes: ${RECIPE_COUNT}`);
  console.log(`runs: ${RUNS}`);
  console.log(`query: ${QUERY}`);
  console.log(`matched: ${matched}`);
  console.log(`avg_ms: ${avg.toFixed(2)}`);
  console.log(`p95_ms: ${p95.toFixed(2)}`);
};

run();
