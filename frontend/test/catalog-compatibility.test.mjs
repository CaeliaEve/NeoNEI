import assert from 'node:assert/strict';
import test from 'node:test';
import { encode } from '@msgpack/msgpack';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { canonical, formats } from '@elysium/contracts';
import { Catalog, checkManifest, hash } from '../../catalog/src/store.ts';
import { assertCatalogPointer, supportedCatalogRevision, decodeCatalogTable, catalogCollections } from '../../catalog/src/compatibility.ts';

test('the current reader validates in a fresh process without compiling schemas at runtime', () => {
  const require = createRequire(new URL('../../catalog/package.json', import.meta.url));
  const paths = [require.resolve('@elysium/contracts')];
  const result = spawnSync(process.execPath, ['-e', `
    const assert = require('node:assert/strict'), Module = require('node:module');
    const original = Module._load;
    Module._load = function(name, ...args) {
      if (name === 'ajv') throw Error('Runtime schema compilation is forbidden');
      return original.call(this, name, ...args);
    };
    for (const file of process.argv.slice(1)) {
      const reader = require(file);
      reader.assertTable({kind:'strings', records:[{id:'text_example', locale:'en_US', text:'Example'}]});
      assert.throws(() => reader.assertTable({kind:'strings', records:[{id:'text_example', locale:'en_US', text:'Example', foreign:true}]}));
    }
  `, ...paths], {encoding:'utf8', timeout:10000});
  assert.equal(result.status, 0, result.stderr || String(result.error));
});
async function manifest(revision = formats.catalog.revision) {
  const kinds = catalogCollections(formats.catalog.revision);
  const content = {
    format: 'elysium.catalog', revision, compiler: 'fixture', source: 'a'.repeat(64), environment: 'b'.repeat(64), scope: 'selection',
    ...(revision >= 40 ? {locale:'en_US'} : {}),
    counts: Object.fromEntries(kinds.map(kind => [kind, 0])),
    files: kinds.map(kind => ({kind, path: `tables/${kind}/part-000000.msgpack`, bytes: 1, encoding: 'msgpack', rows: 0,
      first: null, last: null, sha256: 'c'.repeat(64)})),
  };
  return { ...content, id: await hash(canonical(content)) };
}

test('retired revisions require a current download or archived viewer at every reading boundary', async () => {
  const bytes = encode({kind: 'strings', records: [{id:'text_example', locale:'en_US', text:'Example'}]});
  assert.equal(decodeCatalogTable(bytes, 'strings', formats.catalog.revision).records[0].text, 'Example');
  for (const revision of [36, 38, 39, 40]) {
    assert.equal(supportedCatalogRevision(revision), false);
    const value = await manifest(revision);
    await assert.rejects(checkManifest(value), /Unsupported Catalog revision.*(?:download|viewer)/i);
    assert.throws(() => assertCatalogPointer({format: 'elysium.catalog-pointer', revision, id: value.id}), /Unsupported Catalog revision/i);
    assert.throws(() => catalogCollections(revision), /Unsupported Catalog revision/i);
    assert.throws(() => decodeCatalogTable(bytes, 'strings', revision), /Unsupported Catalog revision/i);
  }
});
test('rejecting an archived Catalog does not rewrite its manifest or read its files', async () => {
  const root = new URL('../../fixtures/catalog/catalogs/2c97db17845fe7609fc4427918469fb758b0547523fb45997549d458075f2023/', import.meta.url);
  const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));
  const original = JSON.stringify(manifest);
  await assert.rejects(Catalog.open(manifest, async () => { throw new Error('Archived files must not be read'); }),
    /Unsupported Catalog revision/i);
  assert.equal(JSON.stringify(manifest), original);
});

test('current Catalog remains strict about required tables, revision and content identity', async () => {
  const value = await manifest(formats.catalog.revision);
  await checkManifest(value);
  assert.equal(supportedCatalogRevision(36), false);
  assert.equal(supportedCatalogRevision(formats.catalog.revision), true);
  assert.equal(supportedCatalogRevision(999), false);
  await assert.rejects(checkManifest({...value, id: 'd'.repeat(64)}), /digest mismatch/);
  const missing = structuredClone(value);
  missing.files = missing.files.filter(file => file.kind !== 'references');
  delete missing.counts.references;
  const { id, ...content } = missing;
  missing.id = await hash(canonical(content));
  await assert.rejects(checkManifest(missing), /counts/);
  assert.throws(() => assertCatalogPointer({format: 'elysium.catalog-pointer', revision: 999, id: value.id}));
});

test('a rehashed foreign-language table cannot be displayed in a single-language Catalog',async()=>{
  const value=structuredClone(await manifest(formats.catalog.revision));
  const bytes=encode({kind:'strings',records:[{id:'text_foreign',locale:'zh_CN',text:'不同语言'}]});
  const file=value.files.find(file=>file.kind==='strings');
  Object.assign(file,{bytes:bytes.length,sha256:await hash(bytes),rows:1,first:'text_foreign',last:'text_foreign'});
  value.counts.strings=1;const {id,...content}=value;value.id=await hash(canonical(content));
  const catalog=await Catalog.open(value,async()=>bytes);
  await assert.rejects(catalog.all('strings'),/locale/);
});
