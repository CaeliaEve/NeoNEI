import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readSource = (relativePath) => readFileSync(resolve(frontendRoot, relativePath), 'utf8');

const policySource = readSource('src/runtime/browserRuntimeArtifactPolicyCatalog.ts');
const browserClientSource = readSource('src/runtime/browserCatalogClient.ts');

test('browser runtime published artifacts are descriptor-owned', () => {
  assert.match(policySource, /type BrowserPublishedArtifactDescriptor/);
  assert.match(policySource, /validateArtifactDescriptors/);
  assert.match(policySource, /Duplicate browser published artifact descriptor/);
  assert.match(policySource, /browser-page-window/);
  assert.match(policySource, /home-bootstrap-window/);
  assert.match(policySource, /browser-search-pack/);
  assert.match(policySource, /browser-search-shard/);
  assert.match(policySource, /BROWSER_RUNTIME_ARTIFACT_POLICY_CATALOG/);
  assert.match(policySource, /compiled-browser-artifacts-fail-closed/);
});

test('browser catalog client consumes artifact policy instead of parsing published paths inline', () => {
  assert.match(browserClientSource, /from '\.\/browserRuntimeArtifactPolicyCatalog'/);
  assert.match(browserClientSource, /resolvePublishedBrowserPageWindowPath/);
  assert.match(browserClientSource, /resolvePublishedBrowserSearchPackPath/);
  assert.match(browserClientSource, /resolvePublishedBrowserSearchShardPath/);
  assert.doesNotMatch(browserClientSource, /resolvePublishedWindowPath/);
  assert.doesNotMatch(browserClientSource, /browserSearchShards\?\.find/);
  assert.doesNotMatch(browserClientSource, /publishBundle\?\.files\.browserSearchPack/);
});
