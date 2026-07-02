import type { ElysiumCompilerHandshake } from './elysium-compiler-client';
import {
  NATIVE_UI_COORDINATE_SPACE,
  NATIVE_UI_FALLBACK_POLICY,
  NATIVE_UI_REQUIRED_CAPABILITIES,
  NATIVE_UI_REQUIRED_FILES,
  NATIVE_UI_RUNTIME_TRANSFORM,
  REQUIRED_COMPILER_COMMANDS,
} from './elysium-compiler-capability-abi';

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

function assertExactString(actual: string, expected: string, path: string): void {
  if (actual !== expected) {
    throw new Error(`elysium-compiler ABI gate failed: ${path} must be ${expected}, got ${actual}`);
  }
}

function assertIncludesAll(actual: readonly string[], expected: readonly string[], label: string): void {
  const available = new Set(actual);
  const missing = expected.filter((entry) => !available.has(entry));
  if (missing.length > 0) {
    throw new Error(`elysium-compiler ABI gate failed: missing required ${label}: ${missing.join(', ')}`);
  }
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
  assertIncludesAll(availableCommands, REQUIRED_COMPILER_COMMANDS, 'compiler commands');
  assertIncludesAll(
    contract.nativeUi.requiredCapabilities,
    NATIVE_UI_REQUIRED_CAPABILITIES,
    'native UI capabilities',
  );
  assertIncludesAll(contract.nativeUi.requiredFiles, NATIVE_UI_REQUIRED_FILES, 'native UI files');
  assertExactString(
    contract.nativeUi.coordinateSpace,
    NATIVE_UI_COORDINATE_SPACE,
    'abi.exportAbi.nativeUi.coordinateSpace',
  );
  assertExactString(
    contract.nativeUi.runtimeTransform,
    NATIVE_UI_RUNTIME_TRANSFORM,
    'abi.exportAbi.nativeUi.runtimeTransform',
  );
  assertExactString(
    contract.nativeUi.fallbackPolicy,
    NATIVE_UI_FALLBACK_POLICY,
    'abi.exportAbi.nativeUi.fallbackPolicy',
  );
  return { ...contract, commands: availableCommands };
}
