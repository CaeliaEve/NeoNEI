import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const gate = args.includes('--gate');
const skipBuild = args.includes('--skip-build');
const fixture = readArg('--fixture') ?? 'raw-export-native-ui-gt';
const scope = readArg('--scope') ?? 'native-ui';
const cargoToml = join(repoRoot, 'tools', 'neonei-compiler-rs', 'Cargo.toml');
const compilerBin = join(
  repoRoot,
  'tools',
  'neonei-compiler-rs',
  'target',
  'release',
  process.platform === 'win32' ? 'neonei-compiler.exe' : 'neonei-compiler',
);
const rawExport = join(repoRoot, 'tools', 'neonei-compiler-rs', 'fixtures', fixture);

const steps = [];

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

function fail(message) {
  const report = buildReport('failed', message);
  console.log(JSON.stringify(report, null, 2));
  if (gate) process.exit(1);
}

function buildReport(status, message = null, distDataDir = null) {
  return {
    schemaVersion: 'neonei/compiler-extraction-readiness-gate/v1',
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

if (!existsSync(cargoToml)) {
  fail(`compiler Cargo.toml missing: ${cargoToml}`);
} else if (!existsSync(rawExport)) {
  fail(`compiler fixture missing: ${rawExport}`);
} else {
  if (!skipBuild) {
    const build = run('release compiler build', 'cargo', ['build', '--release', '--manifest-path', cargoToml]);
    if (build.status !== 0) {
      fail(`release compiler build failed with exit code ${build.status}`);
    }
  }

  if (!existsSync(compilerBin)) {
    fail(`release compiler binary missing: ${compilerBin}`);
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
}
