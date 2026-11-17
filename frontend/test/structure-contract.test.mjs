import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { encode } from '@msgpack/msgpack';
import { decodeTable } from '@elysium/contracts';
import { StructureReferenceQuery } from '../../catalog/src/structure-references.ts';

test('actual Java construction-only geometry crosses the strict released table contract', async () => {
  const fixture = JSON.parse(await readFile(new URL('../../../elysium-compiler/contracts/fixtures/compat-structure-contract.json', import.meta.url), 'utf8'));
  const rows = fixture.records.filter(row => row.kind === 'structures').map(row => row.value);
  assert.equal(decodeTable(encode({kind: 'structures', records: rows}), 'structures').records[0].definitionKind, 'construction');
  assert.equal(rows[0].pieces.length, 0);
  const invalid = structuredClone(rows);
  invalid[0].definitionKind = 'guessed';
  assert.throws(() => decodeTable(encode({kind: 'structures', records: invalid}), 'structures'), /Invalid table/);
});

test('GT construction-only records retain a distinct definition kind across table decoding', async () => {
  const fixture = JSON.parse(await readFile(new URL('../../../elysium-compiler/contracts/fixtures/compat-structure-contract.json', import.meta.url), 'utf8'));
  const row = structuredClone(fixture.records.find(row => row.kind === 'structures').value);
  row.definitionKind = 'gtconstruction';
  row.source = {owner:'gregtech',handler:'gregtech.common.tileentities.machines.multi.MTECleanroom',key:'1172'};
  const decoded = decodeTable(encode({kind:'structures',records:[row]}), 'structures').records[0];
  assert.equal(decoded.definitionKind, 'gtconstruction');
  assert.equal(decoded.source.key, '1172');
  assert.deepEqual(decoded.pieces, []);
});

test('native enchanter snapshot retains its explicit display completion and actual block geometry', async () => {
  const fixture = JSON.parse(await readFile(new URL('../../../elysium-compiler/contracts/fixtures/botania-enchanter-structure-contract.json', import.meta.url), 'utf8'));
  for (const kind of ['blocks','builds','shapes']) {
    const records = fixture.records.filter(row => row.kind === kind).map(row => row.value);
    assert.deepEqual(decodeTable(encode({kind,records}), kind), {kind,records});
  }
  const build = fixture.records.find(row => row.kind === 'builds').value;
  assert.equal(build.completion, 'nativeDisplayBeforeControllerTick');
  assert.equal(build.cells, 44);
  assert.equal(build.facing, 'north');
  assert.equal(build.rendered, false);
});

test('native structure information preserves unresolved lookup and hydrates only the requested page', async () => {
  const fixture = JSON.parse(await readFile(new URL('../../../elysium-compiler/contracts/fixtures/structure-reference-contract.json', import.meta.url), 'utf8'));
  decodeTable(encode({kind:'references',records:fixture.records}), 'references');
  const structure = fixture.records[1].data.structure;
  const source = { async *scan(kind) { assert.equal(kind,'references'); yield* fixture.records; } };
  const query = new StructureReferenceQuery(source);
  const information = await query.information(structure);
  assert.equal(information.controller.data.maxTier,3);
  assert.equal(information.controller.data.channels.coil,3);
  assert.deepEqual(information.controller.data.tierItems.map(tier=>[tier.tier,tier.channels]),
    [[2,['glass','coil','not-scanned']],[-2,[]]]);
  assert.equal(information.controller.data.hasData,true);
  assert.deepEqual(information.controller.data.channelDefinitions.bounded,
    {kind:'bounded',minimum:2,maximum:9,validation:'inclusiveBounds',normalization:'clampToBounds'});
  assert.equal(information.controller.data.channels.opaque,-7);
  assert.equal(information.controller.data.channelDefinitions.validator.validation,'opaqueCustom');
  assert.equal(information.controller.data.channelDefinitions.normalizer.normalization,'opaqueCustom');
  const first = await query.page(structure,0,1);
  assert.equal(first.total,2);
  assert.equal(first.rows[0].data.items.length,1);
  const second = await query.page(structure,1,1);
  assert.equal(second.rows[0].data.items.length,0);
  assert.equal(information.definition.data.counts.unresolvedLookups,1);
  const bad = structuredClone(fixture.records);
  bad[2].data.structures = ['structure_wrong'];
  await assert.rejects(new StructureReferenceQuery({ async *scan() { yield* bad; } }).information(structure));
});
