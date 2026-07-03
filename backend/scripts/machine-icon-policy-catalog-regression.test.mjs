import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, '..');
const source = fs.readFileSync(
  path.join(backendRoot, 'src/services/machine-icon-mapping.service.ts'),
  'utf8',
);

test('backend GT machine icon policy uses explicit default metadata descriptors', () => {
  assert.match(source, /defaultMetaId: number/);
  assert.match(source, /return family\.defaultMetaId/);
  assert.doesNotMatch(source, /\bfallback\s*:/);
  assert.doesNotMatch(source, /family\.fallback/);
});

test('backend GT machine icon policy remains descriptor-table owned', () => {
  const familyTableIndex = source.indexOf('const GT_FAMILY_MAP: TieredGtFamily[] = [');
  const resolverIndex = source.indexOf('function resolveGtMeta(machineType: string): number | null');

  assert.ok(familyTableIndex > 0, 'GT family policy table must exist');
  assert.ok(resolverIndex > familyTableIndex, 'resolver must consume descriptor table instead of inline switch policy');
  assert.doesNotMatch(source.slice(resolverIndex), /switch\s*\(/);
});
