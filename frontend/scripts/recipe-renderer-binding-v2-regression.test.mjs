import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  resolveRecipePresentationProfileFromBinding,
  resolveRequiredRecipePresentationProfile,
} from '../src/composables/recipe-display/recipeRendererRegistry.ts';

const furnaceBinding = Object.freeze({
  recipeId: 'r1',
  path: 'recipes/ui-payload-shards/55.json',
  payloadKey: 'r1',
  familyKey: 'furnace',
  recipeType: 'furnace',
  machineType: 'Furnace',
  templateKey: 'furnace@default',
  templateSignature: 'self-test-furnace',
  canonicalMachineFamily: 'furnace',
  layoutKind: 'furnace',
  presentationSurface: 'machine',
  layoutId: 'furnace',
  rendererId: 'furnace',
  bound: true,
});

test('binding v2 renderer registry resolves exact rendererId without family heuristics', () => {
  const profile = resolveRecipePresentationProfileFromBinding(furnaceBinding);

  assert.equal(profile.uiConfig.uiType, 'furnace');
  assert.equal(profile.component, 'FurnaceUI');
  assert.equal(profile.uiConfig.presentation?.surface, 'machine');
  assert.equal(profile.reason, 'ui_binding_v2:furnace:furnace');
});

test('binding v2 renderer registry resolves generic native NEI to the web-authored widget', () => {
  const profile = resolveRecipePresentationProfileFromBinding({
    ...furnaceBinding,
    familyKey: 'native-nei',
    canonicalMachineFamily: 'native-nei',
    layoutKind: 'native-nei',
    presentationSurface: 'machine',
    layoutId: 'native-nei-generic',
    rendererId: 'native_nei',
  });

  assert.equal(profile.uiConfig.uiType, 'native_nei');
  assert.equal(profile.component, 'NEIRecipeWidget');
  assert.equal(profile.reason, 'ui_binding_v2:native_nei:native-nei-generic');
});

test('binding v2 renderer registry fails closed for unknown rendererId', () => {
  assert.throws(
    () => resolveRecipePresentationProfileFromBinding({ ...furnaceBinding, rendererId: 'unknown-renderer' }),
    /Unknown recipe rendererId: unknown-renderer/,
  );
});

test('recipe presentation policy gives binding v2 authority and surfaces registry errors', () => {
  const source = readFileSync(
    new URL('../src/composables/recipe-display/recipePresentationPolicyCatalog.ts', import.meta.url),
    'utf8',
  ).replace(/\r\n/g, '\n');

  assert.match(source, /resolveRequiredRecipePresentationProfile\(uiBinding, uiBindingError, \{ preferDetailedCrafting \}\)/);
  assert.match(source, /source: 'ui-binding-v2'/);
  assert.match(source, /payloadError: error instanceof Error \? error\.message : String\(error\)/);
  assert.doesNotMatch(source, /resolveRecipePresentationProfileFromUiPayload/);
});

test('binding v2 renderer registry rejects missing rendererId instead of guessing', () => {
  assert.throws(
    () => resolveRecipePresentationProfileFromBinding({ ...furnaceBinding, rendererId: '' }),
    /rendererId is missing/,
  );
});

test('binding v2 authority rejects missing bindings instead of falling back to detected names', () => {
  assert.throws(
    () => resolveRequiredRecipePresentationProfile(null),
    /no binding was resolved/,
  );
  assert.throws(
    () => resolveRequiredRecipePresentationProfile(null, 'UI binding v2 is missing for recipeId: r404'),
    /UI binding v2 is missing for recipeId: r404/,
  );
});

test('binding v2 parser owns exact header offsets, stride, and presentation columns', () => {
  const source = readFileSync(
    new URL('../src/services/uiPackRuntime.ts', import.meta.url),
    'utf8',
  ).replace(/\r\n/g, '\n');

  assert.match(source, /const version = readU32\(view, 8\);/);
  assert.match(source, /const bindingCount = readU32\(view, 12\);/);
  assert.match(source, /const rowStride = readU32\(view, 16\);/);
  assert.match(source, /presentationSurface: resolveString\(strings, readU32\(view, rowOffset \+ 40\)\)/);
  assert.match(source, /layoutId: resolveString\(strings, readU32\(view, rowOffset \+ 44\)\)/);
  assert.match(source, /rendererId: resolveString\(strings, readU32\(view, rowOffset \+ 48\)\)/);
  assert.match(source, /const flags = readU32\(view, rowOffset \+ 52\);/);
  assert.match(source, /is missing required v2 presentation metadata/);
});
