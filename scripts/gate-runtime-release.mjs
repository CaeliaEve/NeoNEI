import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const frontendDir = path.join(repoRoot, 'frontend');
const backendDir = path.join(repoRoot, 'backend');
const selfTestDistDataDir = path.join(repoRoot, '.tmp-runtime', 'dist-data-v3-self-test');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const node = process.execPath;
function runStep(step) {
  if (process.platform === 'win32') {
    return spawnSync('cmd.exe', ['/d', '/s', '/c', step.command, ...step.args], {
      cwd: step.cwd,
      stdio: 'inherit',
      shell: false,
      env: { ...process.env, ...(step.env ?? {}) },
    });
  }

  return spawnSync(step.command, step.args, {
    cwd: step.cwd,
    stdio: 'inherit',
    shell: false,
    env: { ...process.env, ...(step.env ?? {}) },
  });
}
const steps = [
  { name: 'frontend typecheck', cwd: frontendDir, command: npm, args: ['run', 'typecheck'] },
  { name: 'frontend build', cwd: frontendDir, command: npm, args: ['run', 'build'] },
  { name: 'backend build', cwd: backendDir, command: npm, args: ['run', 'build'] },
  { name: 'public runtime profile regression', cwd: backendDir, command: npm, args: ['run', 'test:public-runtime-profile'] },
  { name: 'current API contract regression', cwd: backendDir, command: npm, args: ['run', 'test:current-api-contract'] },
  { name: 'publish compression sidecar regression', cwd: backendDir, command: npm, args: ['run', 'test:publish-compression-sidecar'] },
  { name: 'path portability audit', cwd: frontendDir, command: npm, args: ['run', 'audit:paths'] },
  { name: 'path portability URL regression', cwd: frontendDir, command: npm, args: ['run', 'test:path-portability-urls'] },
  { name: 'runtime diagnostics regression', cwd: frontendDir, command: npm, args: ['run', 'test:runtime-diagnostics'] },
  { name: 'runtime type boundary regression', cwd: frontendDir, command: npm, args: ['run', 'test:runtime-type-boundary'] },
  { name: 'runtime release gate regression', cwd: frontendDir, command: npm, args: ['run', 'test:runtime-release-gate'] },
  { name: 'runtime contract portability regression', cwd: frontendDir, command: npm, args: ['run', 'test:runtime-contract-portability'] },
  { name: 'raw export compiler portability self-test', cwd: frontendDir, command: npm, args: ['run', 'test:raw-export'] },
  { name: 'rust runtime retirement gate', cwd: frontendDir, command: npm, args: ['run', 'test:rust-retirement'] },
  { name: 'native render smoke', cwd: frontendDir, command: npm, args: ['run', 'validate:native-render'] },
  { name: 'raw export path hygiene self-test', cwd: frontendDir, command: npm, args: ['run', 'test:export-paths'] },
  { name: 'deployment profile smoke', cwd: frontendDir, command: npm, args: ['run', 'test:deployment-profile'] },
  { name: 'canonical retirement gate', cwd: frontendDir, command: npm, args: ['run', 'test:canonical-retired'] },
  { name: 'API/runtime audit gate', cwd: frontendDir, command: npm, args: ['run', 'audit:api-runtime:gate'] },
  { name: 'recipe handler metadata gate', cwd: frontendDir, command: npm, args: ['run', 'validate:recipe-handlers'] },
  { name: 'recipe fragmentation gate', cwd: frontendDir, command: npm, args: ['run', 'validate:recipe-fragmentation'] },
  { name: 'runtime contract validation', cwd: frontendDir, command: npm, args: ['run', 'validate:runtime-contracts'] },
  { name: 'semantic runtime validation', cwd: frontendDir, command: npm, args: ['run', 'validate:semantic-runtime'] },
  { name: 'native runtime pack schema gate', cwd: frontendDir, command: npm, args: ['run', 'test:native-runtime-packs'] },
  { name: 'native runtime projection gate', cwd: frontendDir, command: npm, args: ['run', 'test:native-runtime-projection'] },
  { name: 'native surface worker group gate', cwd: frontendDir, command: npm, args: ['run', 'test:native-surface-worker-groups'] },
  { name: 'native surface batching gate', cwd: frontendDir, command: npm, args: ['run', 'test:native-surface-batching'] },
  { name: 'WASM engine gate', cwd: frontendDir, command: npm, args: ['run', 'test:wasm-engine'] },
  { name: 'runtime v3 regression', cwd: frontendDir, command: npm, args: ['run', 'validate:runtime-v3'] },
  { name: 'browser page v3 smoke', cwd: frontendDir, command: npm, args: ['run', 'validate:browser-pages-v3'] },
  { name: 'browser E2E Gate C', cwd: frontendDir, command: npm, args: ['run', 'gate:c'] },
  { name: 'browser v3 bench', cwd: frontendDir, command: npm, args: ['run', 'bench:browser-v3'] },
  { name: 'search v3 bench', cwd: frontendDir, command: npm, args: ['run', 'bench:search-v3'] },
  { name: 'recipe v3 bench', cwd: frontendDir, command: npm, args: ['run', 'bench:recipe-v3'] },
  { name: 'browser atlas v3 bench', cwd: frontendDir, command: npm, args: ['run', 'bench:browser-atlas-v3'] },
];

const quick = process.argv.includes('--quick');
const selected = quick
  ? steps.filter((step) => !step.name.includes('bench') && !step.name.includes('E2E') && step.name !== 'runtime v3 regression')
  : steps;
const selectedWithModeOverrides = selected.map((step) => {
  if (!quick) return step;
  if (step.name === 'runtime contract validation') {
    return {
      ...step,
      command: node,
      args: [
        path.join(repoRoot, 'scripts', 'validate-runtime-contracts.mjs'),
        '--gate',
        '--dist-data',
        selfTestDistDataDir,
      ],
    };
  }
  if (step.name === 'browser page v3 smoke') {
    return {
      ...step,
      env: {
        DIST_DATA_V3_DIR: selfTestDistDataDir,
        BROWSER_PAGE_SMOKE_PAGES: '1,last',
        BROWSER_PAGE_SMOKE_SEARCHES: 'iron',
      },
    };
  }
  return step;
});

const startedAt = Date.now();
const results = [];
for (const step of selectedWithModeOverrides) {
  const stepStartedAt = Date.now();
  console.log(`\n[gate:runtime] ${step.name}`);
  const result = runStep(step);
  const durationMs = Date.now() - stepStartedAt;
  results.push({ name: step.name, exitCode: result.status ?? 1, durationMs });
  if ((result.status ?? 1) !== 0) {
    console.error(`\n[gate:runtime] FAILED: ${step.name} (${durationMs}ms)`);
    process.exit(result.status ?? 1);
  }
}

console.log('\n[gate:runtime] OK');
console.log(JSON.stringify({
  schemaVersion: 'neonei/runtime-release-gate/v1',
  mode: process.argv.includes('--quick') ? 'quick' : 'full',
  durationMs: Date.now() - startedAt,
  results,
}, null, 2));

