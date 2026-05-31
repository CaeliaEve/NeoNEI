import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const gateSource = fs.readFileSync(path.join(repoRoot, 'scripts/gate-runtime-release.mjs'), 'utf8')
  .replace(/\r\n/g, '\n');

function hasStep(name, command) {
  return gateSource.includes(`name: '${name}'`) && gateSource.includes(command);
}

test('runtime release gate blocks malformed or non-portable release artifacts', () => {
  assert.equal(
    hasStep('runtime contract validation', "args: ['run', 'validate:runtime-contracts']"),
    true,
    'release gate must validate dist-data manifest and runtime payload contracts',
  );
  assert.equal(
    hasStep('runtime v3 regression', "args: ['run', 'validate:runtime-v3']"),
    true,
    'full release gate must validate runtime-v3 artifact shape',
  );
  assert.equal(
    hasStep('raw export path hygiene self-test', "args: ['run', 'test:export-paths']"),
    true,
    'release gate must block machine-specific paths in consumed export payloads',
  );
  assert.equal(
    hasStep('path portability audit', "args: ['run', 'audit:paths']"),
    true,
    'release gate must block source-level hard paths',
  );
  assert.equal(
    hasStep('deployment profile smoke', "args: ['run', 'test:deployment-profile']"),
    true,
    'release gate must verify portable deployment profile behavior',
  );
});

test('runtime release gate keeps publish/cache/API regressions in the quick profile', () => {
  assert.equal(
    hasStep('publish compression sidecar regression', "args: ['run', 'test:publish-compression-sidecar']"),
    true,
    'quick gate must preserve br/gz sidecar and static cache policy coverage',
  );
  assert.equal(
    hasStep('API/runtime audit gate', "args: ['run', 'audit:api-runtime:gate']"),
    true,
    'quick gate must block fallback and legacy dynamic hot-path regressions',
  );
  assert.equal(
    gateSource.includes("? steps.filter((step) => !step.name.includes('bench') && step.name !== 'runtime v3 regression')"),
    true,
    'quick gate should skip only benches and the heavier runtime-v3 regression',
  );
});
