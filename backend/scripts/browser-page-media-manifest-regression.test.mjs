import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

const publishDeliverySource = fs.readFileSync(
  'src/services/publish-runtime-delivery.service.ts',
  'utf8',
).replace(/\r\n/g, '\n');

const materializerSource = fs.readFileSync(
  'src/services/publish-payload-materializer.service.ts',
  'utf8',
).replace(/\r\n/g, '\n');

test('browser page payloads include a rich-media manifest for animated atlas fast paths', () => {
  assert.equal(
    fs.existsSync('src/routes/items.routes.ts'),
    false,
    'retired lab item route must not remain as a hidden browser page-pack compatibility path',
  );
  assert.equal(
    publishDeliverySource.includes('mediaManifest: buildBrowserRichMediaManifest(displayItems)'),
    true,
    'home bootstrap fallback should include a page-level rich-media manifest',
  );
  assert.equal(
    materializerSource.includes('mediaManifest: firstPageMediaManifest'),
    true,
    'materialized hot page payloads should serialize their rich-media manifest',
  );
  assert.equal(
    materializerSource.includes('mediaManifest: extraMediaManifest'),
    true,
    'materialized follow-up windows should serialize their rich-media manifest',
  );
  assert.equal(
    materializerSource.includes('buildBrowserRichMediaManifest(displayItems)'),
    true,
    'browser publish payloads should keep rich-media manifest generation in services, not lab routes',
  );
});
