import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = (relativePath) => readFileSync(resolve(root, relativePath), 'utf8');

const readerSource = source('scripts/native-runtime-pack-reader.mjs');
const consumerScripts = [
  'scripts/validate-browser-pages-v3.mjs',
  'scripts/validate-known-runtime-items.mjs',
  'scripts/validate-recipe-open-smoke.mjs',
];

test('script-side native runtime pack reader owns NNEIBIN envelope and compact parsers', () => {
  assert.match(readerSource, /NATIVE_RUNTIME_PACK_MAGIC = 'NNEIBIN\\0'/);
  assert.match(readerSource, /readNativeRuntimePayload/);
  for (const parser of [
    'parseNativeBrowserBin',
    'parseNativeGroupsBin',
    'parseNativeSearchBin',
    'parseNativeTexturesBin',
    'parseNativeRecipeBin',
  ]) {
    assert.match(readerSource, new RegExp(`export function ${parser}\\b`));
  }
});

test('runtime smoke scripts consume shared native pack reader instead of owning local parsers', () => {
  for (const relativePath of consumerScripts) {
    const text = source(relativePath);
    assert.match(text, /from "\.\/native-runtime-pack-reader\.mjs"/,
      `${relativePath} must import the shared script-side runtime pack reader`);
    assert.doesNotMatch(text, /function readRuntimeBin\b/,
      `${relativePath} must not own a local NNEIBIN reader`);
    assert.doesNotMatch(text, /function readCompactString\b|function parseCompactStrings\b/,
      `${relativePath} must not own compact string table parsing`);
    assert.doesNotMatch(text, /function parse(?:Browser|Groups|Search|Textures|Recipe)Bin\b/,
      `${relativePath} must not own compact domain pack parsers`);
  }
});
