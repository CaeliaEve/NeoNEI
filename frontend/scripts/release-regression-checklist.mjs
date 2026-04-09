#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const frontendRoot = resolve(__dirname, '..');

const THRESHOLDS = {
  bench10k: { warn: 31.5, fail: 35 },
  bench50k: { warn: 72, fail: 80 },
};
const npmCommand = 'npm';
const shouldRunGateC = process.env.SKIP_GATE_C !== '1';

const runCommand = ({ label, command, args, env }) => {
  console.log(`\n=== ${label} ===`);
  console.log(`$ ${command} ${args.join(' ')}`);
  const isWindows = process.platform === 'win32';
  const result = isWindows
    ? spawnSync('cmd.exe', ['/d', '/s', '/c', command, ...args], {
      cwd: frontendRoot,
      env: { ...process.env, ...(env || {}) },
      encoding: 'utf8',
      stdio: 'pipe',
    })
    : spawnSync(command, args, {
      cwd: frontendRoot,
      env: { ...process.env, ...(env || {}) },
      encoding: 'utf8',
      stdio: 'pipe',
    });

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
  if (result.error) {
    console.error(`[spawn-error] ${result.error.message}`);
  }

  return result;
};

const parseP95 = (stdout) => {
  const match = stdout.match(/p95_ms:\s*([\d.]+)/);
  if (!match) {
    return null;
  }
  return Number(match[1]);
};

const judgePerf = (value, threshold) => {
  if (value === null || Number.isNaN(value)) {
    return 'FAIL';
  }
  if (value > threshold.fail) {
    return 'FAIL';
  }
  if (value > threshold.warn) {
    return 'WARN';
  }
  return 'PASS';
};

const median = (values) => {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
};

const BENCH_SAMPLES = 3;

const sleepSync = (ms) => {
  if (!Number.isFinite(ms) || ms <= 0) {
    return;
  }
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
};

const runBenchSamples = ({ label, args, threshold, warmupRuns = 0, cooldownMs = 0, sampleCount = BENCH_SAMPLES }) => {
  const samples = [];

  if (warmupRuns > 0) {
    console.log(`\n[Gate B] ${label}: executing ${warmupRuns} warmup run(s) before scored samples.`);
  }
  for (let i = 0; i < warmupRuns; i += 1) {
    runCommand({
      label: `${label} (warmup ${i + 1}/${warmupRuns})`,
      command: npmCommand,
      args,
    });
  }
  if (warmupRuns > 0) {
    console.log(`[Gate B] ${label}: warmup complete.`);
  }

  if (cooldownMs > 0) {
    console.log(`[Gate B] ${label}: applying fixed ${cooldownMs}ms cooldown between scored samples.`);
  }

  for (let i = 0; i < sampleCount; i += 1) {
    const result = runCommand({
      label: `${label} (sample ${i + 1}/${sampleCount})`,
      command: npmCommand,
      args,
    });
    const p95 = parseP95(result.stdout || '');
    const status = result.status === 0 ? judgePerf(p95, threshold) : 'FAIL';
    samples.push({ p95, status, exitCode: result.status ?? 1 });
    if (cooldownMs > 0 && i < sampleCount - 1) {
      console.log(`[Gate B] ${label}: cooldown ${cooldownMs}ms before sample ${i + 2}/${sampleCount}.`);
      sleepSync(cooldownMs);
    }
  }

  const validP95 = samples
    .filter((sample) => sample.p95 !== null && !Number.isNaN(sample.p95))
    .map((sample) => sample.p95);
  const medianP95 = median(validP95);
  const medianStatus = judgePerf(medianP95, threshold);
  const anyFail = samples.some((sample) => sample.status === 'FAIL');
  const aggregateStatus = medianStatus === 'FAIL' ? 'FAIL' : anyFail ? 'WARN' : medianStatus;

  return {
    samples,
    medianP95,
    medianStatus,
    aggregateStatus,
  };
};

const gateAResults = [];
for (const gate of [
  { label: 'Gate A - Typecheck', command: npmCommand, args: ['run', 'typecheck'] },
  { label: 'Gate A - Build', command: npmCommand, args: ['run', 'build'] },
]) {
  const result = runCommand(gate);
  gateAResults.push({ ...gate, exitCode: result.status ?? 1 });
}

const gateAFailed = gateAResults.some((entry) => entry.exitCode !== 0);

const bench10k = runBenchSamples({
  label: 'Gate B - Bench 10k',
  args: ['run', 'bench:recipe-search', '--', '--recipes', '10000', '--runs', '10', '--query', 'dust'],
  threshold: THRESHOLDS.bench10k,
  warmupRuns: 1,
  cooldownMs: 250,
});

const bench50k = runBenchSamples({
  label: 'Gate B - Bench 50k',
  args: ['run', 'bench:recipe-search', '--', '--recipes', '50000', '--runs', '12', '--query', 'dust'],
  threshold: THRESHOLDS.bench50k,
  warmupRuns: 1,
  cooldownMs: 250,
});

const gateBStatus = bench10k.aggregateStatus === 'FAIL' || bench50k.aggregateStatus === 'FAIL'
  ? 'FAIL'
  : (bench10k.aggregateStatus === 'WARN' || bench50k.aggregateStatus === 'WARN' ? 'WARN' : 'PASS');
console.log(`GATE_B_STATUS=${gateBStatus}`);

let gateCStatus = 'SKIP';
let gateCExitCode = 0;
if (shouldRunGateC) {
  const gateCResult = runCommand({
    label: 'Gate C - E2E Critical Path',
    command: npmCommand,
    args: ['run', 'gate:c'],
  });
  gateCExitCode = gateCResult.status ?? 1;
  gateCStatus = gateCExitCode === 0 ? 'PASS' : 'FAIL';
} else {
  console.log('\n=== Gate C - E2E Critical Path ===');
  console.log('SKIPPED by SKIP_GATE_C=1');
}
console.log(`GATE_C_STATUS=${gateCStatus}`);

console.log('\n=== Release Regression Summary ===');
for (const entry of gateAResults) {
  console.log(`- ${entry.label}: ${entry.exitCode === 0 ? 'PASS' : 'FAIL'}`);
}

const formatP95 = (value) => (value === null || Number.isNaN(value) ? 'N/A' : `${value}ms`);
const sampleSummary = (samples) => samples.map((sample, index) => `s${index + 1}=${formatP95(sample.p95)}(${sample.status})`).join(', ');

console.log(`- Gate B 10k samples: ${sampleSummary(bench10k.samples)}`);
console.log(`- Gate B 10k median p95: ${formatP95(bench10k.medianP95)} (${bench10k.aggregateStatus})`);
console.log(`- Gate B 50k samples: ${sampleSummary(bench50k.samples)}`);
console.log(`- Gate B 50k median p95: ${formatP95(bench50k.medianP95)} (${bench50k.aggregateStatus})`);
console.log(`- Gate C E2E: ${gateCStatus}${gateCStatus === 'FAIL' ? ` (exit ${gateCExitCode})` : ''}`);

if (gateCStatus === 'SKIP') {
  console.log('\nGate C was skipped. Set SKIP_GATE_C=1 only for local diagnostics, not release sign-off.');
}

const hasBlocker = gateAFailed || gateBStatus === 'FAIL' || gateCStatus === 'FAIL';
let overall;
if (hasBlocker) {
  overall = 'NO RELEASE';
} else if (gateCStatus === 'SKIP') {
  overall = gateBStatus === 'WARN' ? 'CONDITIONAL RELEASE (Gate C skipped)' : 'READY FOR GATE C';
} else {
  overall = gateBStatus === 'WARN' ? 'CONDITIONAL RELEASE' : 'RELEASE READY';
}
console.log(`\nOverall: ${overall}`);

if (hasBlocker) {
  process.exit(1);
}
