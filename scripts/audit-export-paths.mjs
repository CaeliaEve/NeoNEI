import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, relative, extname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGunzip } from 'node:zlib';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const selfTest = args.includes('--self-test');
const inputArg = readArg('--input');
const maxBytes = Number(readArg('--max-bytes') ?? 256 * 1024 * 1024);

const deniedPatterns = [
  { name: 'windows-backslash-absolute', pattern: /(^|[\s"'`([{:=,])[A-Za-z]:\\[A-Za-z0-9._ -]/ },
  { name: 'windows-slash-absolute', pattern: /(^|[\s"'`([{:=,])[A-Za-z]:\/[A-Za-z0-9._ -]/ },
  { name: 'minecraft-version-path', pattern: /\.minecraft[\\/]versions/i },
  { name: 'local-gtnh-path', pattern: /[A-Za-z]:[\\/]GTNH/i },
  { name: 'local-codex-path', pattern: /[A-Za-z]:[\\/]codex/i },
  { name: 'linux-home-absolute', pattern: /(^|[\s"'`([{:=,])\/(?:home|Users|mnt|opt|srv)\// },
];

const runtimeExtensions = new Set(['.json', '.jsonl']);
const diagnosticPathPattern = /(^|[\\/])(?:validation|diagnostics?|logs?)([\\/]|$)|(?:report|diagnostic|log)\.jsonl?$/i;

function readArg(name) {
  const prefix = `${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1];
  return undefined;
}

function readJson(filePath) {
  if (!existsSync(filePath)) return null;
  return JSON.parse(stripUtf8Bom(readFileSync(filePath, 'utf8')));
}

function stripUtf8Bom(text) {
  return `${text ?? ''}`.replace(/^\uFEFF/, '');
}

function toPosix(pathText) {
  return pathText.replace(/\\/g, '/');
}

function isDiagnosticPath(filePath, inputDir) {
  return diagnosticPathPattern.test(toPosix(relative(inputDir, filePath))) || diagnosticPathPattern.test(toPosix(filePath));
}

function resolveInside(baseDir, relativePath) {
  const text = `${relativePath ?? ''}`.trim();
  if (!text) return null;
  if (isAbsolute(text) || /^[A-Za-z]:[\\/]/.test(text)) {
    return { filePath: resolve(text), declarationViolation: text };
  }
  return { filePath: resolve(baseDir, text), declarationViolation: null };
}

function collectDeclaredFiles(inputDir, manifest) {
  const files = new Set();
  const declarationViolations = [];
  files.add(resolve(inputDir, 'manifest.json'));

  for (const [logicalName, declaredPath] of Object.entries(manifest?.files ?? {})) {
    const resolved = resolveInside(inputDir, declaredPath);
    if (!resolved) continue;
    const filePath = resolved.filePath;
    if (resolved.declarationViolation && !/report|diagnostic|log|validation/i.test(logicalName)) {
      declarationViolations.push({ logicalName, declaredPath: resolved.declarationViolation });
    }
    if (!/report|diagnostic|log|validation/i.test(logicalName)) {
      files.add(filePath);
    }
  }

  const canonicalRepository = manifest?.files?.canonicalRepository;
  const canonicalResolved = resolveInside(inputDir, canonicalRepository);
  const canonicalDir = canonicalResolved?.filePath ? dirname(canonicalResolved.filePath) : resolve(inputDir, 'canonical');
  if (existsSync(canonicalDir)) {
    for (const entry of readdirSync(canonicalDir, { withFileTypes: true })) {
      if (entry.isFile() && runtimeExtensions.has(extname(entry.name))) {
        files.add(resolve(canonicalDir, entry.name));
      }
    }
  }

  for (const relRoot of ['facts', 'assets', 'special', 'models']) {
    const root = resolve(inputDir, relRoot);
    if (existsSync(root)) {
      for (const filePath of walkRuntimeFiles(root)) files.add(filePath);
    }
  }

  return { files: [...files], declarationViolations };
}

function* walkRuntimeFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkRuntimeFiles(full);
    } else if (entry.isFile() && runtimeExtensions.has(extname(entry.name))) {
      yield full;
    }
  }
}

async function scanFile(filePath, inputDir) {
  if (!existsSync(filePath) || isDiagnosticPath(filePath, inputDir)) return [];
  if (!statSync(filePath).isFile()) return [];
  const violations = [];
  const rawStream = createReadStream(filePath, {
    highWaterMark: Math.max(64 * 1024, Math.min(maxBytes, 1024 * 1024)),
  });
  const stream = filePath.endsWith('.gz') ? rawStream.pipe(createGunzip()) : rawStream;
  stream.setEncoding('utf8');
  let carry = '';
  let lineNumber = 1;
  const scanText = (text, line) => {
    for (const denied of deniedPatterns) {
      if (denied.pattern.test(text)) {
        violations.push({ file: filePath, line, rule: denied.name, text: text.trim().slice(0, 260) });
      }
    }
  };

  try {
    for await (const chunk of stream) {
      const text = carry + chunk;
      scanText(text, lineNumber);
      lineNumber += (chunk.match(/\n/g) ?? []).length;
      carry = text.slice(-512);
    }
  } finally {
    stream.destroy();
    rawStream.destroy();
  }
  return violations;
}

async function auditExport(inputDir) {

  const manifest = readJson(resolve(inputDir, 'manifest.json'));
  const { files, declarationViolations } = collectDeclaredFiles(inputDir, manifest);
  const violations = [];
  for (const violation of declarationViolations) {
    violations.push({ file: 'manifest.json', line: 0, rule: 'absolute-runtime-file-declaration', text: `${violation.logicalName}: ${violation.declaredPath}` });
  }
  for (const filePath of files) violations.push(...await scanFile(filePath, inputDir));
  return {
    schemaVersion: 'neonei/export-path-hygiene-report/v1',
    inputDir: '<raw-export>',
    auditedFiles: files.filter((filePath) => existsSync(filePath) && statSync(filePath).isFile() && !isDiagnosticPath(filePath, inputDir)).length,
    status: violations.length === 0 ? 'ok' : 'failed',
    violations: violations.map((violation) => ({
      ...violation,
      file: violation.file === 'manifest.json' ? violation.file : toPosix(relative(inputDir, violation.file)),
    })),
  };
}

function createSelfTestExport(root, bad = false) {
  mkdirSync(join(root, 'facts'), { recursive: true });
  mkdirSync(join(root, 'validation'), { recursive: true });
  mkdirSync(join(root, 'canonical'), { recursive: true });
  writeFileSync(join(root, 'manifest.json'), `${bad ? '\uFEFF' : ''}${JSON.stringify({
    schemaVersion: 'nesqlpp/raw-export/alpha1',
    files: { items: 'facts/items.jsonl', exportReport: 'validation/export_report.json' },
  }, null, 2)}`);
  const item = bad
    ? { itemId: 'bad', imagePath: ['E:', 'GTNH', '.minecraft', 'versions', 'GT New Horizons 2.8.4', 'image', 'item', 'bad.png'].join('/') }
    : { itemId: 'good', imagePath: 'image/item/good.png' };
  writeFileSync(join(root, 'facts/items.jsonl'), `${JSON.stringify(item)}\n`, 'utf8');
  writeFileSync(join(root, 'canonical/repository.json'), JSON.stringify({ note: 'escaped quote ' + 'i:' + '\" should not look like a Windows path' }), 'utf8');
  writeFileSync(join(root, 'validation/export_report.json'), JSON.stringify({ diagnosticPath: ['E:', 'GTNH', 'allowed', 'in', 'diagnostics'].join('/') }), 'utf8');
}

async function runSelfTest() {
  const root = resolve(repoRoot, '.tmp-runtime', 'export-path-hygiene-self-test');
  rmSync(root, { recursive: true, force: true });
  const good = join(root, 'good');
  const bad = join(root, 'bad');
  createSelfTestExport(good, false);
  createSelfTestExport(bad, true);
  const goodReport = await auditExport(good);
  const badReport = await auditExport(bad);
  if (goodReport.status !== 'ok') throw new Error(`Expected good export to pass: ${JSON.stringify(goodReport.violations)}`);
  if (badReport.status !== 'failed' || badReport.violations.length === 0) throw new Error('Expected bad export to fail path hygiene audit');
  console.log(JSON.stringify({ schemaVersion: 'neonei/export-path-hygiene-self-test/v1', status: 'ok', good: goodReport, badViolationCount: badReport.violations.length }, null, 2));
}

if (selfTest) {
  await runSelfTest();
} else if (!inputArg) {
  console.error('Usage: node scripts/audit-export-paths.mjs --input <raw-export> [--max-bytes <bytes>]');
  process.exit(2);
} else {
  const report = await auditExport(resolve(inputArg));
  console.log(JSON.stringify(report, null, 2));
  if (report.status !== 'ok') process.exit(1);
}

