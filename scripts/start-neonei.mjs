#!/usr/bin/env node
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const backendDir = path.join(repoRoot, 'backend');
const frontendDir = path.join(repoRoot, 'frontend');
const logDir = path.join(repoRoot, '.tmp', 'runtime-logs');

function parseArgs(argv) {
  const args = {
    backendPort: Number(process.env.PORT || 3002),
    frontendPort: Number(process.env.FRONTEND_PORT || 5173),
    backendMode: process.env.NEONEI_BACKEND_MODE || 'start',
    dataRoot: process.env.NESQL_EXPORT_ROOT || process.env.NESQL_REPOSITORY_PATH || '',
    host: process.env.NEONEI_FRONTEND_HOST || '127.0.0.1',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === '--backend-port' && value) { args.backendPort = Number(value); index += 1; }
    else if (key === '--frontend-port' && value) { args.frontendPort = Number(value); index += 1; }
    else if (key === '--backend-mode' && value) { args.backendMode = value; index += 1; }
    else if ((key === '--data-root' || key === '--export-root') && value) { args.dataRoot = value; index += 1; }
    else if (key === '--host' && value) { args.host = value; index += 1; }
    else if (key === '--help') {
      console.log(`Usage: node scripts/start-neonei.mjs [--data-root PATH] [--backend-port 3002] [--frontend-port 5173] [--backend-mode start|dev] [--host 127.0.0.1]`);
      process.exit(0);
    }
  }
  if (!Number.isFinite(args.backendPort) || args.backendPort <= 0) throw new Error('Invalid --backend-port');
  if (!Number.isFinite(args.frontendPort) || args.frontendPort <= 0) throw new Error('Invalid --frontend-port');
  if (!['start', 'dev'].includes(args.backendMode)) throw new Error('--backend-mode must be start or dev');
  return args;
}

function waitHttpOk(url, timeoutMs = 35_000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve) => {
    const attempt = () => {
      const req = http.get(url, { timeout: 5000 }, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 500) resolve(true);
        else retry();
      });
      req.on('timeout', () => { req.destroy(); retry(); });
      req.on('error', retry);
    };
    const retry = () => {
      if (Date.now() >= deadline) resolve(false);
      else setTimeout(attempt, 700);
    };
    attempt();
  });
}

function createLogStream(name) {
  fs.mkdirSync(logDir, { recursive: true });
  return fs.createWriteStream(path.join(logDir, name), { flags: 'a' });
}

function spawnNpm(commandArgs, cwd, env, logName) {
  const log = createLogStream(logName);
  const child = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', commandArgs, {
    cwd,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    detached: true,
  });
  child.stdout.pipe(log);
  child.stderr.pipe(log);
  child.unref();
  return child;
}

const args = parseArgs(process.argv.slice(2));
const env = { ...process.env, PORT: String(args.backendPort) };

if (args.dataRoot.trim()) {
  const resolvedDataRoot = path.resolve(args.dataRoot);
  env.NESQL_EXPORT_ROOT = resolvedDataRoot;
  env.NESQL_REPOSITORY_PATH = resolvedDataRoot;
  env.NESQL_SPLIT_ITEMS_DIR = path.join(resolvedDataRoot, 'items');
  env.NESQL_SPLIT_RECIPES_DIR = path.join(resolvedDataRoot, 'recipes');
  env.NESQL_CANONICAL_DIR = path.join(resolvedDataRoot, 'canonical');
  env.IMAGES_PATH = path.join(resolvedDataRoot, 'image');
  env.NESQL_IMAGES_DIR = path.join(resolvedDataRoot, 'image', 'item');
  console.log(`[NeoNEI] Using NESQL export root: ${resolvedDataRoot}`);
}

console.log(`[NeoNEI] Starting backend on http://127.0.0.1:${args.backendPort} (${args.backendMode})`);
spawnNpm(['run', args.backendMode === 'dev' ? 'dev' : 'start'], backendDir, env, 'backend.log');

console.log(`[NeoNEI] Starting frontend on http://${args.host}:${args.frontendPort}`);
spawnNpm(['run', 'dev', '--', '--host', args.host, '--port', String(args.frontendPort)], frontendDir, env, 'frontend.log');

const backendOk = await waitHttpOk(`http://127.0.0.1:${args.backendPort}/runtime/health`);
const frontendOk = await waitHttpOk(`http://${args.host}:${args.frontendPort}`);

if (backendOk && frontendOk) {
  console.log('[NeoNEI] Started successfully.');
} else {
  console.warn('[NeoNEI] Started with warnings.');
  console.warn(`[NeoNEI] Backend health: ${backendOk}`);
  console.warn(`[NeoNEI] Frontend health: ${frontendOk}`);
}
console.log(`[NeoNEI] Frontend: http://${args.host}:${args.frontendPort}`);
console.log(`[NeoNEI] Backend:  http://127.0.0.1:${args.backendPort}`);
console.log(`[NeoNEI] Logs: ${logDir}`);
