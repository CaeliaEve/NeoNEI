#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = path.join(repoRoot, 'tools', 'neonei-wasm-engine', 'Cargo.toml');
const candidates = [
  process.env.CARGO,
  'D:/Rust/cargo/bin/cargo.exe',
  'D:/Rust/rustup/toolchains/stable-x86_64-pc-windows-msvc/bin/cargo.exe',
  'cargo',
  path.join(process.env.USERPROFILE ?? '', '.cargo', 'bin', 'cargo.exe'),
].filter(Boolean);

function runCargo(args) {
  const cargo = candidates.find((candidate) => candidate !== 'cargo' && existsSync(candidate))
    ?? (spawnSync('where.exe', ['cargo'], { stdio: 'ignore' }).status === 0 ? 'cargo' : null);
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
console.log('[wasm-engine-gate] ok');

