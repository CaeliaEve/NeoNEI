import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');

const deniedPatterns = [
  { name: 'windows-backslash-absolute', pattern: /(^|[\s"'`([{=])[A-Za-z]:\\/ },
  { name: 'windows-slash-absolute', pattern: /(^|[\s"'`([{=])[A-Za-z]:\// },
  { name: 'minecraft-version-path', pattern: /\.minecraft[\\/]versions/i },
  { name: 'local-gtnh-path', pattern: /E:[\\/]GTNH/i },
  { name: 'local-codex-path', pattern: /E:[\\/]codex/i },
];

const ignoredDirNames = new Set([
  '.git',
  '.omx',
  'node_modules',
  'dist',
  'build',
  '.tmp',
  '.tmp-runtime',
  '.runtime-logs',
  'data',
  'gatec-artifacts-final',
  'test-results',
  'playwright-report',
]);

const sourceExtensions = new Set([
  '.ts', '.tsx', '.js', '.mjs', '.cjs', '.vue', '.json', '.ps1', '.cmd', '.yml', '.yaml', '.env', ''
]);

const allowedPathMatchers = [
  /(^|[\\/])PATH_PORTABILITY_PLAN\.md$/,
  /(^|[\\/])\.env\.example$/,
  /(^|[\\/])docker-compose\.yml$/,
  /(^|[\\/])docker-compose\.example\.yml$/,
  /(^|[\\/])docs[\\/]/,
  /(^|[\\/])omx_wiki[\\/]/,
];

function isAllowedDocumentationPath(filePath) {
  const rel = path.relative(repoRoot, filePath).replace(/\\/g, '/');
  return allowedPathMatchers.some((matcher) => matcher.test(rel));
}

function shouldSkipDir(dirPath) {
  const name = path.basename(dirPath);
  if (ignoredDirNames.has(name)) return true;
  const rel = path.relative(repoRoot, dirPath).replace(/\\/g, '/');
  return rel === 'backend/data' || rel.startsWith('backend/data/') || rel === 'frontend/dist' || rel.startsWith('frontend/dist/');
}

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!shouldSkipDir(full)) yield* walk(full);
      continue;
    }
    if (!entry.isFile()) continue;
    if (entry.name === 'package-lock.json') continue;
    if (!sourceExtensions.has(path.extname(entry.name))) continue;
    yield full;
  }
}

const violations = [];
for (const filePath of walk(repoRoot)) {
  if (isAllowedDocumentationPath(filePath)) continue;
  const rel = path.relative(repoRoot, filePath).replace(/\\/g, '/');
  const text = fs.readFileSync(filePath, 'utf8');
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const denied of deniedPatterns) {
      if (denied.pattern.test(line)) {
        violations.push({ file: rel, line: index + 1, rule: denied.name, text: line.trim() });
      }
    }
  });
}

if (violations.length) {
  console.error('[audit:paths] Machine-specific paths are not allowed in portable source files.');
  for (const violation of violations.slice(0, 80)) {
    console.error(`${violation.file}:${violation.line} [${violation.rule}] ${violation.text}`);
  }
  if (violations.length > 80) {
    console.error(`... ${violations.length - 80} more violation(s)`);
  }
  process.exit(1);
}

console.log('[audit:paths] OK: no machine-specific hard paths found in portable source files.');
