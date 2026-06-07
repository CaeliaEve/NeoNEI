#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const gate = args.includes('--gate');
const runtimeArgIndex = args.indexOf('--runtime-dir');
const runtimeDir = runtimeArgIndex >= 0 ? resolve(args[runtimeArgIndex + 1]) : resolve(repoRoot, '.tmp-runtime', 'native-gpu-runtime-compile-check');

function normalize(value) {
  return `${value ?? ''}`.trim().toLowerCase().replace(/\s+/g, '');
}

function readU32(buffer, offset) {
  return buffer.readUInt32LE(offset);
}

function readPackPayload(filePath, expectedSchema) {
  const buffer = readFileSync(filePath);
  const magic = buffer.subarray(0, 8).toString('utf8');
  const version = readU32(buffer, 8);
  const schemaLength = readU32(buffer, 12);
  const payloadLength = Number(buffer.readBigUInt64LE(16));
  const schemaStart = 24;
  const schemaEnd = schemaStart + schemaLength;
  const payloadStart = schemaEnd;
  const payloadEnd = payloadStart + payloadLength;
  if (magic !== 'NNEIBIN\0') throw new Error(`bad pack magic: ${magic}`);
  if (version !== 1) throw new Error(`bad pack version: ${version}`);
  const schema = buffer.subarray(schemaStart, schemaEnd).toString('utf8');
  if (schema !== expectedSchema) throw new Error(`bad schema: ${schema}`);
  if (payloadEnd !== buffer.length) throw new Error(`bad payload length: expected ${payloadEnd}, got ${buffer.length}`);
  return buffer.subarray(payloadStart, payloadEnd);
}

function readNullString(buffer, offset) {
  let end = offset;
  while (end < buffer.length && buffer[end] !== 0) end += 1;
  return buffer.subarray(offset, end).toString('utf8');
}

function parseCompactBrowser(payload) {
  const magic = payload.subarray(0, 8).toString('utf8');
  if (magic !== 'NEIBRW1\0') throw new Error(`bad compact browser magic: ${magic}`);
  const version = readU32(payload, 8);
  const itemCount = readU32(payload, 12);
  const stringCount = readU32(payload, 16);
  const rowStride = readU32(payload, 20);
  if (version !== 1) throw new Error(`bad compact browser version: ${version}`);
  if (rowStride !== 6) throw new Error(`bad compact browser row stride: ${rowStride}`);
  const offsetsStart = 24;
  const rowsStart = offsetsStart + stringCount * 4;
  const rowsBytes = itemCount * rowStride * 4;
  const stringTableStart = rowsStart + rowsBytes;
  if (stringTableStart > payload.length) throw new Error('compact browser table exceeds payload bounds');
  const stringTable = payload.subarray(stringTableStart);
  const strings = [];
  for (let i = 0; i < stringCount; i += 1) {
    const offset = readU32(payload, offsetsStart + i * 4);
    strings.push(readNullString(stringTable, offset));
  }
  const rows = [];
  for (let i = 0; i < itemCount; i += 1) {
    const offset = rowsStart + i * rowStride * 4;
    rows.push({
      itemIdRef: readU32(payload, offset),
      localizedNameRef: readU32(payload, offset + 4),
      modIdRef: readU32(payload, offset + 8),
      groupKeyRef: readU32(payload, offset + 12),
      browserOrder: readU32(payload, offset + 16),
      flags: readU32(payload, offset + 20),
    });
  }
  return { itemCount, stringCount, rowStride, strings, rows };
}


function parseCompactSearch(payload) {
  const magic = payload.subarray(0, 8).toString('utf8');
  if (magic !== 'NEISRC2\0') throw new Error(`bad compact search magic: ${magic}`);
  const version = readU32(payload, 8);
  const itemCount = readU32(payload, 12);
  const stringCount = readU32(payload, 16);
  const rowStride = readU32(payload, 20);
  if (version !== 1) throw new Error(`bad compact search version: ${version}`);
  if (rowStride !== 13) throw new Error(`bad compact search row stride: ${rowStride}`);
  const offsetsStart = 24;
  const rowsStart = offsetsStart + stringCount * 4;
  const rowsBytes = itemCount * rowStride * 4;
  const stringTableStart = rowsStart + rowsBytes;
  if (stringTableStart > payload.length) throw new Error('compact search table exceeds payload bounds');
  const stringTable = payload.subarray(stringTableStart);
  const strings = [];
  for (let i = 0; i < stringCount; i += 1) {
    const offset = readU32(payload, offsetsStart + i * 4);
    strings.push(readNullString(stringTable, offset));
  }
  const rows = [];
  for (let i = 0; i < itemCount; i += 1) {
    const offset = rowsStart + i * rowStride * 4;
    rows.push({
      itemIdRef: readU32(payload, offset),
      publicItemIdRef: readU32(payload, offset + 4),
      localizedNameRef: readU32(payload, offset + 8),
      modIdRef: readU32(payload, offset + 12),
      normalizedLocalizedNameRef: readU32(payload, offset + 16),
      normalizedInternalNameRef: readU32(payload, offset + 20),
      normalizedItemIdRef: readU32(payload, offset + 24),
      normalizedSearchTermsRef: readU32(payload, offset + 28),
      pinyinFullRef: readU32(payload, offset + 32),
      pinyinAcronymRef: readU32(payload, offset + 36),
      popularityScore: readU32(payload, offset + 40),
      searchRank: readU32(payload, offset + 44),
      browserIndex: readU32(payload, offset + 48),
    });
  }
  return { itemCount, stringCount, rowStride, strings, rows };
}

function projectSearch(searchPack, { query = '', modId = '' } = {}) {
  const q = normalize(query);
  const modFilter = `${modId ?? ''}`.trim().toLowerCase();
  const indices = [];
  for (let i = 0; i < searchPack.itemCount; i += 1) {
    const row = searchPack.rows[i];
    const mod = searchPack.strings[row.modIdRef] ?? '';
    if (modFilter && mod.toLowerCase() !== modFilter) continue;
    const haystack = [
      row.normalizedSearchTermsRef,
      row.normalizedLocalizedNameRef,
      row.normalizedInternalNameRef,
      row.normalizedItemIdRef,
      row.pinyinFullRef,
      row.pinyinAcronymRef,
      row.itemIdRef,
      row.publicItemIdRef,
      row.localizedNameRef,
    ].map((ref) => normalize(searchPack.strings[ref] ?? '')).join('|');
    if (q && !haystack.includes(q)) continue;
    indices.push(row.browserIndex);
  }
  return indices;
}

function measureSearchProjection(searchPack, query) {
  const samples = [];
  let hits = 0;
  for (let i = 0; i < 40; i += 1) {
    const startedAt = performance.now();
    hits = projectSearch(searchPack, { query }).length;
    samples.push(performance.now() - startedAt);
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const avgMs = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  const p95Ms = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0;
  return { query, hits, avgMs, p95Ms };
}

function project(pack, { query = '', modId = '' } = {}) {
  const q = normalize(query);
  const modFilter = `${modId ?? ''}`.trim().toLowerCase();
  const indices = [];
  for (let i = 0; i < pack.itemCount; i += 1) {
    const row = pack.rows[i];
    const itemId = pack.strings[row.itemIdRef] ?? '';
    const localizedName = pack.strings[row.localizedNameRef] ?? '';
    const mod = pack.strings[row.modIdRef] ?? '';
    const groupKey = pack.strings[row.groupKeyRef] ?? '';
    if (modFilter && mod.toLowerCase() !== modFilter) continue;
    if (q && !normalize(`${localizedName}|${itemId}|${mod}|${groupKey}`).includes(q)) continue;
    indices.push(i);
  }
  return indices;
}

function buildFixturePayload() {
  const strings = [
    'minecraft:iron_ingot', '铁锭', 'minecraft', '',
    'gregtech:gt.metaitem.01:32000', 'UIV 超导粗胚锭', 'gregtech', 'gt-superconductor',
    'appliedenergistics2:item.ItemMultiMaterial:47', '奇点', 'appliedenergistics2', 'ae2-singularity',
  ];
  const stringBytes = [];
  const offsets = [];
  let cursor = 0;
  for (const value of strings) {
    const bytes = Buffer.from(`${value}\0`, 'utf8');
    offsets.push(cursor);
    stringBytes.push(bytes);
    cursor += bytes.length;
  }
  const rows = [
    [0, 1, 2, 3, 0, 0],
    [4, 5, 6, 7, 1, 1],
    [8, 9, 10, 11, 2, 1],
  ];
  const header = Buffer.alloc(24);
  header.write('NEIBRW1\0', 0, 8, 'utf8');
  header.writeUInt32LE(1, 8);
  header.writeUInt32LE(rows.length, 12);
  header.writeUInt32LE(strings.length, 16);
  header.writeUInt32LE(6, 20);
  const offsetTable = Buffer.alloc(strings.length * 4);
  offsets.forEach((offset, i) => offsetTable.writeUInt32LE(offset, i * 4));
  const rowTable = Buffer.alloc(rows.length * 6 * 4);
  rows.forEach((row, rowIndex) => row.forEach((value, column) => rowTable.writeUInt32LE(value, (rowIndex * 6 + column) * 4)));
  return Buffer.concat([header, offsetTable, rowTable, ...stringBytes]);
}


function buildFixtureSearchPayload() {
  const strings = [
    'minecraft:iron_ingot', 'item:minecraft:iron_ingot', 'iron ingot', 'minecraft',
    'ironingot', 'minecraftiron_ingot', 'minecraftiron_ingot', 'iron ingot minecraft', 'tieding', 'td',
    'gregtech:gt.metaitem.01:32000', 'item:gregtech:gt.metaitem.01:32000', 'superconductor', 'gregtech',
    'superconductor', 'gtmetaitem0132000', 'gregtechgtmetaitem0132000', 'superconductor gregtech', 'chaodao', 'cd',
    'appliedenergistics2:item.ItemMultiMaterial:47', 'item:appliedenergistics2:item.ItemMultiMaterial:47', 'singularity', 'appliedenergistics2',
    'singularity', 'itemmultimaterial47', 'appliedenergistics2itemitemmultimaterial47', 'singularity ae2', 'qidian', 'qd',
  ];
  const stringBytes = [];
  const offsets = [];
  let cursor = 0;
  for (const value of strings) {
    const bytes = Buffer.from(`${value}\0`, 'utf8');
    offsets.push(cursor);
    stringBytes.push(bytes);
    cursor += bytes.length;
  }
  const rows = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 0, 0],
    [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 8, 1, 1],
    [20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 6, 2, 2],
  ];
  const header = Buffer.alloc(24);
  header.write('NEISRC2\0', 0, 8, 'utf8');
  header.writeUInt32LE(1, 8);
  header.writeUInt32LE(rows.length, 12);
  header.writeUInt32LE(strings.length, 16);
  header.writeUInt32LE(13, 20);
  const offsetTable = Buffer.alloc(strings.length * 4);
  offsets.forEach((offset, i) => offsetTable.writeUInt32LE(offset, i * 4));
  const rowTable = Buffer.alloc(rows.length * 13 * 4);
  rows.forEach((row, rowIndex) => row.forEach((value, column) => rowTable.writeUInt32LE(value, (rowIndex * 13 + column) * 4)));
  return Buffer.concat([header, offsetTable, rowTable, ...stringBytes]);
}

function writeBinaryPack(filePath, schema, payload) {
  mkdirSync(dirname(filePath), { recursive: true });
  const schemaBytes = Buffer.from(schema, 'utf8');
  const header = Buffer.alloc(24);
  header.write('NNEIBIN\0', 0, 8, 'utf8');
  header.writeUInt32LE(1, 8);
  header.writeUInt32LE(schemaBytes.length, 12);
  header.writeBigUInt64LE(BigInt(payload.length), 16);
  writeFileSync(filePath, Buffer.concat([header, schemaBytes, payload]));
}


function hasPackPayloadMagic(filePath, schema, payloadMagic) {
  try {
    const payload = readPackPayload(filePath, schema);
    return payload.subarray(0, 8).toString('utf8') === payloadMagic;
  } catch {
    return false;
  }
}

function findBrowserPack() {
  const candidates = [
    join(runtimeDir, 'rust', 'browser.bin'),
    join(runtimeDir, 'browser.bin'),
    join(repoRoot, 'frontend', 'public', 'dist-data', 'runtime', 'browser.bin'),
    join(repoRoot, 'frontend', 'public', 'dist-data', 'rust', 'browser.bin'),
  ];
  return candidates.find((candidate) => existsSync(candidate));
}


function findSearchPack() {
  const candidates = [
    join(runtimeDir, 'rust', 'search.bin'),
    join(runtimeDir, 'search.bin'),
    join(repoRoot, 'frontend', 'public', 'dist-data', 'runtime', 'search.bin'),
    join(repoRoot, 'frontend', 'public', 'dist-data', 'rust', 'search.bin'),
  ];
  return candidates.find((candidate) => existsSync(candidate) && hasPackPayloadMagic(candidate, 'neonei/search-pack/current', 'NEISRC2\0'));
}

function validatePack(pack, source) {
  const failures = [];
  if (pack.itemCount <= 0) failures.push('browser projection pack is empty');
  const all = project(pack);
  if (all.length !== pack.itemCount) failures.push(`unfiltered projection length mismatch: ${all.length} != ${pack.itemCount}`);
  const first = pack.rows[0];
  const firstName = pack.strings[first.localizedNameRef] ?? '';
  const firstMod = pack.strings[first.modIdRef] ?? '';
  if (firstName) {
    const token = [...firstName].slice(0, Math.min(2, [...firstName].length)).join('');
    const filtered = project(pack, { query: token });
    if (!filtered.includes(0)) failures.push(`query projection did not include first item for token ${token}`);
  }
  if (firstMod) {
    const filtered = project(pack, { modId: firstMod });
    if (!filtered.includes(0)) failures.push(`mod projection did not include first item for mod ${firstMod}`);
    const bad = filtered.find((index) => (pack.strings[pack.rows[index].modIdRef] ?? '').toLowerCase() !== firstMod.toLowerCase());
    if (bad !== undefined) failures.push(`mod projection leaked non-matching row ${bad}`);
  }
  const fixtureNeedle = project(pack, { query: '超导' });
  const isFixture = source === 'fixture';
  if (isFixture && fixtureNeedle.length !== 1) failures.push(`fixture query projection expected 1 超导 row, got ${fixtureNeedle.length}`);
  return failures;
}

let tempRoot = null;
try {
  let browserPackPath = findBrowserPack();
  let searchPackPath = findSearchPack();
  let source = 'runtime';
  if (!browserPackPath || !searchPackPath) {
    tempRoot = mkdtempSync(join(tmpdir(), 'neonei-native-projection-'));
    browserPackPath = join(tempRoot, 'browser.bin');
    searchPackPath = join(tempRoot, 'search.bin');
    writeBinaryPack(browserPackPath, 'neonei/browser-pack/current', buildFixturePayload());
    writeBinaryPack(searchPackPath, 'neonei/search-pack/current', buildFixtureSearchPayload());
    source = 'fixture';
  }
  const payload = readPackPayload(browserPackPath, 'neonei/browser-pack/current');
  const pack = parseCompactBrowser(payload);
  const searchPayload = readPackPayload(searchPackPath, 'neonei/search-pack/current');
  const searchPack = parseCompactSearch(searchPayload);
  const failures = validatePack(pack, source);
  if (searchPack.itemCount !== pack.itemCount) failures.push(`search item count mismatch: ${searchPack.itemCount} != ${pack.itemCount}`);
  const badBrowserIndex = searchPack.rows.find((row) => row.browserIndex >= pack.itemCount);
  if (badBrowserIndex) failures.push(`search browserIndex out of bounds: ${badBrowserIndex.browserIndex} >= ${pack.itemCount}`);
  const searchQuery = source === 'fixture' ? 'singularity' : (pack.strings[pack.rows[0]?.localizedNameRef] ?? '').slice(0, 2);
  const searchMetrics = measureSearchProjection(searchPack, searchQuery);
  if (searchMetrics.hits <= 0) failures.push(`search query produced no hits: ${searchQuery}`);
  if (searchMetrics.p95Ms > 80) failures.push(`search projection p95 too slow: ${searchMetrics.p95Ms.toFixed(3)}ms > 80ms`);
  const report = {
    schemaVersion: 'neonei/native-runtime-projection-gate/current',
    generatedAt: new Date().toISOString(),
    source,
    browserPackPath,
    searchPackPath,
    itemCount: pack.itemCount,
    stringCount: pack.stringCount,
    searchItemCount: searchPack.itemCount,
    searchMetrics,
    failures,
  };
  console.log(JSON.stringify(report, null, 2));
  if (gate && failures.length > 0) process.exit(1);
} finally {
  if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
}
