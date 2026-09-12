import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (process.argv.length > 3) throw new Error('Usage: node scripts/release.mjs [output-directory]');
const target = path.resolve(process.argv[2] || path.join(root, 'release', 'neonei-web'));
if (fs.existsSync(target)) throw new Error('Release directory already exists: ' + target);
const backend = JSON.parse(fs.readFileSync(path.join(root, 'backend/package.json'), 'utf8'));
const frontend = JSON.parse(fs.readFileSync(path.join(root, 'frontend/package.json'), 'utf8'));
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'catalog/package.json'), 'utf8'));
const contract = backend.dependencies['@elysium/contracts'];
if (!/^file:\.\.\/vendor\/[a-z0-9.-]+\.tgz$/.test(contract)
  || contract !== frontend.dependencies['@elysium/contracts'] || contract !== catalog.dependencies['@elysium/contracts']) {
  throw new Error('All workspaces must pin the same vendored contract');
}
const sources = [];
function visit(directory, workspace) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error('Release sources must not be links');
    if (entry.isDirectory()) visit(file, workspace);
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      const compiled = workspace + '/dist/' + path.relative(path.join(root, workspace, 'src'), file).replaceAll(path.sep, '/').replace(/\.ts$/, '.js');
      sources.push(compiled);
      if (workspace === 'catalog') sources.push(compiled.replace(/\.js$/, '.d.ts'));
    }
  }
}
visit(path.join(root, 'backend/src'), 'backend');
visit(path.join(root, 'catalog/src'), 'catalog');
const files = [...sources, 'package.json', 'package-lock.json', 'catalog/package.json', 'backend/package.json', 'frontend/package.json',
  contract.slice('file:../'.length), '.env.example', 'README.md', 'docs/refactor.md'];
for (const file of [...files, 'frontend/dist/index.html', 'frontend/dist/sw.js']) {
  if (!fs.statSync(path.join(root, file)).isFile()) throw new Error('Build output is missing: ' + file);
}
fs.mkdirSync(target, { recursive: true });
for (const file of files) {
  const destination = path.join(target, file);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(path.join(root, file), destination, fs.constants.COPYFILE_EXCL);
}
fs.cpSync(path.join(root, 'frontend/dist'), path.join(target, 'frontend/dist'), { recursive: true });
fs.writeFileSync(path.join(target, 'START.md'), '# Run NeoNEI\n\nInstall Node.js 24. Run `npm ci --omit=dev --workspace catalog --workspace backend`, set NEONEI_CATALOG_ROOT to a compiled catalog, then run `npm start`. The default address is http://127.0.0.1:3002.\n\nOffline libraries require HTTPS or localhost. Open Offline Library and save a complete copy before disconnecting.\n');
const manifest = [];
function describe(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) describe(file);
    else if (entry.isFile()) {
      const bytes = fs.readFileSync(file);
      manifest.push({ path: path.relative(target, file).replaceAll(path.sep, '/'), bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
    } else throw new Error('Unexpected release entry: ' + file);
  }
}
describe(target);
fs.writeFileSync(path.join(target, 'files.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ path: target, modules: sources.length }));
