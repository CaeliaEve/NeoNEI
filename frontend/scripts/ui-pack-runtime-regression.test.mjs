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
  pushU32(bytes, 3);
  pushU32(bytes, 1);
  pushU32(bytes, 2);
  pushU32(bytes, 1);
  pushU32(bytes, 0);
  pushU32(bytes, 0);
  pushU32(bytes, 19);
  pushU32(bytes, 6);
  pushU32(bytes, 5);
  pushU32(bytes, 12);
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
    0,
    0,
    0,
    0,
  ];
  row.forEach((value, idx) => {
    if (idx === 7) {
      pushI32(bytes, value);
    } else {
      pushU32(bytes, value);
    }
  });
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

function buildUiPackAbiReport({ templatePack, bindingPack, stringPack, status = 'ok', artifacts = {} }) {
  const baseArtifacts = [
    {
      logicalName: 'rustUiTemplatesBin',
      path: 'rust/ui-pack/ui_templates.bin',
      kind: 'binary-pack',
      status: 'present',
      bytes: templatePack.byteLength,
      envelopeSchema: 'neonei/ui-template-pack/current',
      payloadMagic: 'NEIUIT1_NUL',
      version: 3,
      sections: [],
    },
    {
      logicalName: 'rustUiBindingsBin',
      path: 'rust/ui-pack/ui_bindings.bin',
      kind: 'binary-pack',
      status: 'present',
      bytes: bindingPack.byteLength,
      envelopeSchema: 'neonei/ui-binding-pack/current',
      payloadMagic: 'NEIUIB1_NUL',
      version: 1,
      sections: [],
    },
    {
      logicalName: 'rustUiStringsBin',
      path: 'rust/ui-pack/ui_strings.bin',
      kind: 'binary-pack',
      status: 'present',
      bytes: stringPack.byteLength,
      envelopeSchema: 'neonei/ui-string-pack/current',
      payloadMagic: 'NEIUIS1_NUL',
      version: 1,
      sections: [],
    },
  ].map((artifact) => ({ ...artifact, ...(artifacts[artifact.logicalName] ?? {}) }));
  return {
    schemaVersion: 'elysium-compiler/ui-pack-abi-validation/v1',
    packAbiVersion: 'elysium.pack.v1',
    generatedAt: 'deterministic-rust-compiler',
    status,
    compileScope: 'native-ui',
    expectedArtifactCount: 8,
    presentArtifactCount: status === 'ok' ? 8 : 7,
    missingRequiredArtifacts: status === 'ok' ? [] : ['rust/ui-pack/ui_templates.bin'],
    sectionViolations: [],
    artifacts: baseArtifacts,
    policy: {
      missingRequiredArtifact: 'fail-closed',
      envelopeSchema: 'NNEIBIN version 1 envelope schema must match the declared UI pack schema',
      binarySectionLayout: 'UI binary sections must have exact magic, version, stride, and byte length',
      stringRefIntegrity: 'all UI template and binding string references must resolve into ui_strings.bin',
      legacyFallback: 'forbidden',
    },
  };
}

function buildNativeUiExportAbiReport({ status = 'ok', overrides = {} } = {}) {
  return {
    schemaVersion: 'elysium-compiler/native-ui-export-abi-validation/v1',
    exportAbiVersion: 'elysium.export.v2',
    generatedAt: 'deterministic-rust-compiler',
    status,
    manifestLogicalName: 'nativeUiValidation',
    manifestPath: 'validation/native-ui-abi.json',
    reportPath: 'validation/native-ui-abi.json',
    rawReportSchemaVersion: 'nesqlpp/raw-export/alpha1/native-ui-validation',
    rawReportStatus: status === 'ok' ? 'ok' : 'blocked',
    layoutCount: 1,
    slotCount: 2,
    missingSurfaceCount: 0,
    slotBoundsViolationCount: 0,
    backgroundBoundsViolationCount: 0,
    coordinateContractViolationCount: 0,
    missingReport: false,
    schemaViolations: [],
    pathViolations: [],
    contractViolations: [],
    samples: {
      missingSurface: [],
      slotBounds: [],
      backgroundBounds: [],
      coordinateContract: [],
    },
    policy: {
      missingReport: 'fail-closed',
      schemaMismatch: 'fail-closed',
      blockedRawReport: 'fail-closed',
      geometryContract: 'layouts and slots must be bounded, surface-complete, and use NEI pixel coordinates with uniform scaling',
      pathPortability: 'portable-relative raw-export path only; expected validation/native-ui-abi.json',
      legacyFallback: 'forbidden',
    },
    ...overrides,
  };
}

function withRuntimeFiles(manifest, { templatePack, bindingPack, stringPack, abiReport, exportAbiReport }) {
  return {
    ...manifest,
    files: [
      { path: 'rust/ui-pack/ui_templates.bin', bytes: templatePack.byteLength },
      { path: 'rust/ui-pack/ui_bindings.bin', bytes: bindingPack.byteLength },
      { path: 'rust/ui-pack/ui_strings.bin', bytes: stringPack.byteLength },
      { path: 'rust/native-ui-export-abi-validation-report.json', bytes: JSON.stringify(exportAbiReport).length },
      { path: 'rust/ui-pack-abi-validation-report.json', bytes: JSON.stringify(abiReport).length },
    ],
  };
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
  const exportAbiReport = buildNativeUiExportAbiReport();
  const abiReport = buildUiPackAbiReport({ templatePack, bindingPack, stringPack });
  const manifest = withRuntimeFiles({
    schema: 'neonei/runtime/current',
    capabilities: ['recipes.native-ui-layout', 'recipes.ui-pack', 'native-render.webgl2'],
    entrypoints: {
      uiTemplates: 'rust/ui-pack/ui_templates.bin',
      uiBindings: 'rust/ui-pack/ui_bindings.bin',
      uiStrings: 'rust/ui-pack/ui_strings.bin',
    },
  }, { templatePack, bindingPack, stringPack, abiReport, exportAbiReport });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.endsWith('/api/runtime/current/manifest')) {
      return new Response(JSON.stringify(manifest), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.includes('/api/runtime/current/asset/rust/ui-pack-abi-validation-report.json')) {
      return new Response(JSON.stringify(abiReport), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.includes('/api/runtime/current/asset/rust/native-ui-export-abi-validation-report.json')) {
      return new Response(JSON.stringify(exportAbiReport), { status: 200, headers: { 'content-type': 'application/json' } });
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

test('loadUiPackRuntime fails closed before pack fetch when ABI validation report is blocked', async () => {
  clearUiPackRuntimeCache();
  const strings = ['', 'furnace@default'];
  const templatePack = encodeTemplatePack([
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
  ]);
  const bindingPack = encodeBindingPack([
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
  ]);
  const stringPack = encodeBinaryPack('neonei/ui-string-pack/current', encodeStringPack(strings));
  const exportAbiReport = buildNativeUiExportAbiReport();
  const abiReport = buildUiPackAbiReport({ templatePack, bindingPack, stringPack, status: 'blocked' });
  const manifest = withRuntimeFiles({
    schema: 'neonei/runtime/current',
    capabilities: ['recipes.native-ui-layout', 'recipes.ui-pack', 'native-render.webgl2'],
    entrypoints: {
      uiTemplates: 'rust/ui-pack/ui_templates.bin',
      uiBindings: 'rust/ui-pack/ui_bindings.bin',
      uiStrings: 'rust/ui-pack/ui_strings.bin',
    },
  }, { templatePack, bindingPack, stringPack, abiReport, exportAbiReport });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.endsWith('/api/runtime/current/manifest?case=blocked-abi')) {
      return new Response(JSON.stringify(manifest), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.includes('/api/runtime/current/asset/rust/ui-pack-abi-validation-report.json')) {
      return new Response(JSON.stringify(abiReport), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.includes('/api/runtime/current/asset/rust/native-ui-export-abi-validation-report.json')) {
      return new Response(JSON.stringify(exportAbiReport), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    throw new Error(`runtime ABI gate should not fetch UI pack artifacts: ${url}`);
  };
  try {
    const runtime = await loadUiPackRuntime('/api/runtime/current/manifest?case=blocked-abi');
    assert.equal(runtime.status, 'error');
    assert.match(runtime.error ?? '', /ABI validation report is not ok: blocked/);
    assert.equal(runtime.summary.templateCount, 0);
  } finally {
    globalThis.fetch = originalFetch;
    clearUiPackRuntimeCache();
  }
});

test('loadUiPackRuntime fails closed before pack fetch when native UI export ABI report is blocked', async () => {
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
  const exportAbiReport = buildNativeUiExportAbiReport({
    status: 'blocked',
    overrides: {
      coordinateContractViolationCount: 1,
      contractViolations: ['coordinateContractViolationCount must be zero but was 1'],
    },
  });
  const abiReport = buildUiPackAbiReport({ templatePack, bindingPack, stringPack });
  const manifest = withRuntimeFiles({
    schema: 'neonei/runtime/current',
    capabilities: ['recipes.native-ui-layout', 'recipes.ui-pack', 'native-render.webgl2'],
    entrypoints: {
      uiTemplates: 'rust/ui-pack/ui_templates.bin',
      uiBindings: 'rust/ui-pack/ui_bindings.bin',
      uiStrings: 'rust/ui-pack/ui_strings.bin',
    },
  }, { templatePack, bindingPack, stringPack, abiReport, exportAbiReport });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.endsWith('/api/runtime/current/manifest?case=blocked-export-abi')) {
      return new Response(JSON.stringify(manifest), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.includes('/api/runtime/current/asset/rust/native-ui-export-abi-validation-report.json')) {
      return new Response(JSON.stringify(exportAbiReport), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.includes('/api/runtime/current/asset/rust/ui-pack-abi-validation-report.json')) {
      return new Response(JSON.stringify(abiReport), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    throw new Error(`runtime export ABI gate should not fetch UI pack artifacts: ${url}`);
  };
  try {
    const runtime = await loadUiPackRuntime('/api/runtime/current/manifest?case=blocked-export-abi');
    assert.equal(runtime.status, 'error');
    assert.match(runtime.error ?? '', /export ABI validation report is not ok: blocked/);
    assert.equal(runtime.summary.templateCount, 0);
  } finally {
    globalThis.fetch = originalFetch;
    clearUiPackRuntimeCache();
  }
});

test('loadUiPackRuntime rejects ABI reports that do not match manifest entrypoints', async () => {
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
  const exportAbiReport = buildNativeUiExportAbiReport();
  const abiReport = buildUiPackAbiReport({
    templatePack,
    bindingPack,
    stringPack,
    artifacts: {
      rustUiTemplatesBin: {
        path: 'rust/ui-pack/other_templates.bin',
      },
    },
  });
  const manifest = withRuntimeFiles({
    schema: 'neonei/runtime/current',
    capabilities: ['recipes.native-ui-layout', 'recipes.ui-pack', 'native-render.webgl2'],
    entrypoints: {
      uiTemplates: 'rust/ui-pack/ui_templates.bin',
      uiBindings: 'rust/ui-pack/ui_bindings.bin',
      uiStrings: 'rust/ui-pack/ui_strings.bin',
    },
  }, { templatePack, bindingPack, stringPack, abiReport, exportAbiReport });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.endsWith('/api/runtime/current/manifest?case=abi-path-mismatch')) {
      return new Response(JSON.stringify(manifest), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.includes('/api/runtime/current/asset/rust/ui-pack-abi-validation-report.json')) {
      return new Response(JSON.stringify(abiReport), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.includes('/api/runtime/current/asset/rust/native-ui-export-abi-validation-report.json')) {
      return new Response(JSON.stringify(exportAbiReport), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    throw new Error(`runtime ABI gate should not fetch UI pack artifacts: ${url}`);
  };
  try {
    const runtime = await loadUiPackRuntime('/api/runtime/current/manifest?case=abi-path-mismatch');
    assert.equal(runtime.status, 'error');
    assert.match(runtime.error ?? '', /artifact path mismatch for rustUiTemplatesBin/);
    assert.equal(runtime.summary.templateCount, 0);
  } finally {
    globalThis.fetch = originalFetch;
    clearUiPackRuntimeCache();
  }
});

test('loadUiPackRuntime fails explicitly when native UI runtime capabilities are missing', async () => {
  clearUiPackRuntimeCache();
  const manifest = {
    schema: 'neonei/runtime/current',
    capabilities: ['recipes.lookup'],
    entrypoints: {
      uiTemplates: 'rust/ui-pack/ui_templates.bin',
      uiBindings: 'rust/ui-pack/ui_bindings.bin',
      uiStrings: 'rust/ui-pack/ui_strings.bin',
    },
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.endsWith('/api/runtime/current/manifest?case=missing-capability')) {
      return new Response(JSON.stringify(manifest), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    throw new Error(`runtime ABI gate should not fetch UI pack artifacts: ${url}`);
  };
  try {
    const runtime = await loadUiPackRuntime('/api/runtime/current/manifest?case=missing-capability');
    assert.equal(runtime.status, 'error');
    assert.match(runtime.error ?? '', /missing required capabilities: recipes\.native-ui-layout, recipes\.ui-pack, native-render\.webgl2/);
    assert.equal(runtime.summary.templateCount, 0);
  } finally {
    globalThis.fetch = originalFetch;
    clearUiPackRuntimeCache();
  }
});

test('loadUiPackRuntime fails explicitly when native UI runtime entrypoints are missing', async () => {
  clearUiPackRuntimeCache();
  const manifest = {
    schema: 'neonei/runtime/current',
    capabilities: {
      'recipes.native-ui-layout': true,
      'recipes.ui-pack': true,
      'native-render.webgl2': true,
    },
    entrypoints: {
      uiTemplates: 'rust/ui-pack/ui_templates.bin',
      uiStrings: 'rust/ui-pack/ui_strings.bin',
    },
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.endsWith('/api/runtime/current/manifest?case=missing-entrypoint')) {
      return new Response(JSON.stringify(manifest), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    throw new Error(`runtime ABI gate should not fetch UI pack artifacts: ${url}`);
  };
  try {
    const runtime = await loadUiPackRuntime('/api/runtime/current/manifest?case=missing-entrypoint');
    assert.equal(runtime.status, 'error');
    assert.match(runtime.error ?? '', /missing required entrypoints: uiBindings/);
    assert.equal(runtime.summary.bindingCount, 0);
  } finally {
    globalThis.fetch = originalFetch;
    clearUiPackRuntimeCache();
  }
});
