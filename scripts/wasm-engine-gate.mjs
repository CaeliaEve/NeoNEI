#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = path.join(repoRoot, 'tools', 'neonei-wasm-engine', 'Cargo.toml');
const wasmBuildOutput = path.join(repoRoot, 'tools', 'neonei-wasm-engine', 'target', 'wasm32-unknown-unknown', 'release', 'neonei_wasm_engine.wasm');
const wasmPublicDir = path.join(repoRoot, 'frontend', 'public', 'native', 'engine');
const wasmPublicOutput = path.join(wasmPublicDir, 'neonei_wasm_engine.wasm');
function windowsRustCargoCandidates() {
  if (process.platform !== 'win32') return [];
  return ['C', 'D', 'E', 'F']
    .flatMap((drive) => [
      path.join(`${drive}:`, 'Rust', 'cargo', 'bin', 'cargo.exe'),
      path.join(`${drive}:`, 'Rust', 'rustup', 'toolchains', 'stable-x86_64-pc-windows-msvc', 'bin', 'cargo.exe'),
    ]);
}

const candidates = [
  process.env.CARGO,
  process.env.CARGO_HOME ? path.join(process.env.CARGO_HOME, 'bin', process.platform === 'win32' ? 'cargo.exe' : 'cargo') : null,
  path.join(process.env.USERPROFILE ?? '', '.cargo', 'bin', 'cargo.exe'),
  ...windowsRustCargoCandidates(),
  'cargo',
].filter(Boolean);

function runCargo(args) {
  const cargo = candidates.find((candidate) => candidate !== 'cargo' && existsSync(candidate))
    ?? (spawnSync(process.platform === 'win32' ? 'where.exe' : 'which', ['cargo'], { stdio: 'ignore' }).status === 0 ? 'cargo' : null);
  if (!cargo) {
    console.error('[wasm-engine-gate] cargo not found. Set CARGO or install Rust.');
    process.exit(2);
  }
  const result = spawnSync(cargo, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: false,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (!existsSync(manifest)) {
  console.error(`[wasm-engine-gate] missing manifest: ${manifest}`);
  process.exit(1);
}

runCargo(['test', '--manifest-path', manifest]);
runCargo(['build', '--manifest-path', manifest, '--release', '--target', 'wasm32-unknown-unknown']);
if (!existsSync(wasmBuildOutput)) {
  console.error(`[wasm-engine-gate] missing wasm output: ${wasmBuildOutput}`);
  process.exit(1);
}
mkdirSync(wasmPublicDir, { recursive: true });
copyFileSync(wasmBuildOutput, wasmPublicOutput);
console.log(`[wasm-engine-gate] copied ${path.relative(repoRoot, wasmPublicOutput)}`);
console.log('[wasm-engine-gate] ok');
