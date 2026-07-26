import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const lockPath = join(repoRoot, 'tools', 'elysium-compiler', 'elysium-compiler.lock.json');
const artifactPath = join(repoRoot, 'tools', 'elysium-compiler', 'elysium-compiler-capability-abi.json');
const backendCatalogPath = join(
  repoRoot,
  'backend',
  'src',
  'compiler-client',
  'elysium-compiler-capability-abi.ts',
);
const verifyLockedCompiler = process.argv.includes('--verify-locked-compiler');
const checkOnly = process.argv.includes('--check') || verifyLockedCompiler;

function fail(message) {
  console.error(`[sync-elysium-compiler-capability-abi] ${message}`);
  process.exit(1);
}

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
  } catch (error) {
    fail(`cannot read ${label} ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function requireRecord(value, path) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${path} must be an object`);
  }
  return value;
}

function requireString(value, path) {
  if (typeof value !== 'string' || value.trim() === '') {
    fail(`${path} must be a non-empty string`);
  }
  return value;
}

function requireStringArray(value, path) {
  if (
    !Array.isArray(value)
    || value.length === 0
    || value.some((entry) => typeof entry !== 'string' || entry.trim() === '')
  ) {
    fail(`${path} must be a non-empty string array`);
  }
  return value;
}

function assertLockMetadata(metadata, lock) {
  for (const [field, expected] of [
    ['name', lock.compiler],
    ['version', lock.version],
    ['rawExportSchemaVersion', lock.rawExportSchemaVersion],
    ['compiledDistSchemaVersion', lock.compiledDistSchemaVersion],
    ['exportAbiVersion', lock.exportAbiVersion],
    ['packAbiVersion', lock.packAbiVersion],
    ['runtimeAbiVersion', lock.runtimeAbiVersion],
  ]) {
    if (expected && metadata[field] !== expected) {
      fail(`locked compiler metadata ${field} expected ${expected}, got ${metadata[field] ?? '<missing>'}`);
    }
  }
}

function assertArtifactSourceMatchesLock(artifact, lock) {
  const source = requireRecord(artifact.source, 'compiler capability artifact.source');
  for (const [field, expected] of [
    ['compiler', lock.compiler],
    ['version', lock.version],
    ['sha256', `${lock.sha256}`.toLowerCase()],
  ]) {
    if (source[field] !== expected) {
      fail(`compiler capability artifact source.${field} expected ${expected}, got ${source[field] ?? '<missing>'}`);
    }
  }
  requireString(source.schemaHash, 'compiler capability artifact.source.schemaHash');
}

function loadLockedCompilerCatalog() {
  const lock = requireRecord(readJson(lockPath, 'compiler lock'), 'compiler lock');
  const binaryPath = resolve(repoRoot, requireString(lock.binary, 'compiler lock.binary'));
  if (!existsSync(binaryPath)) {
    fail(`locked compiler binary is missing: ${binaryPath}`);
  }
  const actualSha256 = sha256(binaryPath);
  const expectedSha256 = requireString(lock.sha256, 'compiler lock.sha256').toLowerCase();
  if (actualSha256 !== expectedSha256) {
    fail(`locked compiler checksum expected ${expectedSha256}, got ${actualSha256}`);
  }

  const result = spawnSync(binaryPath, ['schemas'], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: 'pipe',
    shell: false,
  });
  if ((result.status ?? 1) !== 0) {
    fail(`locked compiler schemas failed: ${(result.stderr || result.stdout).trim()}`);
  }

  let catalog;
  try {
    catalog = JSON.parse(result.stdout);
  } catch (error) {
    fail(`locked compiler schemas returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  const metadata = requireRecord(catalog.compiler?.metadata, 'schemas.compiler.metadata');
  assertLockMetadata(metadata, lock);
  return { actualSha256, catalog, metadata };
}

function buildArtifact() {
  const { actualSha256, catalog, metadata } = loadLockedCompilerCatalog();
  const abi = requireRecord(catalog.abi, 'schemas.abi');
  const compilerCapabilityAbi = requireRecord(
    abi.compilerCapabilityAbi,
    'schemas.abi.compilerCapabilityAbi',
  );
  const nativeUi = requireRecord(
    compilerCapabilityAbi.nativeUi,
    'schemas.abi.compilerCapabilityAbi.nativeUi',
  );
  const policy = requireRecord(compilerCapabilityAbi.policy, 'schemas.abi.compilerCapabilityAbi.policy');

  return {
    source: {
      compiler: requireString(metadata.name, 'schemas.compiler.metadata.name'),
      version: requireString(metadata.version, 'schemas.compiler.metadata.version'),
      sha256: actualSha256,
      schemaHash: requireString(metadata.schemaHash, 'schemas.compiler.metadata.schemaHash'),
    },
    name: requireString(compilerCapabilityAbi.name, 'schemas.abi.compilerCapabilityAbi.name'),
    version: requireString(compilerCapabilityAbi.version, 'schemas.abi.compilerCapabilityAbi.version'),
    commands: requireStringArray(
      compilerCapabilityAbi.commands,
      'schemas.abi.compilerCapabilityAbi.commands',
    ),
    requiredCommands: requireStringArray(
      compilerCapabilityAbi.requiredCommands,
      'schemas.abi.compilerCapabilityAbi.requiredCommands',
    ),
    compileScopes: requireStringArray(
      compilerCapabilityAbi.compileScopes,
      'schemas.abi.compilerCapabilityAbi.compileScopes',
    ),
    nativeUi: {
      requiredCapabilities: requireStringArray(
        nativeUi.requiredCapabilities,
        'schemas.abi.compilerCapabilityAbi.nativeUi.requiredCapabilities',
      ),
      requiredFiles: requireStringArray(
        nativeUi.requiredFiles,
        'schemas.abi.compilerCapabilityAbi.nativeUi.requiredFiles',
      ),
      coordinateSpace: requireString(
        nativeUi.coordinateSpace,
        'schemas.abi.compilerCapabilityAbi.nativeUi.coordinateSpace',
      ),
      runtimeTransform: requireString(
        nativeUi.runtimeTransform,
        'schemas.abi.compilerCapabilityAbi.nativeUi.runtimeTransform',
      ),
      fallbackPolicy: requireString(
        nativeUi.fallbackPolicy,
        'schemas.abi.compilerCapabilityAbi.nativeUi.fallbackPolicy',
      ),
    },
    policy: {
      legacyFallback: requireString(policy.legacyFallback, 'schemas.abi.compilerCapabilityAbi.policy.legacyFallback'),
      missingCapability: requireString(
        policy.missingCapability,
        'schemas.abi.compilerCapabilityAbi.policy.missingCapability',
      ),
      hotPathEncoding: requireString(
        policy.hotPathEncoding,
        'schemas.abi.compilerCapabilityAbi.policy.hotPathEncoding',
      ),
      fullExportValidation: requireString(
        policy.fullExportValidation,
        'schemas.abi.compilerCapabilityAbi.policy.fullExportValidation',
      ),
    },
  };
}

function renderBackendCatalog(artifact) {
  const literal = (value) => JSON.stringify(value, null, 2);
  return `// Generated by scripts/sync-elysium-compiler-capability-abi.mjs from the locked compiler schemas.\n// Do not hand-edit capability values; update the pinned compiler and regenerate this file.\n\nexport const ELYSIUM_COMPILER_CAPABILITY_ABI_VERSION = ${literal(artifact.version)} as const;\n\nexport const ELYSIUM_COMPILER_COMMANDS = ${literal(artifact.commands)} as const;\n\nexport const REQUIRED_COMPILER_COMMANDS = ${literal(artifact.requiredCommands)} as const;\n\nexport const ELYSIUM_COMPILER_COMPILE_SCOPES = ${literal(artifact.compileScopes)} as const;\n\nexport type ElysiumCompilerScope = typeof ELYSIUM_COMPILER_COMPILE_SCOPES[number];\n\nexport const NATIVE_UI_REQUIRED_CAPABILITIES = ${literal(artifact.nativeUi.requiredCapabilities)} as const;\n\nexport const NATIVE_UI_REQUIRED_FILES = ${literal(artifact.nativeUi.requiredFiles)} as const;\n\nexport const NATIVE_UI_COORDINATE_SPACE = ${literal(artifact.nativeUi.coordinateSpace)} as const;\nexport const NATIVE_UI_RUNTIME_TRANSFORM = ${literal(artifact.nativeUi.runtimeTransform)} as const;\nexport const NATIVE_UI_FALLBACK_POLICY = ${literal(artifact.nativeUi.fallbackPolicy)} as const;\n\nexport const ELYSIUM_COMPILER_POLICY = Object.freeze(${literal(artifact.policy)} as const);\n\nexport const ELYSIUM_COMPILER_CAPABILITY_ABI = Object.freeze({\n  name: ${literal(artifact.name)},\n  version: ELYSIUM_COMPILER_CAPABILITY_ABI_VERSION,\n  commands: ELYSIUM_COMPILER_COMMANDS,\n  requiredCommands: REQUIRED_COMPILER_COMMANDS,\n  compileScopes: ELYSIUM_COMPILER_COMPILE_SCOPES,\n  nativeUi: Object.freeze({\n    requiredCapabilities: NATIVE_UI_REQUIRED_CAPABILITIES,\n    requiredFiles: NATIVE_UI_REQUIRED_FILES,\n    coordinateSpace: NATIVE_UI_COORDINATE_SPACE,\n    runtimeTransform: NATIVE_UI_RUNTIME_TRANSFORM,\n    fallbackPolicy: NATIVE_UI_FALLBACK_POLICY,\n  }),\n  policy: ELYSIUM_COMPILER_POLICY,\n});\n`;
}

function checkOrWrite(path, expected, label) {
  if (checkOnly) {
    if (!existsSync(path) || readFileSync(path, 'utf8').replace(/^\uFEFF/, '') !== expected) {
      fail(`${label} is stale; run node scripts/sync-elysium-compiler-capability-abi.mjs`);
    }
    return;
  }
  writeFileSync(path, expected, 'utf8');
}

const lock = requireRecord(readJson(lockPath, 'compiler lock'), 'compiler lock');
const artifact = checkOnly && !verifyLockedCompiler
  ? readJson(artifactPath, 'compiler capability artifact')
  : buildArtifact();
assertArtifactSourceMatchesLock(artifact, lock);
checkOrWrite(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'compiler capability artifact');
checkOrWrite(backendCatalogPath, renderBackendCatalog(artifact), 'backend compiler capability catalog');
console.log(
  `[sync-elysium-compiler-capability-abi] ${checkOnly ? 'verified' : 'updated'} ${artifact.source.schemaHash}`
    + `${verifyLockedCompiler ? ' against locked compiler binary' : ''}`,
);
