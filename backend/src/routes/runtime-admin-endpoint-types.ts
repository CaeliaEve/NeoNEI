import type { AccelerationRuntimePhase, AccelerationRuntimeState } from '../services/acceleration-runtime.service';

export type RuntimeAdminIndexRoutesOptions = {
  getAccelerationRuntimeSnapshot: () => AccelerationRuntimeState;
};

export type RuntimeAdminControlRouterOptions<TManager> = {
  getAccelerationRuntimeSnapshot: () => AccelerationRuntimeState;
  getRuntimeAccelerationDbManager: () => TManager | null;
  reconcileAccelerationRuntime: (manager: TManager) => Promise<void>;
  setAccelerationRuntimePhase: (
    phase: AccelerationRuntimePhase,
    message: string,
    extras?: Partial<Pick<AccelerationRuntimeState, 'stale' | 'lastCompiledSignature' | 'lastError'>>,
  ) => void;
};
