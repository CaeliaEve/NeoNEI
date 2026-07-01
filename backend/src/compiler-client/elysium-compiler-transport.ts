import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

export type ElysiumCompilerCommandResult = {
  compiler: string;
  stdout: string;
  stderr: string;
};

export type ElysiumCompilerTransportOptions = Readonly<{
  repoRoot?: string;
  ensureScript?: string;
  nodePath?: string;
  env?: NodeJS.ProcessEnv;
}>;

const backendRoot = path.resolve(__dirname, '..', '..');

export const ELYSIUM_COMPILER_REPO_ROOT = path.resolve(backendRoot, '..');
export const DEFAULT_ELYSIUM_COMPILER_LOCK_PATH = path.join(
  ELYSIUM_COMPILER_REPO_ROOT,
  'tools',
  'elysium-compiler',
  'elysium-compiler.lock.json',
);
export const DEFAULT_ELYSIUM_COMPILER_ENSURE_SCRIPT = path.join(
  ELYSIUM_COMPILER_REPO_ROOT,
  'scripts',
  'ensure-elysium-compiler.mjs',
);

type CapturedProcess = Readonly<{
  stdout: string;
  stderr: string;
}>;

function spawnCapturedProcess(
  command: string,
  args: readonly string[],
  label: string,
  repoRoot: string,
  env: NodeJS.ProcessEnv,
): Promise<CapturedProcess> {
  return new Promise<CapturedProcess>((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    const child = spawn(command, [...args], {
      cwd: repoRoot,
      env,
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
      resolve(Object.freeze({ stdout, stderr }));
    });
  });
}

/** Owns process transport for the external elysium-compiler binary. */
export class ElysiumCompilerTransport {
  private readonly repoRoot: string;
  private readonly ensureScript: string;
  private readonly nodePath: string;
  private readonly env: NodeJS.ProcessEnv;

  constructor(options: ElysiumCompilerTransportOptions = {}) {
    this.repoRoot = options.repoRoot ?? ELYSIUM_COMPILER_REPO_ROOT;
    this.ensureScript = options.ensureScript ?? DEFAULT_ELYSIUM_COMPILER_ENSURE_SCRIPT;
    this.nodePath = options.nodePath ?? process.execPath;
    this.env = options.env ?? process.env;
  }

  async resolveCompilerHandshake<T>(lockPath: string): Promise<T> {
    if (!fs.existsSync(lockPath)) {
      throw new Error(`elysium-compiler lock file missing: ${lockPath}`);
    }
    return this.runNodeJson<T>(
      [this.ensureScript, '--lock', lockPath, '--json'],
      'elysium-compiler handshake',
    );
  }

  async runNodeJson<T>(args: readonly string[], label: string): Promise<T> {
    const { stdout } = await spawnCapturedProcess(this.nodePath, args, label, this.repoRoot, this.env);
    try {
      return JSON.parse(stdout) as T;
    } catch (error) {
      throw new Error(`${label} returned invalid JSON: ${(error as Error).message}; stdout=${stdout.slice(0, 500)}`);
    }
  }

  async runCompilerCommand(
    compiler: string,
    args: readonly string[],
    label: string,
  ): Promise<ElysiumCompilerCommandResult> {
    const { stdout, stderr } = await spawnCapturedProcess(compiler, args, label, this.repoRoot, this.env);
    return Object.freeze({ compiler, stdout, stderr });
  }
}
