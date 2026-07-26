import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const recipeId = 'recipe:test';
const payloadKey = 'recipe:test';
const shardPath = 'recipes/ui-payload-shards/ab.json';

function u32(value) {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32LE(value, 0);
  return bytes;
}

function u64(value) {
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64LE(BigInt(value), 0);
  return bytes;
}

function wrapNativePack(schema, payload) {
  const schemaBytes = Buffer.from(schema, 'utf8');
  return Buffer.concat([
    Buffer.from('NNEIBIN\0', 'utf8'),
    u32(1),
    u32(schemaBytes.length),
    u64(payload.length),
    schemaBytes,
    payload,
  ]);
}

function writeCompactRecipePack(path) {
  const strings = [
    '',
    recipeId,
    shardPath,
    payloadKey,
    'native-nei',
    'rt~test~recipe',
    'TestMachine',
    'category:test',
    'Test Category',
  ];
  const offsets = [];
  const encodedStrings = [];
  let offset = 0;
  for (const value of strings) {
    offsets.push(offset);
    const encoded = Buffer.from(`${value}\0`, 'utf8');
    encodedStrings.push(encoded);
    offset += encoded.length;
  }
  const header = Buffer.concat([
    Buffer.from('NEIRCP1\0', 'utf8'),
    u32(1),
    u32(strings.length),
    u32(0),
    u32(0),
    u32(1),
    u32(1),
    u32(0),
    u32(5),
    u32(3),
    u32(7),
    u32(5),
  ]);
  const uiRow = Buffer.concat([1, 2, 3, 4, 5, 6, 0].map(u32));
  const categoryRow = Buffer.concat([7, 8, 1, 0, 0].map(u32));
  const payload = Buffer.concat([
    header,
    ...offsets.map(u32),
    uiRow,
    categoryRow,
    ...encodedStrings,
  ]);
  writeFileSync(path, wrapNativePack('neonei/recipe-pack/current', payload));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function createFixture(bindingOverrides = {}, bindingsOverride = null) {
  const root = mkdtempSync(join(tmpdir(), 'neonei-recipe-runtime-gate-'));
  mkdirSync(join(root, 'rust', 'ui-pack'), { recursive: true });
  mkdirSync(join(root, 'recipes', 'ui-payload-shards'), { recursive: true });
  writeCompactRecipePack(join(root, 'rust', 'recipes.bin'));
  writeJson(join(root, 'manifest.json'), {
    schemaVersion: 'neonei/dist-data/current',
    files: {
      rustRecipeBin: 'rust/recipes.bin',
      rustUiTemplateBindingIndex: 'rust/ui-pack/ui_template_binding_index.json',
    },
  });
  writeJson(join(root, 'recipes', 'ui-payload-index.json'), { recipes: [] });
  writeJson(join(root, 'recipes', 'recipe-category-index.json'), { categories: [] });
  writeJson(join(root, ...shardPath.split('/')), {
    schemaVersion: 'neonei/recipe-ui-payload-shard/v1',
    payloads: {
      [payloadKey]: {
        schemaVersion: 'neonei/recipe-ui-payload/v1',
        recipeId,
        familyKey: 'wrong-payload-family-must-be-ignored',
        machineType: 'TestMachine',
        recipeType: 'rt~test~recipe',
        inputItemIds: [],
        outputItemIds: [],
      },
    },
  });
  const binding = {
    recipeId,
    path: shardPath,
    payloadKey,
    familyKey: 'native-nei',
    presentationSurface: 'machine',
    layoutId: 'native-nei-generic',
    rendererId: 'native_nei',
    templateKey: 'web-authored/native-nei',
    ...bindingOverrides,
  };
  writeJson(join(root, 'rust', 'ui-pack', 'ui_template_binding_index.json'), {
    schemaVersion: 'neonei/ui-template-binding-index/current',
    bindings: bindingsOverride ?? [binding],
  });
  return root;
}

function runGate(root) {
  const result = spawnSync('node', ['scripts/validate-rust-recipe-runtime.mjs', '--gate', '--dist-data', root], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  assert.equal(result.signal, null, result.stderr);
  return { result, report: JSON.parse(result.stdout) };
}

test('recipe runtime gate uses binding v2 presentation authority when payload has no valid family', () => {
  const root = createFixture();
  try {
    const { result, report } = runGate(root);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(report.failures, []);
    assert.equal(report.samples[0].familyKey, 'native-nei');
    assert.equal(report.samples[0].rendererId, 'native_nei');
    assert.equal(report.samples[0].presentationSurface, 'machine');
    assert.equal(report.samples[0].layoutId, 'native-nei-generic');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('recipe runtime gate fails closed when sampled recipe has no binding', () => {
  const root = createFixture({}, []);
  try {
    const { result, report } = runGate(root);
    assert.equal(result.status, 1);
    assert.equal(report.failures.some((failure) => failure.code === 'RUST_UI_BINDING_MISSING'), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('recipe runtime gate fails closed when binding rendererId is empty', () => {
  const root = createFixture({ rendererId: '' });
  try {
    const { result, report } = runGate(root);
    assert.equal(result.status, 1);
    assert.equal(report.failures.some((failure) => (
      failure.code === 'RUST_UI_BINDING_PRESENTATION_FIELD_MISSING'
      && failure.details?.field === 'rendererId'
    )), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('recipe runtime gate rejects binding identity mismatches and duplicate recipe ids', () => {
  const root = createFixture({ path: 'recipes/ui-payload-shards/wrong.json' });
  try {
    const bindingDocumentPath = join(root, 'rust', 'ui-pack', 'ui_template_binding_index.json');
    const duplicate = {
      recipeId,
      path: shardPath,
      payloadKey,
      familyKey: 'native-nei',
      presentationSurface: 'machine',
      layoutId: 'native-nei-generic',
      rendererId: 'native_nei',
      templateKey: 'web-authored/native-nei',
    };
    const first = { ...duplicate, path: 'recipes/ui-payload-shards/wrong.json' };
    writeJson(bindingDocumentPath, {
      schemaVersion: 'neonei/ui-template-binding-index/current',
      bindings: [first, duplicate],
    });
    const { result, report } = runGate(root);
    assert.equal(result.status, 1);
    assert.equal(report.failures.some((failure) => failure.code === 'RUST_UI_BINDING_IDENTITY_MISMATCH'), true);
    assert.equal(report.failures.some((failure) => failure.code === 'RUST_UI_BINDING_DUPLICATE_RECIPE_ID'), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
