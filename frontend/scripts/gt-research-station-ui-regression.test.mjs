import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const sourcePath = path.resolve('E:/codex/ae2/NeoNEI/frontend/src/components/GTResearchStationUI.vue');
const source = fs.readFileSync(sourcePath, 'utf8');

test('research station UI uses the approved scan chamber layout markers', () => {
  assert.match(source, /class="metrics-strip"/);
  assert.match(source, /class="scan-stage"/);
  assert.match(source, /class="chamber chamber-input"/);
  assert.match(source, /class="scan-core"/);
  assert.match(source, /class="chamber chamber-output"/);
});

test('research station UI exposes research metric labels', () => {
  assert.match(source, /label:\s*'最多消耗'/);
  assert.match(source, /label:\s*'消耗功率'/);
  assert.match(source, /label:\s*'算力'/);
  assert.match(source, /label:\s*'最小算力输入'/);
});

test('research station UI preserves item click emission and fallback marker', () => {
  assert.match(source, /emit\('item-click', itemId\)/);
  assert.match(source, /: '--'/);
});
