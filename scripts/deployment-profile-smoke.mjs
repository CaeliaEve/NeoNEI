import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = {
  compose: path.join(repoRoot, 'docker-compose.yml'),
  systemd: path.join(repoRoot, 'deploy/systemd/neonei-backend.service.example'),
  nginx: path.join(repoRoot, 'deploy/nginx/neonei-public-runtime.conf.example'),
  readme: path.join(repoRoot, 'deploy/README.md'),
};

for (const [name, filePath] of Object.entries(files)) {
  assert.equal(existsSync(filePath), true, `missing deployment profile file: ${name}`);
}

const contents = Object.fromEntries(
  Object.entries(files).map(([name, filePath]) => [name, readFileSync(filePath, 'utf8')]),
);

assert.match(contents.systemd, /NEONEI_PUBLIC_RUNTIME_ONLY=1/, 'systemd profile should run public runtime only');
assert.match(contents.systemd, /NESQL_EXPORT_ROOT=\/srv\/neonei\/exports\/current/, 'systemd profile should use portable Linux export path');
assert.match(contents.nginx, /location \/dist-data\//, 'nginx profile should serve dist-data statically');
assert.match(contents.nginx, /location \/canonical\//, 'nginx profile should serve canonical assets statically');
assert.match(contents.nginx, /max-age=31536000, immutable/, 'nginx profile should mark runtime artifacts immutable');
assert.match(contents.readme, /public requests should read already-published runtime artifacts/i, 'deployment readme should state no GTNH game directory on request hot path');
assert.match(contents.compose, /\.\/deploy\/data:\/app\/data/, 'docker compose should use project-relative data volume');

for (const [name, text] of Object.entries(contents)) {
  assert.doesNotMatch(text, /(^|[\s\"'`([{:=,])[A-Za-z]:[\\/][A-Za-z0-9._ -]/, `${name} should not contain local absolute Windows paths`);
  assert.doesNotMatch(text, /\.minecraft[\\/]versions/i, `${name} should not depend on a GTNH game directory`);
}

console.log(JSON.stringify({
  schemaVersion: 'neonei/deployment-profile-smoke/v1',
  status: 'ok',
  files: Object.keys(files),
}, null, 2));
