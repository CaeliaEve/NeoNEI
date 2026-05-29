import { markPerfEvent } from '../services/perfMarks';

export interface RuntimeContractGapOptions {
  strict?: boolean;
  logger?: Pick<Console, 'warn'>;
}

export function isStrictRuntimeContractsEnabled(): boolean {
  if (import.meta.env.VITE_RUNTIME_V3_STRICT === '1') {
    return true;
  }

  if (typeof window === 'undefined') {
    return false;
  }

  try {
    return window.localStorage.getItem('neonei:runtime-v3-strict') === '1';
  } catch {
    return false;
  }
}

export function reportRuntimeContractGap(
  scope: string,
  route: string,
  reason: string,
  options: RuntimeContractGapOptions = {},
): void {
  const strict = options.strict ?? isStrictRuntimeContractsEnabled();
  markPerfEvent('runtime-contract-gap', {
    scope,
    route,
    reason,
    strict,
  });

  if (strict) {
    throw new Error(`Runtime contract unavailable for ${scope}; blocked legacy route ${route} (${reason})`);
  }

  const logger = options.logger ?? (typeof console !== 'undefined' ? console : undefined);
  if (logger && typeof logger.warn === 'function') {
    logger.warn(`[NeoNEI Runtime] ${scope} required legacy route ${route}: ${reason}`);
  }
}
