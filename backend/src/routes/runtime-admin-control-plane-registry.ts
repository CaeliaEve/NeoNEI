import type { RuntimeAdminReconcileLabel } from '../services/runtime-admin-reconcile-control.service';

export type RuntimeAdminControlPlaneName = 'ops' | 'api-admin';

export type RuntimeAdminControlPlane = Readonly<{
  name: RuntimeAdminControlPlaneName;
  prefix: '/ops' | '/api/admin';
  reconcileLabel: RuntimeAdminReconcileLabel;
}>;

export type RuntimeAdminControlPlaneSubsystemKey =
  | 'runtime-control'
  | 'publish'
  | 'patterns'
  | 'render-contract';

export type RuntimeAdminControlPlaneSubsystem = Readonly<{
  key: RuntimeAdminControlPlaneSubsystemKey;
  mountPath: string | null;
}>;

export const RUNTIME_ADMIN_CONTROL_PLANES: readonly RuntimeAdminControlPlane[] = Object.freeze([
  Object.freeze({
    name: 'ops',
    prefix: '/ops',
    reconcileLabel: 'OPS',
  }),
  Object.freeze({
    name: 'api-admin',
    prefix: '/api/admin',
    reconcileLabel: 'ADMIN',
  }),
]);

export const RUNTIME_ADMIN_CONTROL_PLANE_SUBSYSTEMS: readonly RuntimeAdminControlPlaneSubsystem[] =
  Object.freeze([
    Object.freeze({ key: 'runtime-control', mountPath: null }),
    Object.freeze({ key: 'publish', mountPath: '/publish' }),
    Object.freeze({ key: 'patterns', mountPath: '/patterns' }),
    Object.freeze({ key: 'render-contract', mountPath: '/render-contract' }),
  ]);
