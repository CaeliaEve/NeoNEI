import test from 'node:test';
import assert from 'node:assert/strict';

import patternsRoutesModule from '../dist/routes/patterns.routes.js';

const { normalizePatternOptions } = patternsRoutesModule;

test('normalizePatternOptions accepts nested options payload', () => {
  const normalized = normalizePatternOptions({
    options: {
      crafting: 0,
      substitute: 1,
      beSubstitute: 1,
      priority: 42,
    },
  });

  assert.deepEqual(normalized, {
    crafting: 0,
    substitute: 1,
    beSubstitute: 1,
    priority: 42,
  });
});

test('normalizePatternOptions accepts flat payload fields', () => {
  const normalized = normalizePatternOptions({
    crafting: 1,
    substitute: 0,
    beSubstitute: 1,
    priority: 7,
  });

  assert.deepEqual(normalized, {
    crafting: 1,
    substitute: 0,
    beSubstitute: 1,
    priority: 7,
  });
});
