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
    warn(warnings, 'NATIVE_PACK_PAYLOAD_NOT_JSON', `native runtime pack payload is not JSON-decodable yet: ${logicalName}`, { logicalName, message: error.message });
  }
  return { bytes: buffer.length, schema, payloadBytes: payloadBytes.length, payload: null };
}

const expectedEntrypoints = {
  browser: 'neonei/browser-pack/current',
  groups: 'neonei/group-pack/current',
  search: 'neonei/search-pack/current',
  recipes: 'neonei/recipe-pack/current',
  textures: 'neonei/texture-pack/current',
  animations: 'neonei/animation-pack/current',
};

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
      const relativePath = `rust/${name}.bin`;
      entrypoints[name] = relativePath;
      writePack(tempRoot, relativePath, schema, { schema, name, path: relativePath });
    }
    mkdirSync(join(tempRoot, 'rust'), { recursive: true });
    writeFileSync(join(tempRoot, 'rust', 'runtime-manifest.json'), JSON.stringify({ schemaVersion: 'neonei/rust-runtime-manifest/current', entrypoints }, null, 2));
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
  const runtimeDir = readArg('--runtime-dir') ?? process.env.NEONEI_NATIVE_RUNTIME_DIR ?? join(repoRoot, '.tmp-runtime', 'native-gpu-runtime-compile-check');
  const report = validateRuntimePacks(runtimeDir);
  const outputDir = join(repoRoot, '.runtime-logs');
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(join(outputDir, 'native-runtime-pack-validation.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));
  if (gate && report.failures.length > 0) process.exit(1);
}
