import { existsSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixture = resolve(process.argv.includes('--fixture') ? process.argv[process.argv.indexOf('--fixture') + 1] : join(repoRoot, 'tools', 'elysium-compiler', 'fixtures', 'raw-export-native-ui-gt'));
const output = resolve(process.argv.includes('--output') ? process.argv[process.argv.indexOf('--output') + 1] : join(repoRoot, '.tmp-runtime', 'elysium-compiler-gate'));
const report = join(output, 'compiler-report.json');
const strict = process.argv.includes('--strict') || process.argv.includes('--gate');

function fail(message) {
  console.error(`[elysium-compiler-gate] ${message}`);
  process.exit(1);
}

function run(command, args, options = {}) {
  console.log(`[elysium-compiler-gate] ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    stdio: options.capture ? 'pipe' : 'inherit',
    encoding: options.capture ? 'utf8' : undefined,
    shell: false,
  });
  if ((result.status ?? 1) !== 0) {
    if (options.capture) {
      console.error(result.stdout ?? '');
      console.error(result.stderr ?? '');
    }
    fail(`${command} ${args.join(' ')} failed with exit code ${result.status ?? 1}`);
  }
  return result;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

const ensure = run('node', ['scripts/ensure-elysium-compiler.mjs', '--json'], { capture: true });
const resolved = JSON.parse(ensure.stdout);
const compiler = resolved.compiler;
if (!compiler || !existsSync(compiler)) fail(`resolved compiler binary does not exist: ${compiler}`);
if (!existsSync(fixture)) fail(`fixture raw export missing: ${fixture}`);
if (existsSync(join(repoRoot, 'tools', 'neonei-compiler-rs'))) {
  fail('in-repo compiler source path has been recreated: tools/neonei-compiler-rs');
}

rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
run(compiler, ['inspect', '--input', fixture, '--report', join(output, 'inspect-report.json')]);
run(compiler, ['validate', '--input', fixture, '--report', join(output, 'validate-report.json')]);
run(compiler, ['schemas', '--output', join(output, 'schema-catalog.json')]);
run(compiler, ['compile', '--input', fixture, '--output', output, '--report', report, '--scope', 'native-ui', ...(strict ? ['--strict'] : [])]);

const runtimeManifest = readJson(join(output, 'rust', 'runtime-manifest.json'));
const distManifest = readJson(join(output, 'manifest.json'));
if (runtimeManifest?.compiler?.name !== 'elysium-compiler') fail('runtime manifest lacks elysium compiler metadata');
if (distManifest?.compiler?.name !== 'elysium-compiler') fail('dist manifest lacks elysium compiler metadata');
if (distManifest?.compiler?.version !== resolved.metadata?.version) fail('dist manifest compiler version mismatch');
if (!existsSync(join(output, 'recipes', 'ui-payload-index.json'))) fail('compiled recipe UI payload index missing');

console.log(JSON.stringify({
  schemaVersion: 'neonei/elysium-compiler-gate/v1',
  status: 'ok',
  compiler,
  fixture: fixture.replaceAll('\\', '/'),
  output: output.replaceAll('\\', '/'),
  compilerMetadata: distManifest.compiler,
}, null, 2));
