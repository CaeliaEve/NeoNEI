import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  ELYSIUM_COMPILER_CAPABILITY_SOURCE,
  REQUIRED_COMPILER_COMMAND_INVOCATIONS,
  validateElysiumCompilerCapabilityAbi,
} from './elysium-compiler-capability-abi.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const lockPath = resolve(readArg('--lock') ?? join(repoRoot, 'tools', 'elysium-compiler', 'elysium-compiler.lock.json'));
const json = args.includes('--json');
const buildLocal = args.includes('--build-local') || process.env.NEONEI_BUILD_LOCAL_COMPILER === '1';

function readArg(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function fail(message) {
  if (json) console.log(JSON.stringify({ status: 'failed', message, lockPath }, null, 2));
  else console.error(`[ensure-elysium-compiler] ${message}`);
  process.exit(1);
}

function commandExists(command) {
  const result = spawnSync(command, ['--help'], { stdio: 'ignore', shell: false });
  return (result.status ?? 1) === 0;
}

function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function verifyCommandSurface(candidate) {
  const commands = {};
  const failures = [];
  for (const [name, commandArgs] of Object.entries(REQUIRED_COMPILER_COMMAND_INVOCATIONS)) {
    const result = spawnSync(candidate, commandArgs, { encoding: 'utf8', stdio: 'pipe', shell: false });
    const ok = (result.status ?? 1) === 0;
    commands[name] = {
      ok,
      usage: ok ? `${result.stdout}`.split(/\r?\n/).find((line) => line.startsWith('Usage:')) ?? null : null,
    };
    if (!ok) {
      failures.push(`${name}: ${result.stderr || result.stdout}`.trim());
    }
  }
  return { ok: failures.length === 0, commands, failures };
}

function resolveCandidate(candidate) {
  if (!candidate) return null;
  return candidate.includes('\\') || candidate.includes('/') ? resolve(repoRoot, candidate) : candidate;
}

function maybeBuildLocalCompiler(lock) {
  if (!buildLocal) return null;
  const manifest = resolve(repoRoot, '..', 'elysium-compiler', 'Cargo.toml');
  if (!existsSync(manifest)) return null;
  const result = spawnSync('cargo', ['build', '--release', '-p', 'elysium-compiler', '--manifest-path', manifest], {
    cwd: repoRoot,
    stdio: json ? 'pipe' : 'inherit',
    encoding: json ? 'utf8' : undefined,
    shell: false,
  });
  if ((result.status ?? 1) !== 0) {
    fail(`local elysium-compiler build failed${json ? `: ${result.stderr || result.stdout}` : ''}`);
  }
  return resolveCandidate(lock.localFallbacks?.[0]);
}

if (!existsSync(lockPath)) fail(`compiler lock file missing: ${lockPath}`);
const lock = JSON.parse(readFileSync(lockPath, 'utf8').replace(/^\uFEFF/, ''));
const envCompiler = process.env.NEONEI_COMPILER_BIN?.trim();
const candidates = envCompiler
  ? [resolveCandidate(envCompiler)]
  : [resolveCandidate(lock.binary), ...(lock.localFallbacks ?? []).map(resolveCandidate), maybeBuildLocalCompiler(lock)];
const availableCandidates = candidates.filter((candidate) => {
  if (!candidate) return false;
  if (candidate.includes('\\') || candidate.includes('/')) return existsSync(candidate);
  return commandExists(candidate);
});

if (availableCandidates.length === 0) {
  fail(`compiler binary is not available. Checked: ${candidates.filter(Boolean).join(', ')}. Set NEONEI_COMPILER_BIN or run with --build-local from a sibling elysium-compiler checkout.`);
}

const mismatches = [];
let selected = null;
let selectedCatalog = null;
let selectedMetadata = null;
let selectedCommands = null;

for (const candidate of availableCandidates) {
  if (candidate.includes('\\') || candidate.includes('/')) {
    const actual = sha256(candidate);
    if (!envCompiler && lock.sha256 && candidate === resolveCandidate(lock.binary) && actual !== `${lock.sha256}`.toLowerCase()) {
      mismatches.push(`${candidate}: checksum expected ${lock.sha256}, got ${actual}`);
      continue;
    }
  }

  const result = spawnSync(candidate, ['schemas'], { encoding: 'utf8', stdio: 'pipe', shell: false });
  if ((result.status ?? 1) !== 0) {
    mismatches.push(`${candidate}: schemas failed: ${result.stderr || result.stdout}`);
    continue;
  }

  const catalog = JSON.parse(result.stdout);
  const metadata = catalog.compiler?.metadata ?? {};
  const failures = [];
  for (const [field, expected] of [
    ['name', lock.compiler],
    ['version', lock.version],
    ['rawExportSchemaVersion', lock.rawExportSchemaVersion],
    ['compiledDistSchemaVersion', lock.compiledDistSchemaVersion],
    ['exportAbiVersion', lock.exportAbiVersion],
    ['packAbiVersion', lock.packAbiVersion],
    ['runtimeAbiVersion', lock.runtimeAbiVersion],
    ['schemaHash', ELYSIUM_COMPILER_CAPABILITY_SOURCE.schemaHash],
  ]) {
    if (expected && metadata[field] !== expected) {
      failures.push(`${field}: expected ${expected}, got ${metadata[field]}`);
    }
  }

  if (failures.length > 0) {
    mismatches.push(`${candidate}: ${failures.join('; ')}`);
    continue;
  }

  const capabilityAbiFailures = validateElysiumCompilerCapabilityAbi(catalog.abi);
  if (capabilityAbiFailures.length > 0) {
    mismatches.push(`${candidate}: compiler capability ABI mismatch: ${capabilityAbiFailures.join('; ')}`);
    continue;
  }

  const commandSurface = verifyCommandSurface(candidate);
  if (!commandSurface.ok) {
    mismatches.push(`${candidate}: missing required command surface: ${commandSurface.failures.join('; ')}`);
    continue;
  }

  selected = candidate;
  selectedCatalog = catalog;
  selectedMetadata = metadata;
  selectedCommands = commandSurface.commands;
  break;
}

if (!selected) {
  fail(`no compiler candidate satisfied the lock contract. ${mismatches.join(' | ')}`);
}

const report = {
  status: 'ok',
  compiler: selected,
  lockPath,
  metadata: selectedMetadata,
  commands: selectedCommands,
  abi: selectedCatalog?.abi,
};
if (json) console.log(JSON.stringify(report, null, 2));
else console.log(selected);
