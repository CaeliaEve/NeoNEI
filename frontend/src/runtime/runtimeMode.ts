export function isEnvFlagEnabled(value: string | boolean | undefined | null): boolean {
  if (value === true) {
    return true;
  }
  if (typeof value !== 'string') {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

export function isProductionRuntimeBuild(): boolean {
  return import.meta.env.PROD === true;
}

export function isPublicRuntimeOnly(): boolean {
  return isEnvFlagEnabled(import.meta.env.VITE_PUBLIC_RUNTIME_ONLY) || isProductionRuntimeBuild();
}

export function isControlPlaneDisabled(): boolean {
  return isPublicRuntimeOnly() || isEnvFlagEnabled(import.meta.env.VITE_RUNTIME_DISABLE_CONTROL_PLANE);
}

export function isStrictRuntimeContractsEnabledByEnv(): boolean {
  return isPublicRuntimeOnly()
    || isEnvFlagEnabled(import.meta.env.VITE_STRICT_RUNTIME_CONTRACTS)
    || isEnvFlagEnabled(import.meta.env.VITE_RUNTIME_V3_STRICT);
}
