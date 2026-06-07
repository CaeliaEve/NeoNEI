import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const checks = [
  {
    file: 'backend/src/routes/static-assets.routes.ts',
    forbidden: ["'/canonical'", '"/canonical"', "'/api/canonical'", '"/api/canonical"', 'NESQL_CANONICAL_DIR'],
  },
  {
    file: 'scripts/start-neonei.mjs',
    forbidden: ['NESQL_CANONICAL_DIR'],
  },
  {
    file: 'scripts/start-neonei.ps1',
    forbidden: ['NESQL_CANONICAL_DIR'],
  },
  {
    file: 'frontend/src/services/api/images.ts',
    forbidden: ['/canonical/${', '`/canonical/', '}/canonical/'],
  },
];

const failures = [];
for (const check of checks) {
  const text = readFileSync(join(root, check.file), 'utf8');
  for (const token of check.forbidden) {
    if (text.includes(token)) {
      failures.push(`${check.file}: still contains ${token}`);
    }
  }
}

const runtimePaths = readFileSync(join(root, 'backend/src/config/runtime-paths.ts'), 'utf8');
if (!runtimePaths.includes("export const NESQL_CANONICAL_DIR = '';")) {
  failures.push('backend/src/config/runtime-paths.ts: NESQL_CANONICAL_DIR must fail closed to an empty string');
}

if (failures.length) {
  console.error('[canonical-retirement] failed');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log('[canonical-retirement] production runtime no longer exposes canonical');
