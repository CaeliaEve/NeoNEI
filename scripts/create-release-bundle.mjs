import { existsSync, mkdirSync, cpSync, rmSync, writeFileSync, statSync, readdirSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const outputDir = resolve(process.argv[2] || join(repoRoot, 'release', 'neonei-web'));

const inputs = [
  { key: 'frontendDist', source: join(repoRoot, 'frontend', 'dist'), target: 'frontend' },
  { key: 'backendDist', source: join(repoRoot, 'backend', 'dist'), target: 'backend' },
  { key: 'runtimeContracts', source: join(repoRoot, 'contracts', 'runtime'), target: join('contracts', 'runtime') },
];

function normalizePathForWindows(value) {
  return value.replace(/^\/([A-Za-z]:\/)/, '$1');
}

function listFiles(root, base = root) {
  if (!existsSync(root)) return [];
  const entries = readdirSync(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(fullPath, base));
    } else if (entry.isFile()) {
      files.push({
        path: relative(base, fullPath).replace(/\\/g, '/'),
        bytes: statSync(fullPath).size,
      });
    }
  }
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

function hashManifest(files) {
  const hash = createHash('sha256');
  for (const file of files) {
    hash.update(file.path);
    hash.update('\0');
    hash.update(String(file.bytes));
    hash.update('\n');
  }
  return hash.digest('hex');
}

const normalizedOutputDir = normalizePathForWindows(outputDir);
rmSync(normalizedOutputDir, { recursive: true, force: true });
mkdirSync(normalizedOutputDir, { recursive: true });

const copied = [];
const missing = [];
for (const input of inputs) {
  if (!existsSync(input.source)) {
    missing.push({ key: input.key, source: relative(repoRoot, input.source).replace(/\\/g, '/') });
    continue;
  }
  const targetPath = join(normalizedOutputDir, input.target);
  mkdirSync(targetPath, { recursive: true });
  cpSync(input.source, targetPath, { recursive: true });
  copied.push({
    key: input.key,
    source: relative(repoRoot, input.source).replace(/\\/g, '/'),
    target: input.target.replace(/\\/g, '/'),
  });
}

const files = listFiles(normalizedOutputDir);
const manifest = {
  schemaVersion: 'neonei/release-bundle/current',
  generatedAt: new Date().toISOString(),
  copied,
  missing,
  fileCount: files.length,
  totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
  contentHash: hashManifest(files),
  files,
};

writeFileSync(join(normalizedOutputDir, 'release-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
if (missing.length > 0) {
  console.error(`[release-bundle] missing required inputs: ${missing.map((entry) => entry.key).join(', ')}`);
  process.exitCode = 1;
} else {
  console.log(`[release-bundle] wrote ${normalizedOutputDir}`);
  console.log(`[release-bundle] files=${manifest.fileCount} bytes=${manifest.totalBytes} hash=${manifest.contentHash}`);
}
