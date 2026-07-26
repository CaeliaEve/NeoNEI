import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
require('ts-node/register');

const backendRoot = resolve(import.meta.dirname, '..');

function tempRoot(prefix) {
  return join(tmpdir(), `${prefix}-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
}

function writeJson(filePath, payload) {
  writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function createCompiledArtifact(label) {
  const root = tempRoot(`neonei-generation-consumer-${label}`);
  for (const relativeDir of [
    'browser',
    'textures',
    'recipes',
    'recipes/ui-payload-shards',
    'rust',
    'rust/ui-pack',
  ]) {
    mkdirSync(join(root, relativeDir), { recursive: true });
  }

  for (const [relativePath, payload] of [
    ['rust/browser.bin', 'browser'],
    ['rust/groups.bin', 'groups'],
    ['rust/search.bin', 'search'],
    ['rust/recipes.bin', 'recipes'],
    ['rust/strings.zh_cn.bin', 'strings'],
    ['rust/ui-pack/ui_templates.bin', 'templates'],
    ['rust/ui-pack/ui_bindings.bin', 'bindings'],
    ['rust/ui-pack/ui_strings.bin', 'ui strings'],
  ]) {
    writeFileSync(join(root, relativePath), Buffer.from(`${payload}-${label}`));
  }

  writeJson(join(root, 'textures', 'browser-atlas-index.json'), {
    schemaVersion: 'neonei/browser-atlas-index/current',
    itemCount: 1,
    items: [{
      itemId: `item-${label}`,
      staticAtlas: { atlasFile: `atlas-${label}.png`, x: 0, y: 0, width: 16, height: 16 },
    }],
  });
  writeJson(join(root, 'browser', 'item-catalog.json'), {
    schemaVersion: 'neonei/browser-item-catalog/current',
    items: [{ itemId: `item-${label}`, browserOrder: 0 }],
    defaultEntries: [{ entryKind: 'item', itemId: `item-${label}` }],
  });
  writeJson(join(root, 'rust', 'ui-pack', 'ui_family_census.json'), {
    schemaVersion: 'nesqlpp/ui-family-census/v2',
    generatedAt: `2026-07-15T00:00:0${label === 'first' ? 1 : 2}.000Z`,
    source: { kind: 'fixture', resource: label, entryCount: 1, classifier: 'fixture' },
    summary: {
      handlerCount: 1,
      familyCount: 1,
      modCount: 1,
      layoutKindCount: 1,
      nativeFamilyCount: 1,
      craftingFamilyCount: 0,
      machineFamilyCount: 1,
    },
    families: [{
      familyKey: `family-${label}`,
      canonicalMachineFamily: `machine-${label}`,
      layoutKind: 'machine',
      width: 176,
      height: 65,
      yShift: 0,
      maxRecipesPerPage: 1,
      imageResource: '',
      members: [],
    }],
  });
  writeJson(join(root, 'rust', 'ui-pack', 'ui_template_catalog.json'), {
    schemaVersion: 'nesqlpp/ui-template-catalog/v2',
    generatedAt: `2026-07-15T00:00:0${label === 'first' ? 1 : 2}.000Z`,
    source: {
      kind: 'fixture',
      resource: label,
      censusSchemaVersion: 'nesqlpp/ui-family-census/v2',
      censusFamilyCount: 1,
      censusHandlerCount: 1,
      layoutSpecProvider: 'fixture',
    },
    summary: {
      handlerCount: 1,
      templateCount: 1,
      familyCount: 1,
      layoutKindCount: 1,
      slotCount: 0,
      primitiveCount: 0,
      overlayCount: 0,
    },
    templates: [{
      templateKey: `template-${label}`,
      templateSignature: `signature-${label}`,
      familyKey: `family-${label}`,
      canonicalMachineFamily: `machine-${label}`,
      layoutKind: 'machine',
      width: 176,
      height: 65,
      yShift: 0,
      maxRecipesPerPage: 1,
      imageResource: '',
      handlerCount: 1,
      slotCount: 0,
      handlerIds: [],
      handlerClasses: [],
      modIds: [],
      slots: [],
      dynamicPrimitives: [],
      textOverlays: [],
    }],
  });
  writeJson(join(root, 'recipes', 'ui-payload-index.json'), {
    recipes: [{
      recipeId: `recipe-${label}`,
      path: `recipes/ui-payload-shards/${label}.json`,
      payloadKey: `recipe-${label}`,
      familyKey: `family-${label}`,
      recipeType: 'machine',
      machineType: `machine-${label}`,
    }],
  });
  writeJson(join(root, 'recipes', 'ui-payload-shards', `${label}.json`), {
    payloads: { [`recipe-${label}`]: { recipeId: `recipe-${label}` } },
  });
  writeJson(join(root, 'rust', 'ui-pack', 'ui_template_binding_index.json'), {
    schemaVersion: 'neonei/ui-template-binding-index/current',
    generatedAt: `2026-07-15T00:00:0${label === 'first' ? 1 : 2}.000Z`,
    source: {
      recipeUiPayloadIndex: { path: 'recipes/ui-payload-index.json', exists: true, recipeCount: 1 },
      uiTemplateCatalog: {
        path: 'rust/ui-pack/ui_template_catalog.json',
        exists: true,
        templateCount: 1,
        familyCount: 1,
        layoutKindCount: 1,
      },
    },
    summary: {
      recipeCount: 1,
      boundRecipeCount: 1,
      unboundRecipeCount: 0,
      templateCount: 1,
      familyCount: 1,
      layoutKindCount: 1,
    },
    bindings: [{
      recipeId: `recipe-${label}`,
      path: `recipes/ui-payload-shards/${label}.json`,
      payloadKey: `recipe-${label}`,
      familyKey: `family-${label}`,
      recipeType: 'machine',
      machineType: `machine-${label}`,
      templateKey: `template-${label}`,
      templateSignature: `signature-${label}`,
      canonicalMachineFamily: `machine-${label}`,
      layoutKind: 'machine',
    }],
  });

  const declaredFiles = [
    'rust/browser.bin',
    'rust/groups.bin',
    'rust/search.bin',
    'rust/recipes.bin',
    'rust/strings.zh_cn.bin',
    'rust/ui-pack/ui_templates.bin',
    'rust/ui-pack/ui_bindings.bin',
    'rust/ui-pack/ui_strings.bin',
    'textures/browser-atlas-index.json',
    'browser/item-catalog.json',
    'rust/ui-pack/ui_family_census.json',
    'rust/ui-pack/ui_template_catalog.json',
    'rust/ui-pack/ui_template_binding_index.json',
    'recipes/ui-payload-index.json',
    `recipes/ui-payload-shards/${label}.json`,
  ];
  writeJson(join(root, 'manifest.json'), {
    schemaVersion: 'neonei/dist-data/current',
    source: 'elysium-compiler',
    files: {
      rustRuntimeManifest: 'rust/runtime-manifest.json',
      browserAtlasIndex: 'textures/browser-atlas-index.json',
      browserLayoutIndex: 'browser/item-catalog.json',
      uiFamilyCensus: 'rust/ui-pack/ui_family_census.json',
      uiTemplateCatalog: 'rust/ui-pack/ui_template_catalog.json',
      uiTemplateBindingIndex: 'rust/ui-pack/ui_template_binding_index.json',
      recipeUiPayloadIndex: 'recipes/ui-payload-index.json',
    },
    nativeRuntime: { authority: 'rust', status: 'ready' },
  });
  writeJson(join(root, 'rust', 'runtime-manifest.json'), {
    schemaVersion: 'neonei/rust-runtime-manifest/current',
    runtimeId: `runtime-${label}`,
    entrypoints: {
      browser: 'rust/browser.bin',
      groups: 'rust/groups.bin',
      recipes: 'rust/recipes.bin',
      search: 'rust/search.bin',
      stringsZhCn: 'rust/strings.zh_cn.bin',
      uiTemplates: 'rust/ui-pack/ui_templates.bin',
      uiBindings: 'rust/ui-pack/ui_bindings.bin',
      uiStrings: 'rust/ui-pack/ui_strings.bin',
    },
    files: declaredFiles.map((path) => ({ path, bytes: 1 })),
  });
  return root;
}

test('current runtime consumers and static delivery switch to the newly promoted generation', async () => {
  const authorityRoot = tempRoot('neonei-generation-consumer-authority');
  const firstArtifact = createCompiledArtifact('first');
  const secondArtifact = createCompiledArtifact('second');
  process.env.DIST_DATA_DIR = authorityRoot;
  process.env.TS_NODE_PROJECT = resolve(backendRoot, 'tsconfig.json');
  let server = null;
  try {
    const { promoteExternalRuntimeArtifact } = require(resolve(
      backendRoot,
      'src/services/external-runtime-artifact-promotion.service.ts',
    ));
    const { getBrowserLayoutIndexService } = require(resolve(
      backendRoot,
      'src/services/browser-layout-index.service.ts',
    ));
    const { BrowserAtlasIndexService } = require(resolve(
      backendRoot,
      'src/services/browser-atlas-index.service.ts',
    ));
    const { UiFamilyCensusService } = require(resolve(
      backendRoot,
      'src/services/ui-family-census.service.ts',
    ));
    const { UiTemplateCatalogService } = require(resolve(
      backendRoot,
      'src/services/ui-template-catalog.service.ts',
    ));
    const { UiTemplateBindingIndexService } = require(resolve(
      backendRoot,
      'src/services/ui-template-binding-index.service.ts',
    ));
    const { RenderContractService } = require(resolve(
      backendRoot,
      'src/services/render-contract.service.ts',
    ));
    const express = require('express');
    const { registerStaticAssetRoutes } = require(resolve(
      backendRoot,
      'src/routes/static-assets.routes.ts',
    ));

    const app = express();
    registerStaticAssetRoutes(app);
    server = await new Promise((resolveServer) => {
      const listening = app.listen(0, '127.0.0.1', () => resolveServer(listening));
    });
    const address = server.address();
    assert.equal(typeof address, 'object');
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const missingAuthorityResponse = await fetch(`${baseUrl}/dist-data/rust/browser.bin`, {
      headers: { connection: 'close' },
    });
    assert.equal(missingAuthorityResponse.status, 409);
    await missingAuthorityResponse.arrayBuffer();

    const layout = getBrowserLayoutIndexService();
    const atlas = new BrowserAtlasIndexService();
    const census = new UiFamilyCensusService();
    const templates = new UiTemplateCatalogService();
    const bindings = new UiTemplateBindingIndexService();
    const renderContract = new RenderContractService();

    const first = promoteExternalRuntimeArtifact({ artifactRoot: firstArtifact, distDataDir: authorityRoot });
    assert.equal(layout.getIndex()?.items?.[0]?.itemId, 'item-first');
    assert.equal(atlas.getIndex().items[0]?.itemId, 'item-first');
    assert.equal(census.getReport().families[0]?.familyKey, 'family-first');
    assert.equal(templates.getReport().templates[0]?.templateKey, 'template-first');
    assert.equal(bindings.getReport().bindings[0]?.recipeId, 'recipe-first');
    const firstOverview = renderContract.getOverview();
    assert.equal(firstOverview.files.uiFamilyCensus.familyCount, 1);
    assert.equal(firstOverview.files.uiFamilyCensus.path.startsWith(first.generationRoot), true);
    const firstStaticResponse = await fetch(`${baseUrl}/dist-data/rust/browser.bin`, {
      headers: { connection: 'close' },
    });
    assert.equal(firstStaticResponse.status, 200);
    assert.equal(firstStaticResponse.headers.get('x-neonei-runtime-id'), 'runtime-first');
    assert.equal(Buffer.from(await firstStaticResponse.arrayBuffer()).toString('utf8'), 'browser-first');
    const missingStaticResponse = await fetch(`${baseUrl}/dist-data/not-declared.txt`, {
      headers: { connection: 'close' },
    });
    assert.equal(missingStaticResponse.status, 404);
    await missingStaticResponse.arrayBuffer();

    const second = promoteExternalRuntimeArtifact({ artifactRoot: secondArtifact, distDataDir: authorityRoot });
    assert.notEqual(second.generationRoot, first.generationRoot);
    assert.equal(layout.getIndex()?.items?.[0]?.itemId, 'item-second');
    assert.equal(atlas.getIndex().items[0]?.itemId, 'item-second');
    assert.equal(census.getReport().families[0]?.familyKey, 'family-second');
    assert.equal(templates.getReport().templates[0]?.templateKey, 'template-second');
    assert.equal(bindings.getReport().bindings[0]?.recipeId, 'recipe-second');
    const secondOverview = renderContract.getOverview();
    assert.equal(secondOverview.files.uiTemplateCatalog.path.startsWith(second.generationRoot), true);
    assert.equal(secondOverview.files.uiTemplateBindingIndex.path.startsWith(second.generationRoot), true);
    const secondStaticResponse = await fetch(`${baseUrl}/dist-data/rust/browser.bin`, {
      headers: { connection: 'close' },
    });
    assert.equal(secondStaticResponse.status, 200);
    assert.equal(secondStaticResponse.headers.get('x-neonei-runtime-id'), 'runtime-second');
    assert.equal(Buffer.from(await secondStaticResponse.arrayBuffer()).toString('utf8'), 'browser-second');
  } finally {
    if (server) {
      await new Promise((resolveClose, rejectClose) => {
        server.close((error) => (error ? rejectClose(error) : resolveClose()));
        server.closeAllConnections?.();
      });
    }
    delete process.env.DIST_DATA_DIR;
    delete process.env.TS_NODE_PROJECT;
    rmSync(authorityRoot, { recursive: true, force: true });
    rmSync(firstArtifact, { recursive: true, force: true });
    rmSync(secondArtifact, { recursive: true, force: true });
  }
});
