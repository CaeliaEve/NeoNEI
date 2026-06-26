import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const gate = args.includes('--gate');

const runtimeRoots = ['frontend/src', 'backend/src'].map((entry) => join(repoRoot, entry));
const retiredCompilerSource = join(repoRoot, 'tools', 'neonei-compiler-rs');

const allowedRuntimeRawExportFiles = new Set([
  'backend/src/services/ecosystem.service.ts',
]);

const requiredFiles = [
  'scripts/finalize-native-ui-export.mjs',
  'scripts/ensure-elysium-compiler.mjs',
  'tools/elysium-compiler/elysium-compiler.lock.json',
  'backend/src/config/runtime-paths.ts',
  'backend/src/services/ui-template-catalog.service.ts',
  'backend/src/services/ui-template-binding-index.service.ts',
  'backend/src/services/ui-family-census.service.ts',
];

const requiredSnippets = [
  {
    file: 'scripts/finalize-native-ui-export.mjs',
    snippets: [
      '--compiler <path>',
      'NEONEI_COMPILER_BIN',
      "mode: 'pinned-external-binary'",
      "mode: 'explicit-external-binary'",
      "'compile', '--input'",
      'scripts/ensure-elysium-compiler.mjs',
    ],
  },
  {
    file: 'scripts/ensure-elysium-compiler.mjs',
    snippets: [
      'elysium-compiler.lock.json',
      'sha256',
      'rawExportSchemaVersion',
      'compiledDistSchemaVersion',
      "['schemas']",
    ],
  },
  {
    file: 'backend/src/config/runtime-paths.ts',
    snippets: [
      'DIST_DATA_DIR',
      "'rust', 'ui-pack', 'ui_template_catalog.json'",
      "'rust', 'ui-pack', 'ui_template_binding_index.json'",
      "'rust', 'ui-pack', 'ui_family_census.json'",
    ],
  },
  {
    file: 'backend/src/services/ui-template-binding-index.service.ts',
    snippets: [
      'NESQL_UI_TEMPLATE_BINDING_INDEX_FILE',
      'readCompiledBindingIndex',
      'getCompiledBindingReport',
    ],
  },
];

const forbiddenRuntimePatterns = [
  {
    code: 'RETIRED_COMPILER_SOURCE_PATH_IN_RUNTIME',
    pattern: /tools[\\/]neonei-compiler-rs|neonei-compiler-rs/g,
    message: 'runtime code must not reference the retired in-repo compiler source path',
  },
  {
    code: 'COMPILER_FIXTURE_PATH_IN_RUNTIME',
    pattern: /raw-export-(minimal|native-ui-gt|semantic-background-only|sharded-recipes|texture-atlas|missing-background-should-fail)/g,
    message: 'runtime code must not reference compiler fixtures',
  },
  {
    code: 'RAW_EXPORT_DIRECTORY_IN_RUNTIME',
    pattern: /raw-export[\\/]/g,
    message: 'runtime code must consume compiled dist-data, not raw-export directory paths',
  },
  {
    code: 'RUST_CARGO_MANIFEST_IN_RUNTIME',
    pattern: /Cargo\.toml/g,
    message: 'runtime code must not invoke or inspect compiler Cargo manifests',
  },
];

function listFiles(root) {
  if (!existsSync(root)) return [];
  const pending = [root];
  const files = [];
  while (pending.length > 0) {
    const current = pending.pop();
    for (const name of readdirSync(current)) {
      const absolute = join(current, name);
      const stat = statSync(absolute);
      if (stat.isDirectory()) {
        if (name === 'node_modules' || name === 'dist' || name === '.git') continue;
        pending.push(absolute);
      } else if (/\.(ts|tsx|vue|js|mjs|cjs)$/.test(name)) {
        files.push(absolute);
      }
    }
  }
  return files;
}

function repoRelative(path) {
  return relative(repoRoot, path).replaceAll('\\', '/');
}

function readRepoFile(relativePath) {
  return readFileSync(join(repoRoot, relativePath), 'utf8');
}

function scanRuntimeBoundaries() {
  const failures = [];
  for (const file of runtimeRoots.flatMap(listFiles)) {
    const relativePath = repoRelative(file);
    const text = readFileSync(file, 'utf8');
    for (const rule of forbiddenRuntimePatterns) {
      if (rule.code === 'RAW_EXPORT_DIRECTORY_IN_RUNTIME' && allowedRuntimeRawExportFiles.has(relativePath)) {
        continue;
      }
      const matches = [...text.matchAll(rule.pattern)];
      for (const match of matches) {
        const line = text.slice(0, match.index).split(/\r?\n/).length;
        failures.push({ code: rule.code, file: relativePath, line, message: rule.message, match: match[0] });
      }
    }
  }
  return failures;
}

function verifyRequiredContracts() {
  const failures = [];
  if (existsSync(retiredCompilerSource)) {
    failures.push({
      code: 'IN_REPO_COMPILER_SOURCE_RECREATED',
      file: 'tools/neonei-compiler-rs',
      message: 'retired in-repo compiler source path must not exist; use pinned tools/elysium-compiler binary or elysium-compiler repo',
    });
  }
  for (const relativePath of requiredFiles) {
    if (!existsSync(join(repoRoot, relativePath))) {
      failures.push({ code: 'REQUIRED_FILE_MISSING', file: relativePath, message: 'required external compiler boundary file is missing' });
    }
  }
  for (const requirement of requiredSnippets) {
    if (!existsSync(join(repoRoot, requirement.file))) continue;
    const text = readRepoFile(requirement.file);
    for (const snippet of requirement.snippets) {
      if (!text.includes(snippet)) {
        failures.push({
          code: 'REQUIRED_CONTRACT_SNIPPET_MISSING',
          file: requirement.file,
          message: `required external compiler boundary snippet is missing: ${snippet}`,
        });
      }
    }
  }
  return failures;
}

const runtimeFailures = scanRuntimeBoundaries();
const contractFailures = verifyRequiredContracts();
const failures = [...runtimeFailures, ...contractFailures];
const report = {
  schemaVersion: 'neonei/compiler-decoupling-gate/v2',
  generatedAt: new Date().toISOString(),
  status: failures.length === 0 ? 'passed' : 'failed',
  runtimeRoots: runtimeRoots.map(repoRelative),
  allowedRuntimeRawExportFiles: Array.from(allowedRuntimeRawExportFiles),
  retiredCompilerSource: repoRelative(retiredCompilerSource),
  checks: {
    runtimeForbiddenReferences: runtimeFailures.length,
    requiredContractFailures: contractFailures.length,
  },
  failures,
};

console.log(JSON.stringify(report, null, 2));
if (gate && failures.length > 0) process.exit(1);
