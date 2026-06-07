import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const gate = args.includes('--gate');
const selfTest = args.includes('--self-test');

function readArg(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function fail(failures, code, message, details = {}) {
  failures.push({ code, message, details });
}

function warn(warnings, code, message, details = {}) {
  warnings.push({ code, message, details });
}

function isPortableRelativePath(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  if (isAbsolute(value)) return false;
  if (/^[A-Za-z]:[\\/]/.test(value)) return false;
  if (value.includes('\\')) return false;
  if (value.split('/').some((part) => part === '..')) return false;
  return true;
}

function containsWindowsAbsolutePath(value) {
  if (typeof value === 'string') return /[A-Za-z]:[\\/]/.test(value) || value.includes('\\Users\\') || value.includes('\\GTNH\\');
  if (Array.isArray(value)) return value.some(containsWindowsAbsolutePath);
  if (value && typeof value === 'object') return Object.values(value).some(containsWindowsAbsolutePath);
  return false;
}

function decodeU32LE(buffer, offset) {
  return buffer.readUInt32LE(offset);
}

function decodeU64LE(buffer, offset) {
  return buffer.readBigUInt64LE(offset);
}

function validateBinaryPack({ filePath, expectedSchema, logicalName }, failures, warnings) {
  if (!existsSync(filePath)) {
    fail(failures, 'NATIVE_PACK_FILE_MISSING', `native runtime pack is missing: ${logicalName}`, { logicalName, filePath });
    return null;
  }
  const buffer = readFileSync(filePath);
  const minHeaderBytes = 8 + 4 + 4 + 8;
  if (buffer.length < minHeaderBytes) {
    fail(failures, 'NATIVE_PACK_TOO_SMALL', `native runtime pack is too small: ${logicalName}`, { logicalName, bytes: buffer.length });
    return null;
  }

  const magic = buffer.subarray(0, 8).toString('utf8');
  const version = decodeU32LE(buffer, 8);
  const schemaLength = decodeU32LE(buffer, 12);
  const payloadLength = decodeU64LE(buffer, 16);
  const schemaStart = 24;
  const schemaEnd = schemaStart + schemaLength;
  const payloadStart = schemaEnd;
  const payloadEnd = payloadStart + Number(payloadLength);

  if (magic !== 'NNEIBIN\0') {
    fail(failures, 'NATIVE_PACK_BAD_MAGIC', `native runtime pack has invalid magic: ${logicalName}`, { logicalName, magic });
  }
  if (version !== 1) {
    fail(failures, 'NATIVE_PACK_BAD_VERSION', `native runtime pack has invalid version: ${logicalName}`, { logicalName, version });
  }
  if (schemaEnd > buffer.length) {
    fail(failures, 'NATIVE_PACK_BAD_SCHEMA_LENGTH', `native runtime pack schema length exceeds file size: ${logicalName}`, { logicalName, schemaLength, bytes: buffer.length });
    return null;
  }
  if (payloadEnd !== buffer.length) {
    fail(failures, 'NATIVE_PACK_BAD_PAYLOAD_LENGTH', `native runtime pack payload length does not match file size: ${logicalName}`, {
      logicalName,
      payloadLength: payloadLength.toString(),
      expectedBytes: payloadEnd,
      actualBytes: buffer.length,
    });
  }

  const schema = buffer.subarray(schemaStart, schemaEnd).toString('utf8');
  if (schema !== expectedSchema) {
    fail(failures, 'NATIVE_PACK_BAD_SCHEMA', `native runtime pack schema mismatch: ${logicalName}`, { logicalName, schema, expectedSchema });
  }

  const payloadBytes = buffer.subarray(payloadStart, Math.min(payloadEnd, buffer.length));
  try {
    const payloadText = payloadBytes.toString('utf8');
    if (payloadText.trim()) {
      const payload = JSON.parse(payloadText);
      if (containsWindowsAbsolutePath(payload)) {
        fail(failures, 'NATIVE_PACK_WINDOWS_PATH_LEAK', `native runtime pack payload contains a Windows absolute path: ${logicalName}`, { logicalName });
      }
      return { bytes: buffer.length, schema, payloadBytes: payloadBytes.length, payload };
    }
  } catch (error) {
    if (logicalName === 'browser' && validateCompactBrowserPayload(payloadBytes, failures, logicalName)) {
      return { bytes: buffer.length, schema, payloadBytes: payloadBytes.length, payload: { encoding: 'compact-browser-table' } };
    }
    if (logicalName === 'groups' && validateCompactGroupPayload(payloadBytes, failures, logicalName)) {
      return { bytes: buffer.length, schema, payloadBytes: payloadBytes.length, payload: { encoding: 'compact-group-table' } };
    }
    if (logicalName === 'search' && validateCompactSearchPayload(payloadBytes, failures, logicalName)) {
      return { bytes: buffer.length, schema, payloadBytes: payloadBytes.length, payload: { encoding: 'compact-search-table' } };
    }
    if (logicalName === 'recipes' && validateCompactRecipePayload(payloadBytes, failures, logicalName)) {
      return { bytes: buffer.length, schema, payloadBytes: payloadBytes.length, payload: { encoding: 'compact-recipe-index-table' } };
    }
    if (logicalName === 'stringsZhCn' && validateCompactStringPayload(payloadBytes, failures, logicalName)) {
      return { bytes: buffer.length, schema, payloadBytes: payloadBytes.length, payload: { encoding: 'compact-string-table' } };
    }
    if (logicalName === 'textures' && validateCompactTexturePayload(payloadBytes, failures, logicalName)) {
      return { bytes: buffer.length, schema, payloadBytes: payloadBytes.length, payload: { encoding: 'compact-texture-table' } };
    }
    if (logicalName === 'atlasMeta' && validateCompactAtlasMetaPayload(payloadBytes, failures, logicalName)) {
      return { bytes: buffer.length, schema, payloadBytes: payloadBytes.length, payload: { encoding: 'compact-atlas-meta-table' } };
    }
    if (logicalName === 'animations' && validateCompactAnimationPayload(payloadBytes, failures, logicalName)) {
      return { bytes: buffer.length, schema, payloadBytes: payloadBytes.length, payload: { encoding: 'compact-animation-table' } };
    }
    warn(warnings, 'NATIVE_PACK_PAYLOAD_NOT_JSON', `native runtime pack payload is not JSON-decodable yet: ${logicalName}`, { logicalName, message: error.message });
  }
  return { bytes: buffer.length, schema, payloadBytes: payloadBytes.length, payload: null };
}

function validateCompactGroupPayload(payloadBytes, failures, logicalName) {
  const compactHeaderBytes = 8 + 5 * 4;
  if (payloadBytes.length < compactHeaderBytes) return false;
  const magic = payloadBytes.subarray(0, 8).toString('utf8');
  if (magic !== 'NEIGRP1\0') return false;
  const version = payloadBytes.readUInt32LE(8);
  const groupCount = payloadBytes.readUInt32LE(12);
  const stringCount = payloadBytes.readUInt32LE(16);
  const memberCount = payloadBytes.readUInt32LE(20);
  const rowStride = payloadBytes.readUInt32LE(24);
  const offsetsBytes = stringCount * 4;
  const rowsBytes = groupCount * rowStride * 4;
  const membersBytes = memberCount * 4;
  const stringTableStart = compactHeaderBytes + offsetsBytes + rowsBytes + membersBytes;
  if (version !== 1) {
    fail(failures, 'NATIVE_GROUP_PACK_BAD_COMPACT_VERSION', 'compact group pack has an invalid version', { logicalName, version });
  }
  if (rowStride !== 6) {
    fail(failures, 'NATIVE_GROUP_PACK_BAD_ROW_STRIDE', 'compact group pack has an invalid row stride', { logicalName, rowStride });
  }
  if (stringCount <= 0) {
    fail(failures, 'NATIVE_GROUP_PACK_EMPTY_STRING_TABLE', 'compact group pack has no strings', { logicalName, groupCount, stringCount });
  }
  if (stringTableStart > payloadBytes.length) {
    fail(failures, 'NATIVE_GROUP_PACK_COMPACT_BOUNDS', 'compact group pack table exceeds payload bounds', {
      logicalName,
      groupCount,
      stringCount,
      memberCount,
      rowStride,
      payloadBytes: payloadBytes.length,
      stringTableStart,
    });
  }
  return true;
}
function validateCompactSearchPayload(payloadBytes, failures, logicalName) {
  const compactHeaderBytes = 8 + 4 * 4;
  if (payloadBytes.length < compactHeaderBytes) return false;
  const magic = payloadBytes.subarray(0, 8).toString('utf8');
  if (magic !== 'NEISRC2\0') return false;
  const version = payloadBytes.readUInt32LE(8);
  const itemCount = payloadBytes.readUInt32LE(12);
  const stringCount = payloadBytes.readUInt32LE(16);
  const rowStride = payloadBytes.readUInt32LE(20);
  const offsetsBytes = stringCount * 4;
  const rowsBytes = itemCount * rowStride * 4;
  const stringTableStart = compactHeaderBytes + offsetsBytes + rowsBytes;
  if (version !== 1) {
    fail(failures, 'NATIVE_SEARCH_PACK_BAD_COMPACT_VERSION', 'compact search pack has an invalid version', { logicalName, version });
  }
  if (rowStride !== 13) {
    fail(failures, 'NATIVE_SEARCH_PACK_BAD_ROW_STRIDE', 'compact search pack has an invalid row stride', { logicalName, rowStride });
  }
  if (stringCount <= 0 || itemCount <= 0) {
    fail(failures, 'NATIVE_SEARCH_PACK_EMPTY_COMPACT_TABLE', 'compact search pack has no items or strings', { logicalName, itemCount, stringCount });
  }
  if (stringTableStart > payloadBytes.length) {
    fail(failures, 'NATIVE_SEARCH_PACK_COMPACT_BOUNDS', 'compact search pack table exceeds payload bounds', {
      logicalName,
      itemCount,
      stringCount,
      rowStride,
      payloadBytes: payloadBytes.length,
      stringTableStart,
    });
  }
  return true;
}
function validateCompactRecipePayload(payloadBytes, failures, logicalName) {
  const compactHeaderBytes = 8 + 11 * 4;
  if (payloadBytes.length < compactHeaderBytes) return false;
  const magic = payloadBytes.subarray(0, 8).toString('utf8');
  if (magic !== 'NEIRCP1\0') return false;
  const version = payloadBytes.readUInt32LE(8);
  const stringCount = payloadBytes.readUInt32LE(12);
  const itemCount = payloadBytes.readUInt32LE(16);
  const refCount = payloadBytes.readUInt32LE(20);
  const uiCount = payloadBytes.readUInt32LE(24);
  const categoryCount = payloadBytes.readUInt32LE(28);
  const sourceCount = payloadBytes.readUInt32LE(32);
  const itemStride = payloadBytes.readUInt32LE(36);
  const refStride = payloadBytes.readUInt32LE(40);
  const uiStride = payloadBytes.readUInt32LE(44);
  const categoryStride = payloadBytes.readUInt32LE(48);
  const offsetsBytes = stringCount * 4;
  const itemBytes = itemCount * itemStride * 4;
  const refBytes = refCount * refStride * 4;
  const uiBytes = uiCount * uiStride * 4;
  const categoryBytes = categoryCount * categoryStride * 4;
  const sourceBytes = sourceCount * 4;
  const stringTableStart = compactHeaderBytes + offsetsBytes + itemBytes + refBytes + uiBytes + categoryBytes + sourceBytes;
  if (version !== 1) {
    fail(failures, 'NATIVE_RECIPE_PACK_BAD_COMPACT_VERSION', 'compact recipe pack has an invalid version', { logicalName, version });
  }
  if (itemStride !== 5 || refStride !== 3 || uiStride !== 7 || categoryStride !== 5) {
    fail(failures, 'NATIVE_RECIPE_PACK_BAD_ROW_STRIDE', 'compact recipe pack has invalid row strides', {
      logicalName,
      itemStride,
      refStride,
      uiStride,
      categoryStride,
    });
  }
  if (stringCount <= 0) {
    fail(failures, 'NATIVE_RECIPE_PACK_EMPTY_STRING_TABLE', 'compact recipe pack has no strings', { logicalName, stringCount });
  }
  if (itemCount <= 0 && uiCount <= 0 && categoryCount <= 0) {
    fail(failures, 'NATIVE_RECIPE_PACK_EMPTY_INDEX', 'compact recipe pack has no usable indexes', { logicalName, itemCount, uiCount, categoryCount });
  }
  if (stringTableStart > payloadBytes.length) {
    fail(failures, 'NATIVE_RECIPE_PACK_COMPACT_BOUNDS', 'compact recipe pack table exceeds payload bounds', {
      logicalName,
      stringCount,
      itemCount,
      refCount,
      uiCount,
      categoryCount,
      sourceCount,
      payloadBytes: payloadBytes.length,
      stringTableStart,
    });
  }
  return true;
}
function validateCompactBrowserPayload(payloadBytes, failures, logicalName) {
  const compactHeaderBytes = 8 + 4 * 4;
  if (payloadBytes.length < compactHeaderBytes) return false;
  const magic = payloadBytes.subarray(0, 8).toString('utf8');
  if (magic !== 'NEIBRW1\0') return false;
  const version = payloadBytes.readUInt32LE(8);
  const itemCount = payloadBytes.readUInt32LE(12);
  const stringCount = payloadBytes.readUInt32LE(16);
  const rowStride = payloadBytes.readUInt32LE(20);
  const offsetsBytes = stringCount * 4;
  const rowsBytes = itemCount * rowStride * 4;
  const stringTableStart = compactHeaderBytes + offsetsBytes + rowsBytes;
  if (version !== 1) {
    fail(failures, 'NATIVE_BROWSER_PACK_BAD_COMPACT_VERSION', 'compact browser pack has an invalid version', { logicalName, version });
  }
  if (rowStride !== 6) {
    fail(failures, 'NATIVE_BROWSER_PACK_BAD_ROW_STRIDE', 'compact browser pack has an invalid row stride', { logicalName, rowStride });
  }
  if (stringCount <= 0 || itemCount <= 0) {
    fail(failures, 'NATIVE_BROWSER_PACK_EMPTY_COMPACT_TABLE', 'compact browser pack has no items or strings', { logicalName, itemCount, stringCount });
  }
  if (stringTableStart > payloadBytes.length) {
    fail(failures, 'NATIVE_BROWSER_PACK_COMPACT_BOUNDS', 'compact browser pack table exceeds payload bounds', {
      logicalName,
      itemCount,
      stringCount,
      rowStride,
      payloadBytes: payloadBytes.length,
      stringTableStart,
    });
  }
  return true;
}

function validateCompactStringPayload(payloadBytes, failures, logicalName) {
  const compactHeaderBytes = 8 + 4 * 4;
  if (payloadBytes.length < compactHeaderBytes) return false;
  const magic = payloadBytes.subarray(0, 8).toString('utf8');
  if (magic !== 'NEISTR1\0') return false;
  const version = payloadBytes.readUInt32LE(8);
  const itemCount = payloadBytes.readUInt32LE(12);
  const stringCount = payloadBytes.readUInt32LE(16);
  const rowStride = payloadBytes.readUInt32LE(20);
  const offsetsBytes = stringCount * 4;
  const rowsBytes = itemCount * rowStride * 4;
  const stringTableStart = compactHeaderBytes + offsetsBytes + rowsBytes;
  if (version !== 1) {
    fail(failures, 'NATIVE_STRING_PACK_BAD_COMPACT_VERSION', 'compact string pack has an invalid version', { logicalName, version });
  }
  if (rowStride !== 6) {
    fail(failures, 'NATIVE_STRING_PACK_BAD_ROW_STRIDE', 'compact string pack has an invalid row stride', { logicalName, rowStride });
  }
  if (stringCount <= 0 || itemCount <= 0) {
    fail(failures, 'NATIVE_STRING_PACK_EMPTY_COMPACT_TABLE', 'compact string pack has no items or strings', { logicalName, itemCount, stringCount });
  }
  if (stringTableStart > payloadBytes.length) {
    fail(failures, 'NATIVE_STRING_PACK_COMPACT_BOUNDS', 'compact string pack table exceeds payload bounds', {
      logicalName,
      itemCount,
      stringCount,
      rowStride,
      payloadBytes: payloadBytes.length,
      stringTableStart,
    });
  }
  return true;
}

function validateCompactTexturePayload(payloadBytes, failures, logicalName) {
  const compactHeaderBytes = 8 + 6 * 4;
  if (payloadBytes.length < compactHeaderBytes) return false;
  const magic = payloadBytes.subarray(0, 8).toString('utf8');
  if (magic !== 'NEITEX1\0') return false;
  const version = payloadBytes.readUInt32LE(8);
  const itemCount = payloadBytes.readUInt32LE(12);
  const stringCount = payloadBytes.readUInt32LE(16);
  const frameCount = payloadBytes.readUInt32LE(20);
  const rowStride = payloadBytes.readUInt32LE(24);
  const frameStride = payloadBytes.readUInt32LE(28);
  const offsetsBytes = stringCount * 4;
  const rowsBytes = itemCount * rowStride * 4;
  const framesBytes = frameCount * frameStride * 4;
  const stringTableStart = compactHeaderBytes + offsetsBytes + rowsBytes + framesBytes;
  if (version !== 1) {
    fail(failures, 'NATIVE_TEXTURE_PACK_BAD_COMPACT_VERSION', 'compact texture pack has an invalid version', { logicalName, version });
  }
  if (rowStride !== 10) {
    fail(failures, 'NATIVE_TEXTURE_PACK_BAD_ROW_STRIDE', 'compact texture pack has an invalid row stride', { logicalName, rowStride });
  }
  if (frameStride !== 5) {
    fail(failures, 'NATIVE_TEXTURE_PACK_BAD_FRAME_STRIDE', 'compact texture pack has an invalid frame stride', { logicalName, frameStride });
  }
  if (itemCount <= 0 || stringCount <= 0) {
    fail(failures, 'NATIVE_TEXTURE_PACK_EMPTY_COMPACT_TABLE', 'compact texture pack has no items or strings', { logicalName, itemCount, stringCount });
  }
  if (stringTableStart > payloadBytes.length) {
    fail(failures, 'NATIVE_TEXTURE_PACK_COMPACT_BOUNDS', 'compact texture pack table exceeds payload bounds', {
      logicalName,
      itemCount,
      stringCount,
      frameCount,
      rowStride,
      frameStride,
      payloadBytes: payloadBytes.length,
      stringTableStart,
    });
  }
  return true;
}
function validateCompactAtlasMetaPayload(payloadBytes, failures, logicalName) {
  const compactHeaderBytes = 8 + 4 * 4;
  if (payloadBytes.length < compactHeaderBytes) return false;
  const magic = payloadBytes.subarray(0, 8).toString('utf8');
  if (magic !== 'NEIATM1\0') return false;
  const version = payloadBytes.readUInt32LE(8);
  const atlasCount = payloadBytes.readUInt32LE(12);
  const stringCount = payloadBytes.readUInt32LE(16);
  const rowStride = payloadBytes.readUInt32LE(20);
  const offsetsBytes = stringCount * 4;
  const rowsBytes = atlasCount * rowStride * 4;
  const stringTableStart = compactHeaderBytes + offsetsBytes + rowsBytes;
  if (version !== 1) {
    fail(failures, 'NATIVE_ATLAS_META_PACK_BAD_COMPACT_VERSION', 'compact atlas meta pack has an invalid version', { logicalName, version });
  }
  if (rowStride !== 6) {
    fail(failures, 'NATIVE_ATLAS_META_PACK_BAD_ROW_STRIDE', 'compact atlas meta pack has an invalid row stride', { logicalName, rowStride });
  }
  if (stringCount <= 0) {
    fail(failures, 'NATIVE_ATLAS_META_PACK_EMPTY_STRING_TABLE', 'compact atlas meta pack has no strings', { logicalName, atlasCount, stringCount });
  }
  if (stringTableStart > payloadBytes.length) {
    fail(failures, 'NATIVE_ATLAS_META_PACK_COMPACT_BOUNDS', 'compact atlas meta pack table exceeds payload bounds', {
      logicalName,
      atlasCount,
      stringCount,
      rowStride,
      payloadBytes: payloadBytes.length,
      stringTableStart,
    });
  }
  return true;
}
function validateCompactAnimationPayload(payloadBytes, failures, logicalName) {
  const compactHeaderBytes = 8 + 6 * 4;
  if (payloadBytes.length < compactHeaderBytes) return false;
  const magic = payloadBytes.subarray(0, 8).toString('utf8');
  if (magic !== 'NEIANM1\0') return false;
  const version = payloadBytes.readUInt32LE(8);
  const itemCount = payloadBytes.readUInt32LE(12);
  const stringCount = payloadBytes.readUInt32LE(16);
  const frameCount = payloadBytes.readUInt32LE(20);
  const rowStride = payloadBytes.readUInt32LE(24);
  const frameStride = payloadBytes.readUInt32LE(28);
  const offsetsBytes = stringCount * 4;
  const rowsBytes = itemCount * rowStride * 4;
  const framesBytes = frameCount * frameStride * 4;
  const stringTableStart = compactHeaderBytes + offsetsBytes + rowsBytes + framesBytes;
  if (version !== 1) {
    fail(failures, 'NATIVE_ANIMATION_PACK_BAD_COMPACT_VERSION', 'compact animation pack has an invalid version', { logicalName, version });
  }
  if (rowStride !== 5) {
    fail(failures, 'NATIVE_ANIMATION_PACK_BAD_ROW_STRIDE', 'compact animation pack has an invalid row stride', { logicalName, rowStride });
  }
  if (frameStride !== 2) {
    fail(failures, 'NATIVE_ANIMATION_PACK_BAD_FRAME_STRIDE', 'compact animation pack has an invalid frame stride', { logicalName, frameStride });
  }
  if (stringCount <= 0) {
    fail(failures, 'NATIVE_ANIMATION_PACK_EMPTY_STRING_TABLE', 'compact animation pack has no strings', { logicalName, itemCount, stringCount });
  }
  if (stringTableStart > payloadBytes.length) {
    fail(failures, 'NATIVE_ANIMATION_PACK_COMPACT_BOUNDS', 'compact animation pack table exceeds payload bounds', {
      logicalName,
      itemCount,
      stringCount,
      frameCount,
      rowStride,
      frameStride,
      payloadBytes: payloadBytes.length,
      stringTableStart,
    });
  }
  return true;
}
const expectedEntrypoints = {
  browser: 'neonei/browser-pack/current',
  groups: 'neonei/group-pack/current',
  search: 'neonei/search-pack/current',
  recipes: 'neonei/recipe-pack/current',
  textures: 'neonei/texture-pack/current',
  atlasMeta: 'neonei/atlas-meta-pack/current',
  animations: 'neonei/animation-pack/current',
  stringsZhCn: 'neonei/string-pack/current',
};

const expectedCapabilities = [
  'atlas.static',
  'atlas.animated',
  'atlas.meta',
  'groups.collapse',
  'groups.semantic-nbt',
  'recipes.lookup',
  'search.zh-cn',
  'strings.zh-cn',
  'native-render.webgl2',
];

function normalizeCapabilities(value) {
  if (Array.isArray(value)) {
    return new Set(value.filter((entry) => typeof entry === 'string' && entry.trim()).map((entry) => entry.trim()));
  }
  if (value && typeof value === 'object') {
    return new Set(
      Object.entries(value)
        .filter(([, enabled]) => enabled === true || enabled === 'true' || enabled === 1)
        .map(([name]) => name),
    );
  }
  return new Set();
}

function validateRuntimeManifestContract(manifest, failures) {
  const schema = manifest.schema ?? manifest.schemaVersion;
  if (schema !== 'neonei/runtime/current' && schema !== 'neonei/native-runtime/current' && schema !== 'neonei/rust-runtime-manifest/current') {
    fail(failures, 'NATIVE_RUNTIME_SCHEMA_UNSUPPORTED', 'runtime manifest has an unsupported schema', { schema: schema ?? null });
  }
  if (!Number.isInteger(manifest.schemaRevision) || manifest.schemaRevision < 1) {
    fail(failures, 'NATIVE_RUNTIME_SCHEMA_REVISION_MISSING', 'runtime manifest must declare schemaRevision >= 1', {
      schemaRevision: manifest.schemaRevision ?? null,
    });
  }
  const capabilities = normalizeCapabilities(manifest.capabilities);
  for (const capability of expectedCapabilities) {
    if (!capabilities.has(capability)) {
      fail(failures, 'NATIVE_RUNTIME_CAPABILITY_MISSING', `runtime manifest is missing capability: ${capability}`, { capability });
    }
  }
}

function validateRuntimePacks(runtimeDir) {
  const failures = [];
  const warnings = [];
  const resolvedRuntimeDir = resolve(runtimeDir);
  let manifestPath = join(resolvedRuntimeDir, 'runtime-manifest.json');
  let runtimeRoot = resolvedRuntimeDir;

  if (!existsSync(manifestPath) && existsSync(join(resolvedRuntimeDir, 'rust', 'runtime-manifest.json'))) {
    manifestPath = join(resolvedRuntimeDir, 'rust', 'runtime-manifest.json');
    runtimeRoot = resolvedRuntimeDir;
  }
  if (!existsSync(manifestPath)) {
    fail(failures, 'NATIVE_RUNTIME_MANIFEST_MISSING', 'runtime-manifest.json was not found', { runtimeDir: resolvedRuntimeDir });
    return { runtimeDir: resolvedRuntimeDir, manifestPath, failures, warnings, packs: {} };
  }

  const manifest = readJson(manifestPath);
  if (containsWindowsAbsolutePath(manifest)) {
    fail(failures, 'NATIVE_RUNTIME_MANIFEST_WINDOWS_PATH_LEAK', 'runtime manifest contains a Windows absolute path', { manifestPath });
  }
  validateRuntimeManifestContract(manifest, failures);

  const entrypoints = manifest.entrypoints ?? manifest.files ?? {};
  const packs = {};
  for (const [logicalName, expectedSchema] of Object.entries(expectedEntrypoints)) {
    const relativePath = entrypoints[logicalName];
    if (!isPortableRelativePath(relativePath)) {
      fail(failures, 'NATIVE_RUNTIME_ENTRYPOINT_NOT_PORTABLE', `runtime entrypoint is not a portable relative URL path: ${logicalName}`, { logicalName, path: relativePath ?? null });
      continue;
    }
    if (!relativePath.endsWith('.bin')) {
      fail(failures, 'NATIVE_RUNTIME_ENTRYPOINT_NOT_BINARY', `runtime entrypoint does not point to a .bin pack: ${logicalName}`, { logicalName, path: relativePath });
      continue;
    }
    const filePath = join(runtimeRoot, relativePath);
    packs[logicalName] = validateBinaryPack({ filePath, expectedSchema, logicalName }, failures, warnings);
  }

  for (const diagnostic of ['integrity.json', 'size-report.json', 'missing-data-report.json']) {
    const candidates = [join(dirname(manifestPath), diagnostic), join(runtimeRoot, 'rust', diagnostic), join(runtimeRoot, diagnostic)];
    const diagnosticPath = candidates.find((candidate) => existsSync(candidate));
    if (!diagnosticPath) {
      warn(warnings, 'NATIVE_RUNTIME_DIAGNOSTIC_MISSING', `runtime diagnostic file is missing: ${diagnostic}`, { diagnostic });
      continue;
    }
    try {
      const diagnosticJson = readJson(diagnosticPath);
      if (containsWindowsAbsolutePath(diagnosticJson)) {
        fail(failures, 'NATIVE_RUNTIME_DIAGNOSTIC_WINDOWS_PATH_LEAK', `runtime diagnostic contains a Windows absolute path: ${diagnostic}`, { diagnosticPath });
      }
    } catch (error) {
      fail(failures, 'NATIVE_RUNTIME_DIAGNOSTIC_INVALID_JSON', `runtime diagnostic is not valid JSON: ${diagnostic}`, { diagnosticPath, message: error.message });
    }
  }

  return {
    schemaVersion: 'neonei/native-runtime-pack-validation/current',
    generatedAt: new Date().toISOString(),
    runtimeDir: resolvedRuntimeDir,
    runtimeRoot,
    manifestPath,
    entrypoints,
    packs,
    failures,
    warnings,
  };
}

function writePack(dir, relativePath, schema, payload) {
  const filePath = join(dir, relativePath);
  mkdirSync(dirname(filePath), { recursive: true });
  const schemaBytes = Buffer.from(schema, 'utf8');
  const payloadBytes = Buffer.from(JSON.stringify(payload), 'utf8');
  const header = Buffer.alloc(24);
  header.write('NNEIBIN\0', 0, 8, 'utf8');
  header.writeUInt32LE(1, 8);
  header.writeUInt32LE(schemaBytes.length, 12);
  header.writeBigUInt64LE(BigInt(payloadBytes.length), 16);
  writeFileSync(filePath, Buffer.concat([header, schemaBytes, payloadBytes]));
}

function runSelfTest() {
  const tempRoot = mkdtempSync(join(tmpdir(), 'neonei-native-packs-'));
  try {
    const entrypoints = {};
    for (const [name, schema] of Object.entries(expectedEntrypoints)) {
      const relativePath = name === 'stringsZhCn'
        ? 'rust/strings.zh_cn.bin'
        : name === 'atlasMeta'
          ? 'rust/atlas.meta.bin'
          : `rust/${name}.bin`;
      entrypoints[name] = relativePath;
      writePack(tempRoot, relativePath, schema, { schema, name, path: relativePath });
    }
    mkdirSync(join(tempRoot, 'rust'), { recursive: true });
    writeFileSync(join(tempRoot, 'rust', 'runtime-manifest.json'), JSON.stringify({
      schema: 'neonei/runtime/current',
      schemaVersion: 'neonei/rust-runtime-manifest/current',
      schemaRevision: 1,
      runtimeId: 'self-test',
      capabilities: expectedCapabilities,
      entrypoints,
    }, null, 2));
    writeFileSync(join(tempRoot, 'rust', 'integrity.json'), '{}');
    writeFileSync(join(tempRoot, 'rust', 'size-report.json'), '{}');
    writeFileSync(join(tempRoot, 'rust', 'missing-data-report.json'), '{}');
    const report = validateRuntimePacks(tempRoot);
    if (report.failures.length > 0) {
      console.error(JSON.stringify(report, null, 2));
      process.exit(1);
    }
    console.log(JSON.stringify({ ok: true, selfTest: true, packs: Object.keys(report.packs) }, null, 2));
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

if (selfTest) {
  runSelfTest();
} else {
  const requestedRuntimeDir = readArg('--runtime-dir') ?? process.env.NEONEI_NATIVE_RUNTIME_DIR;
  const runtimeDir = requestedRuntimeDir
    ?? [
      join(repoRoot, '.tmp-runtime', 'dist-data-v3-self-test'),
      join(repoRoot, '.tmp-runtime', 'native-gpu-runtime-compile-check'),
      join(repoRoot, 'frontend', 'public', 'dist-data', 'runtime'),
    ].find((candidate) => existsSync(join(candidate, 'runtime-manifest.json')) || existsSync(join(candidate, 'rust', 'runtime-manifest.json')))
    ?? join(repoRoot, '.tmp-runtime', 'native-gpu-runtime-compile-check');
  const report = validateRuntimePacks(runtimeDir);
  const outputDir = join(repoRoot, '.runtime-logs');
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(join(outputDir, 'native-runtime-pack-validation.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));
  if (gate && report.failures.length > 0) process.exit(1);
}






