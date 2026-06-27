import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger';

export type ElysiumCompilerMetadata = {
  name?: string;
  version?: string;
  rawExportSchemaVersion?: string;
  compiledDistSchemaVersion?: string;
  exportAbiVersion?: string;
  packAbiVersion?: string;
  runtimeAbiVersion?: string;
  schemaHash?: string;
};

export type ElysiumCompilerHandshake = {
  compiler: string;
  lockPath: string;
  metadata: ElysiumCompilerMetadata;
  abi?: unknown;
};

const backendRoot = path.resolve(__dirname, '..', '..');
const repoRoot = path.resolve(backendRoot, '..');
const defaultLockPath = path.join(repoRoot, 'tools', 'elysium-compiler', 'elysium-compiler.lock.json');
const ensureScript = path.join(repoRoot, 'scripts', 'ensure-elysium-compiler.mjs');

function runNodeJson<T>(args: string[], label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    const child = spawn(process.execPath, args, {
      cwd: repoRoot,
      env: process.env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`${label} failed with code ${code ?? 'unknown'}${stderr ? `: ${stderr.trim()}` : ''}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout) as T);
      } catch (error) {
        reject(new Error(`${label} returned invalid JSON: ${(error as Error).message}; stdout=${stdout.slice(0, 500)}`));
      }
    });
  });
}

export class ElysiumCompilerClient {
  constructor(private readonly lockPath: string = defaultLockPath) {}

  async handshake(): Promise<ElysiumCompilerHandshake> {
    if (!fs.existsSync(this.lockPath)) {
      throw new Error(`elysium-compiler lock file missing: ${this.lockPath}`);
    }
    const report = await runNodeJson<ElysiumCompilerHandshake>(
      [ensureScript, '--lock', this.lockPath, '--json'],
      'elysium-compiler handshake',
    );
    logger.info('[ELYSIUM_COMPILER] handshake ok', {
      compiler: report.compiler,
      version: report.metadata?.version,
      exportAbiVersion: report.metadata?.exportAbiVersion,
      packAbiVersion: report.metadata?.packAbiVersion,
      runtimeAbiVersion: report.metadata?.runtimeAbiVersion,
    });
    return report;
  }
}

export async function verifyElysiumCompilerBoundary(): Promise<ElysiumCompilerHandshake> {
  return new ElysiumCompilerClient().handshake();
}
