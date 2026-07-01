import { logger } from '../utils/logger';
import {
  assertCompilerNativeUiCapabilityGate,
  type ElysiumCompilerCapabilityContract,
} from './elysium-compiler-capability-gate';
import {
  DEFAULT_ELYSIUM_COMPILER_LOCK_PATH,
  ElysiumCompilerTransport,
  type ElysiumCompilerCommandResult,
} from './elysium-compiler-transport';

export type { ElysiumCompilerCommandResult } from './elysium-compiler-transport';

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

function pushOptionalNumberArg(args: string[], name: string, value?: number): void {
  if (typeof value !== 'number') return;
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`elysium-compiler option ${name} must be a positive integer`);
  }
  args.push(name, String(value));
}

/** Typed ABI client for the external elysium-compiler. */
export class ElysiumCompilerClient {
  constructor(
    private readonly lockPath: string = DEFAULT_ELYSIUM_COMPILER_LOCK_PATH,
    private readonly transport: ElysiumCompilerTransport = new ElysiumCompilerTransport(),
  ) {}

  async handshake(): Promise<ElysiumCompilerHandshake> {
    const report = await this.transport.resolveCompilerHandshake<RawElysiumCompilerHandshake>(this.lockPath);
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
    return this.transport.runCompilerCommand(handshake.compiler, args, 'elysium-compiler validate');
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
    return this.transport.runCompilerCommand(handshake.compiler, args, 'elysium-compiler compile');
  }
}

export async function verifyElysiumCompilerBoundary(): Promise<ElysiumCompilerHandshake> {
  return new ElysiumCompilerClient().handshake();
}
