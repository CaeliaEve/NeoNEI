import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

const payloadSource = fs.readFileSync(
  'src/services/publish-payload.service.ts',
  'utf8',
).replace(/\r\n/g, '\n');

const materializerSource = fs.readFileSync(
  'src/services/publish-payload-materializer.service.ts',
  'utf8',
).replace(/\r\n/g, '\n');

test('browser page payloads carry precomputed resource manifests', () => {
  assert.equal(
    payloadSource.includes('export interface BrowserPageResourceManifest'),
    true,
    'browser page payload should expose the resource manifest contract',
  );
  assert.equal(
    payloadSource.includes('resourceManifest?: BrowserPageResourceManifest;'),
    true,
    'browser page window payload should carry resourceManifest',
  );
  assert.equal(
    payloadSource.includes('export function buildBrowserPageResourceManifest'),
    true,
    'browser page resource manifest should be built centrally',
  );
  assert.equal(
    payloadSource.includes('resourceManifest: buildBrowserPageResourceManifest(data, mediaManifest),'),
    true,
    'derived page slices should trim resource manifests to the active page',
  );
});

test('publish materializer and live route write resource manifests', () => {
  assert.equal(
    materializerSource.includes('buildBrowserPageResourceManifest(firstPageWindow.data, firstPageMediaManifest)'),
    true,
    'first publish browser window should carry resource dependencies',
  );
  assert.equal(
    materializerSource.includes('buildBrowserPageResourceManifest(extraWindow.data, extraMediaManifest)'),
    true,
    'extra publish browser windows should carry resource dependencies',
  );
  assert.equal(
    fs.existsSync('src/routes/items.routes.ts'),
    false,
    'resource manifests must be owned by publish/runtime services, not a retired lab item route',
  );
});
