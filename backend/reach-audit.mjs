import fs from 'fs';
import path from 'path';

const SRC = 'E:/codex/ae2/NeoNEI/backend/src';
const files = [];
function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name).split(path.sep).join('/');
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.ts')) files.push(p);
  }
}
walk(SRC);

const imports = new Map();
const rev = new Map();
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const set = new Set();
  const re = /(?:from\s+|import\s*\(\s*|require\s*\(\s*)['"](\.[^'"]+)['"]/g;
  let m;
  while ((m = re.exec(src))) {
    const base = path.resolve(path.dirname(f), m[1]).split(path.sep).join('/');
    for (const c of [base + '.ts', base + '/index.ts', base]) {
      if (files.includes(c)) { set.add(c); break; }
    }
  }
  imports.set(f, set);
  for (const t of set) {
    if (!rev.has(t)) rev.set(t, new Set());
    rev.get(t).add(f);
  }
}

function bfs(roots) {
  const seen = new Set();
  const q = [...roots];
  while (q.length) {
    const f = q.pop();
    if (seen.has(f)) continue;
    seen.add(f);
    for (const t of imports.get(f) || []) if (!seen.has(t)) q.push(t);
  }
  return seen;
}

const roots = [SRC + '/server.ts', SRC + '/bootstrap-server.ts', SRC + '/app.ts'].filter(f => files.includes(f));
const reachable = bfs(roots);
const scriptRoots = files.filter(f => f.includes('/scripts/'));
const scriptReach = bfs(scriptRoots);

const LC = new Map(files.map(f => [f, fs.readFileSync(f, 'utf8').split('\n').length]));
const lines = f => LC.get(f);
const rel = f => f.replace(SRC + '/', '');
const sum = arr => arr.reduce((a, f) => a + lines(f), 0);

console.log('TOTAL TS FILES:', files.length, 'LINES:', sum(files));
console.log('REACHABLE FROM SERVER:', reachable.size, 'LINES:', sum([...reachable]));
const orphans = files.filter(f => !reachable.has(f));
console.log('NOT REACHABLE FROM SERVER:', orphans.length, 'LINES:', sum(orphans));

const scriptOnly = orphans.filter(f => scriptReach.has(f) && !f.includes('/scripts/'));
const inScripts = orphans.filter(f => f.includes('/scripts/'));
const totallyDead = orphans.filter(f => !scriptReach.has(f) && !f.includes('/scripts/'));

console.log('\n-- TOTALLY DEAD (not reachable from server nor scripts) --', totallyDead.length, 'files,', sum(totallyDead), 'lines');
for (const f of totallyDead.sort((a, b) => lines(b) - lines(a)))
  console.log(String(lines(f)).padStart(6), rel(f), '|| importers:', [...(rev.get(f) || [])].map(rel).join(', ') || 'NONE');

console.log('\n-- SCRIPT-ONLY (only reachable via src/scripts) --', scriptOnly.length, 'files,', sum(scriptOnly), 'lines');
for (const f of scriptOnly.sort((a, b) => lines(b) - lines(a)))
  console.log(String(lines(f)).padStart(6), rel(f), '|| importers:', [...(rev.get(f) || [])].map(rel).join(', '));

console.log('\n-- FILES IN src/scripts --', inScripts.length, 'files,', sum(inScripts), 'lines');
for (const f of inScripts.sort((a, b) => lines(b) - lines(a))) console.log(String(lines(f)).padStart(6), rel(f));

console.log('\n=== REACHABLE SERVICES (from server) with importer counts ===');
const reachSvc = [...reachable].filter(f => f.includes('/services/')).sort((a, b) => lines(b) - lines(a));
console.log('count:', reachSvc.length, 'lines:', sum(reachSvc));
for (const f of reachSvc)
  console.log(String(lines(f)).padStart(6), rel(f), '|| importers:', [...(rev.get(f) || [])].filter(x => reachable.has(x)).map(rel).join(', '));

fs.writeFileSync('E:/codex/ae2/NeoNEI/backend/reach-graph.json', JSON.stringify({
  files: files.map(rel),
  reachable: [...reachable].map(rel),
  imports: Object.fromEntries([...imports].map(([k, v]) => [rel(k), [...v].map(rel)])),
  rev: Object.fromEntries([...rev].map(([k, v]) => [rel(k), [...v].map(rel)])),
  lines: Object.fromEntries([...LC].map(([k, v]) => [rel(k), v])),
}, null, 1));
