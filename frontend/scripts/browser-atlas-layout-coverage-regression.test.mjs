import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const readRepoFile = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

const backendAtlasSource = readRepoFile('backend/src/services/browser-atlas-index.service.ts');
const frontendApiSource = readRepoFile('frontend/src/services/api.ts');
const frontendRuntimeTypesSource = readRepoFile('frontend/src/runtime/types.ts');

test('browser atlas index reports layout coverage against the exported NEI layout', () => {
  assert.match(
    backendAtlasSource,
    /CURRENT_RUNTIME_ARTIFACT_PATHS\.browserLayoutIndex/,
    'backend atlas index should resolve the browser layout from the current sealed generation',
  );
  assert.match(
    backendAtlasSource,
    /interface BrowserAtlasLayoutCoverage/,
    'backend atlas index should expose a typed layout coverage summary',
  );
  assert.match(
    backendAtlasSource,
    /computeLayoutCoverage\([\s\S]*itemMap:\s*Map<string,\s*BrowserAtlasItemEntry>,[\s\S]*layoutFilePath:\s*string/,
    'backend should compute atlas coverage from the full item map including aliases and auxiliary entries',
  );
  assert.match(
    backendAtlasSource,
    /missingLayoutItemCount:\s*layoutItemIds\.size - coveredLayoutItemCount/,
    'coverage should count layout-visible items that still lack a drawable atlas entry',
  );
  assert.match(
    backendAtlasSource,
    /missingLayoutItemIds\.length < 100/,
    'coverage should include a bounded sample of missing item ids for export repair',
  );
});

test('browser atlas index keeps render asset identity for animated item lookup', () => {
  assert.match(
    backendAtlasSource,
    /assetId: entry\.assetId \?\? null/,
    'backend compact atlas entries should preserve assetId for renderAssetRef lookups',
  );
  assert.match(
    backendAtlasSource,
    /mode: entry\.mode \?\? null/,
    'backend compact atlas entries should preserve render mode diagnostics',
  );
  assert.match(
    backendAtlasSource,
    /private itemIdFromRenderAssetRef\(renderAssetRef: string\): string/,
    'backend should resolve page-scoped atlas requests by nesqlpp:item/* render asset refs',
  );
  assert.match(
    backendAtlasSource,
    /normalized\.startsWith\('nesqlpp:item\/'\)/,
    'auxiliary atlas entries should include item animation assets, not only fluids',
  );
  assert.match(
    backendAtlasSource,
    /shouldPreferAuxiliaryAnimatedEntry\(existing\)/,
    'auxiliary animated entries may fill static gaps but must not blindly override primary render-index entries',
  );
  assert.match(
    backendAtlasSource,
    /existing\.mode === 'rendered_frames' \|\| existing\.resolutionMode === 'animated_frame_sequence'/,
    'rendered framebuffer animations should win over native sprite auxiliary entries',
  );
});

test('frontend atlas manifest type accepts layout coverage counters', () => {
  assert.match(
    frontendApiSource,
    /BrowserAtlasIndexResponse/,
    'frontend API barrel should continue re-exporting browser atlas response types',
  );
  assert.match(
    frontendRuntimeTypesSource,
    /layoutCoverage\?:\s*\{/,
    'frontend should accept browser atlas layout coverage in the atlas index response',
  );
  assert.match(
    frontendRuntimeTypesSource,
    /missingLayoutItemCount:\s*number/,
    'frontend should understand the missing layout item count',
  );
});
