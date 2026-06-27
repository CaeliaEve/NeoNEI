import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger';
import {
  assertCompilerNativeUiCapabilityGate,
  type ElysiumCompilerCapabilityContract,
} from './elysium-compiler-capability-gate';

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
  commands?: unknown;
  abi?: unknown;
  capabilities: ElysiumCompilerCapabilityContract;
};

type RawElysiumCompilerHandshake = Omit<ElysiumCompilerHandshake, 'capabilities'> & {
  capabilities?: unknown;
};

export type ElysiumCompilerScope = 'all' | 'native-ui' | 'search' | 'browser' | 'recipes' | 'ui' | 'textures';

export type ElysiumCompilerCommandResult = {
  compiler: string;
  stdout: string;
  stderr: string;
};

export type ElysiumCompilerValidateOptions = {
  input: string;
  report: string;
  output?: string;
  threads?: number;
};

export type ElysiumCompilerCompileOptions = {
  input: string;
  output: string;
  report: string;
  scope?: ElysiumCompilerScope;
  strict?: boolean;
  debugJson?: boolean;
  threads?: number;
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

function runCompilerCommand(compiler: string, args: string[], label: string): Promise<ElysiumCompilerCommandResult> {
  return new Promise<ElysiumCompilerCommandResult>((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    const child = spawn(compiler, args, {
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
      resolve({ compiler, stdout, stderr });
    });
  });
}

function pushOptionalNumberArg(args: string[], name: string, value?: number): void {
  if (typeof value !== 'number') return;
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`elysium-compiler option ${name} must be a positive integer`);
  }
  args.push(name, String(value));
}

export class ElysiumCompilerClient {
  constructor(private readonly lockPath: string = defaultLockPath) {}

  async handshake(): Promise<ElysiumCompilerHandshake> {
    if (!fs.existsSync(this.lockPath)) {
      throw new Error(`elysium-compiler lock file missing: ${this.lockPath}`);
    }
    const report = await runNodeJson<RawElysiumCompilerHandshake>(
      [ensureScript, '--lock', this.lockPath, '--json'],
      'elysium-compiler handshake',
    );
    const capabilities = assertCompilerNativeUiCapabilityGate(report as ElysiumCompilerHandshake);
    logger.info('[ELYSIUM_COMPILER] handshake ok', {
      compiler: report.compiler,
      version: report.metadata?.version,
      exportAbiVersion: report.metadata?.exportAbiVersion,
      packAbiVersion: report.metadata?.packAbiVersion,
      runtimeAbiVersion: report.metadata?.runtimeAbiVersion,
      commands: capabilities.commands,
      nativeUiCapabilities: capabilities.nativeUi.requiredCapabilities,
    });
    return { ...report, capabilities };
  }

  async validate(options: ElysiumCompilerValidateOptions): Promise<ElysiumCompilerCommandResult> {
    const handshake = await this.handshake();
    const args = ['validate', '--input', options.input, '--report', options.report];
    if (options.output) args.push('--output', options.output);
    pushOptionalNumberArg(args, '--threads', options.threads);
    return runCompilerCommand(handshake.compiler, args, 'elysium-compiler validate');
  }

  async compile(options: ElysiumCompilerCompileOptions): Promise<ElysiumCompilerCommandResult> {
    const handshake = await this.handshake();
    const args = [
      'compile',
      '--input',
      options.input,
      '--output',
      options.output,
      '--report',
      options.report,
      '--scope',
      options.scope ?? 'all',
    ];
    if (options.strict) args.push('--strict');
    if (options.debugJson) args.push('--debug-json');
    pushOptionalNumberArg(args, '--threads', options.threads);
    return runCompilerCommand(handshake.compiler, args, 'elysium-compiler compile');
  }
}

export async function verifyElysiumCompilerBoundary(): Promise<ElysiumCompilerHandshake> {
  return new ElysiumCompilerClient().handshake();
}
