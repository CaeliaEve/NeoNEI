import test from 'node:test';
import assert from 'node:assert/strict';
import { clearUiPackRuntimeCache, loadUiPackRuntime } from '../src/services/uiPackRuntime.ts';

function pushU32(bytes, value) {
  const buffer = new ArrayBuffer(4);
  new DataView(buffer).setUint32(0, value >>> 0, true);
  bytes.push(...new Uint8Array(buffer));
}

function pushI32(bytes, value) {
  const buffer = new ArrayBuffer(4);
  new DataView(buffer).setInt32(0, value | 0, true);
  bytes.push(...new Uint8Array(buffer));
}

function encodeBinaryPack(schema, payloadBytes) {
  const schemaBytes = new TextEncoder().encode(schema);
  const payloadView = payloadBytes instanceof Uint8Array ? payloadBytes : new Uint8Array(payloadBytes);
  const bytes = [];
  bytes.push(...new TextEncoder().encode('NNEIBIN\0'));
  pushU32(bytes, 1);
  pushU32(bytes, schemaBytes.length);
  const payloadLength = BigInt(payloadView.byteLength);
  const payloadLengthBytes = new ArrayBuffer(8);
  new DataView(payloadLengthBytes).setBigUint64(0, payloadLength, true);
  bytes.push(...new Uint8Array(payloadLengthBytes));
  bytes.push(...schemaBytes);
  bytes.push(...payloadView);
  return new Uint8Array(bytes).buffer;
}

function encodeStringPack(strings) {
  const encoder = new TextEncoder();
  const offsets = [];
  const stringBytes = [];
  for (const value of strings) {
    offsets.push(stringBytes.length);
    stringBytes.push(...encoder.encode(value));
    stringBytes.push(0);
  }
  const bytes = [];
  bytes.push(...encoder.encode('NEIUIS1\0'));
  pushU32(bytes, 1);
  pushU32(bytes, strings.length);
  pushU32(bytes, stringBytes.length);
  for (const offset of offsets) {
    pushU32(bytes, offset);
  }
  bytes.push(...stringBytes);
  return new Uint8Array(bytes).buffer;
}

function encodeTemplatePack(strings) {
  const index = new Map(strings.map((value, idx) => [value, idx]));
  const bytes = [];
  bytes.push(...new TextEncoder().encode('NEIUIT1\0'));
  pushU32(bytes, 1);
  pushU32(bytes, 1);
  pushU32(bytes, 2);
  pushU32(bytes, 1);
  pushU32(bytes, 15);
  pushU32(bytes, 6);
  pushU32(bytes, 5);
  const row = [
    index.get('furnace@default') ?? 0,
    index.get('self-test-furnace') ?? 0,
    index.get('furnace') ?? 0,
    index.get('furnace') ?? 0,
    index.get('furnace') ?? 0,
    166,
    65,
    0,
    2,
    index.get('textures/gui/container/furnace.png') ?? 0,
    1,
    0,
    2,
    0,
    1,
  ];
  for (const value of row.slice(0, 5)) pushU32(bytes, value);
  for (const value of row.slice(5, 7)) pushU32(bytes, value);
  pushI32(bytes, row[7]);
  for (const value of row.slice(8, 11)) pushU32(bytes, value);
  pushU32(bytes, row[11]);
  pushU32(bytes, row[12]);
  pushU32(bytes, row[13]);
  pushU32(bytes, row[14]);
  pushU32(bytes, index.get('item-input') ?? 0);
  pushU32(bytes, 0);
  pushU32(bytes, 1);
  pushU32(bytes, 1);
  pushI32(bytes, 45);
  pushI32(bytes, 24);
  pushU32(bytes, index.get('item-output') ?? 0);
  pushU32(bytes, 1);
  pushU32(bytes, 1);
  pushU32(bytes, 1);
  pushI32(bytes, 115);
  pushI32(bytes, 24);
  pushU32(bytes, index.get('EU/t') ?? 0);
  pushI32(bytes, 80);
  pushI32(bytes, 10);
  pushU32(bytes, 24);
  pushU32(bytes, 8);
  return encodeBinaryPack('neonei/ui-template-pack/current', new Uint8Array(bytes).buffer);
}

function encodeBindingPack(strings) {
  const index = new Map(strings.map((value, idx) => [value, idx]));
  const bytes = [];
  bytes.push(...new TextEncoder().encode('NEIUIB1\0'));
  pushU32(bytes, 1);
  pushU32(bytes, 1);
  pushU32(bytes, 11);
  const row = [
    index.get('r1') ?? 0,
    index.get('recipes/ui-payload-shards/55.json') ?? 0,
    index.get('r1') ?? 0,
    index.get('furnace') ?? 0,
    index.get('furnace') ?? 0,
    index.get('Furnace') ?? 0,
    index.get('furnace@default') ?? 0,
    index.get('self-test-furnace') ?? 0,
    index.get('furnace') ?? 0,
    index.get('furnace') ?? 0,
    1,
  ];
  for (const value of row) {
    pushU32(bytes, value);
  }
  return encodeBinaryPack('neonei/ui-binding-pack/current', new Uint8Array(bytes).buffer);
}

test('loadUiPackRuntime decodes current runtime ui-pack files', async () => {
  clearUiPackRuntimeCache();
  const strings = [
    '',
    'furnace@default',
    'self-test-furnace',
    'furnace',
    'textures/gui/container/furnace.png',
    'item-input',
    'item-output',
    'EU/t',
    'r1',
    'recipes/ui-payload-shards/55.json',
    'Furnace',
  ];
  const templatePack = encodeTemplatePack(strings);
  const bindingPack = encodeBindingPack(strings);
  const stringPack = encodeBinaryPack('neonei/ui-string-pack/current', encodeStringPack(strings));
  const manifest = {
    schema: 'neonei/runtime/current',
    entrypoints: {
      uiTemplates: 'rust/ui-pack/ui_templates.bin',
      uiBindings: 'rust/ui-pack/ui_bindings.bin',
      uiStrings: 'rust/ui-pack/ui_strings.bin',
    },
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.endsWith('/api/runtime/current/manifest')) {
      return new Response(JSON.stringify(manifest), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.includes('/api/runtime/current/asset/rust/ui-pack/ui_templates.bin')) {
      return new Response(templatePack, { status: 200 });
    }
    if (url.includes('/api/runtime/current/asset/rust/ui-pack/ui_bindings.bin')) {
      return new Response(bindingPack, { status: 200 });
    }
    if (url.includes('/api/runtime/current/asset/rust/ui-pack/ui_strings.bin')) {
      return new Response(stringPack, { status: 200 });
    }
    throw new Error(`unexpected fetch: ${url}`);
  };
  try {
    const runtime = await loadUiPackRuntime('/api/runtime/current/manifest');
    assert.equal(runtime.status, 'ready');
    assert.equal(runtime.summary.templateCount, 1);
    assert.equal(runtime.summary.bindingCount, 1);
    assert.equal(runtime.summary.boundRecipeCount, 1);
    assert.equal(runtime.summary.stringCount, strings.length);
    assert.equal(runtime.templatesByKey.get('furnace@default')?.layoutKind, 'furnace');
    assert.equal(runtime.bindingsByRecipeId.get('r1')?.templateKey, 'furnace@default');
  } finally {
    globalThis.fetch = originalFetch;
    clearUiPackRuntimeCache();
  }
});
