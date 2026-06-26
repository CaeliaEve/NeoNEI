import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const gate = args.includes('--gate');
const fixture = readArg('--fixture') ?? 'raw-export-native-ui-gt';
const scope = readArg('--scope') ?? 'native-ui';
const steps = [];
const compilerBin = readArg('--compiler') ?? resolvePinnedCompiler();
const rawExport = resolve(readArg('--raw-export') ?? join(repoRoot, 'tools', 'elysium-compiler', 'fixtures', fixture));


function readArg(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function run(name, command, commandArgs, options = {}) {
  const startedAt = Date.now();
  const result = spawnSync(command, commandArgs, {
    cwd: options.cwd ?? repoRoot,
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
    shell: false,
  });
  const step = {
    name,
    command,
    args: commandArgs,
    status: result.status ?? 1,
    elapsedMs: Date.now() - startedAt,
  };
  if (options.capture) {
    step.stdout = result.stdout ?? '';
    step.stderr = result.stderr ?? '';
  }
  steps.push(step);
  return step;
}

function resolvePinnedCompiler() {
  const step = run('resolve pinned elysium compiler', 'node', ['scripts/ensure-elysium-compiler.mjs'], { capture: true });
  if (step.status !== 0) {
    fail(`pinned compiler resolution failed: ${step.stderr || step.stdout}`);
  }
  return step.stdout.trim();
}

function fail(message) {
  const report = buildReport('failed', message);
  console.log(JSON.stringify(report, null, 2));
  if (gate) process.exit(1);
}

function buildReport(status, message = null, distDataDir = null) {
  return {
    schemaVersion: 'neonei/compiler-extraction-readiness-gate/v2',
    generatedAt: new Date().toISOString(),
    status,
    message,
    fixture,
    scope,
    compilerBin: compilerBin.replaceAll('\\', '/'),
    rawExport: rawExport.replaceAll('\\', '/'),
    distDataDir: distDataDir ? distDataDir.replaceAll('\\', '/') : null,
    steps,
  };
}

if (!existsSync(rawExport)) {
  fail(`compiler fixture missing: ${rawExport}`);
} else if (!existsSync(compilerBin)) {
  fail(`elysium compiler binary missing: ${compilerBin}`);
} else {
  const distDataDir = mkdtempSync(join(tmpdir(), 'neonei-external-compiler-gate-'));
  try {
    const finalizer = run('external compiler finalizer strict compile', 'node', [
      'scripts/finalize-native-ui-export.mjs',
      '--compiler', compilerBin,
      '--raw-export', rawExport,
      '--dist-data', distDataDir,
      '--scope', scope,
    ]);
    if (finalizer.status !== 0) {
      fail(`external compiler finalizer failed with exit code ${finalizer.status}`);
    } else {
      console.log(JSON.stringify(buildReport('passed', null, distDataDir), null, 2));
    }
  } finally {
    rmSync(distDataDir, { recursive: true, force: true });
  }
}
