import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const sourcePath = path.resolve('E:/codex/ae2/NeoNEI/frontend/src/components/GTAssemblyLineUI.vue');
const source = fs.readFileSync(sourcePath, 'utf8');

test('assembly line UI keeps the new three-zone structure', () => {
  assert.match(source, /class="al-stage"/);
  assert.match(source, /class="input-matrix"/);
  assert.match(source, /class="fluid-column"/);
  assert.match(source, /class="output-chamber"/);
  assert.match(source, /class="bottom-bar"/);
});

test('assembly line UI encodes fixed 4x4 input, 1x4 fluid, and single output contract', () => {
  assert.match(source, /repeat\(4,\s*var\(--al-slot-size\)\)/);
  assert.match(source, /v-for="slotIndex in 16"/);
  assert.match(source, /v-for="tankIndex in 4"/);
  assert.match(source, /class="output-slot-main"/);
});

test('assembly line UI uses the approved plasma rift conduit core', () => {
  assert.match(source, /class="rift-spindle"/);
  assert.match(source, /class="rift-core"/);
  assert.match(source, /class="rift-shard rift-shard-left-a"/);
  assert.match(source, /class="rift-shard rift-shard-right-a"/);
  assert.match(source, /class="rift-aura"/);
  assert.match(source, /class="rift-particle rift-particle-a"/);
  assert.doesNotMatch(source, /class="relay-lattice"/);
  assert.doesNotMatch(source, /class="relay-node relay-node-center"/);
});

test('assembly line UI preserves click emission flow', () => {
  assert.match(source, /emit\('item-click', itemId\)/);
  assert.match(source, /playClick\(\)/);
});
