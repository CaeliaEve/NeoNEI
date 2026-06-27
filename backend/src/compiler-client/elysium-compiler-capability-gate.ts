import type { ElysiumCompilerHandshake } from './elysium-compiler-client';

export const REQUIRED_NATIVE_UI_CAPABILITIES = Object.freeze([
  'native_ui.surface',
  'native_ui.design_space_coordinates',
  'native_ui.background_asset',
]);

export const REQUIRED_COMPILER_COMMANDS = Object.freeze([
  'schemas',
  'validate',
  'compile',
]);

export type ElysiumNativeUiAbi = {
  coordinateSpace: string;
  fallbackPolicy: string;
  requiredCapabilities: string[];
  requiredFiles: string[];
  runtimeTransform: string;
};

export type ElysiumCompilerAbiContract = {
  nativeUi: ElysiumNativeUiAbi;
};

export type ElysiumCompilerCapabilityContract = ElysiumCompilerAbiContract & {
  commands: string[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`elysium-compiler ABI gate failed: ${path} must be a non-empty string`);
  }
  return value;
}

function requireStringArray(value: unknown, path: string): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || entry.trim() === '')) {
    throw new Error(`elysium-compiler ABI gate failed: ${path} must be a non-empty string array`);
  }
  return value as string[];
}

export function extractCompilerCapabilityContract(
  handshake: ElysiumCompilerHandshake,
): ElysiumCompilerAbiContract {
  const abi = asRecord(handshake.abi);
  const exportAbi = asRecord(abi?.exportAbi);
  const nativeUi = asRecord(exportAbi?.nativeUi);
  if (!nativeUi) {
    throw new Error('elysium-compiler ABI gate failed: abi.exportAbi.nativeUi is required');
  }

  return {
    nativeUi: {
      coordinateSpace: requireString(nativeUi.coordinateSpace, 'abi.exportAbi.nativeUi.coordinateSpace'),
      fallbackPolicy: requireString(nativeUi.fallbackPolicy, 'abi.exportAbi.nativeUi.fallbackPolicy'),
      requiredCapabilities: requireStringArray(
        nativeUi.requiredCapabilities,
        'abi.exportAbi.nativeUi.requiredCapabilities',
      ),
      requiredFiles: requireStringArray(nativeUi.requiredFiles, 'abi.exportAbi.nativeUi.requiredFiles'),
      runtimeTransform: requireString(nativeUi.runtimeTransform, 'abi.exportAbi.nativeUi.runtimeTransform'),
    },
  };
}

export function assertCompilerNativeUiCapabilityGate(handshake: ElysiumCompilerHandshake): ElysiumCompilerCapabilityContract {
  const contract = extractCompilerCapabilityContract(handshake);
  const commandReport = asRecord(handshake.commands);
  const availableCommands = Object.keys(commandReport ?? {}).filter((command) => asRecord(commandReport?.[command])?.ok === true);
  const missingCommands = REQUIRED_COMPILER_COMMANDS.filter((command) => !availableCommands.includes(command));
  if (missingCommands.length > 0) {
    throw new Error(
      `elysium-compiler ABI gate failed: missing required compiler commands: ${missingCommands.join(', ')}`,
    );
  }
  const available = new Set(contract.nativeUi.requiredCapabilities);
  const missing = REQUIRED_NATIVE_UI_CAPABILITIES.filter((capability) => !available.has(capability));
  if (missing.length > 0) {
    throw new Error(
      `elysium-compiler ABI gate failed: missing required native UI capabilities: ${missing.join(', ')}`,
    );
  }
  return { ...contract, commands: availableCommands };
}
