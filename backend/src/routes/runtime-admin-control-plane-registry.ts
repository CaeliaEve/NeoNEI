import type { RuntimeAdminReconcileLabel } from '../services/runtime-admin-reconcile-control.service';

export type RuntimeAdminControlPlaneName = 'ops' | 'api-admin';
const RUNTIME_ADMIN_CONTROL_PLANE_NAMES = Object.freeze([
  'ops',
  'api-admin',
] as const satisfies readonly RuntimeAdminControlPlaneName[]);

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
const RUNTIME_ADMIN_CONTROL_PLANE_SUBSYSTEM_KEYS = Object.freeze([
  'runtime-control',
  'publish',
  'patterns',
  'render-contract',
] as const satisfies readonly RuntimeAdminControlPlaneSubsystemKey[]);

export type RuntimeAdminControlPlaneSubsystem = Readonly<{
  key: RuntimeAdminControlPlaneSubsystemKey;
  mountPath: string | null;
}>;

function validateAndFreezeControlPlanes(
  planes: readonly RuntimeAdminControlPlane[],
): readonly RuntimeAdminControlPlane[] {
  const expected = new Set<string>(RUNTIME_ADMIN_CONTROL_PLANE_NAMES);
  const seen = new Set<string>();
  const prefixes = new Set<string>();
  for (const plane of planes) {
    if (!plane) {
      throw new Error('Runtime admin control plane descriptor must not be null');
    }
    if (!expected.has(plane.name)) {
      throw new Error(`Unknown runtime admin control plane descriptor: ${plane.name}`);
    }
    if (!seen.add(plane.name)) {
      throw new Error(`Duplicate runtime admin control plane descriptor: ${plane.name}`);
    }
    if (!plane.prefix || !plane.prefix.startsWith('/')) {
      throw new Error(`Runtime admin control plane prefix must be absolute: ${plane.name}`);
    }
    if (!prefixes.add(plane.prefix)) {
      throw new Error(`Duplicate runtime admin control plane prefix: ${plane.prefix}`);
    }
    if (!plane.reconcileLabel || !plane.reconcileLabel.trim()) {
      throw new Error(`Runtime admin control plane reconcile label must be non-empty: ${plane.name}`);
    }
  }
  for (const name of RUNTIME_ADMIN_CONTROL_PLANE_NAMES) {
    if (!seen.has(name)) {
      throw new Error(`Missing runtime admin control plane descriptor: ${name}`);
    }
  }
  return Object.freeze(planes.map((plane) => Object.freeze({ ...plane })));
}

function validateAndFreezeControlPlaneSubsystems(
  subsystems: readonly RuntimeAdminControlPlaneSubsystem[],
): readonly RuntimeAdminControlPlaneSubsystem[] {
  const expected = new Set<string>(RUNTIME_ADMIN_CONTROL_PLANE_SUBSYSTEM_KEYS);
  const seen = new Set<string>();
  const mountPaths = new Set<string>();
  for (const subsystem of subsystems) {
    if (!subsystem) {
      throw new Error('Runtime admin control plane subsystem descriptor must not be null');
    }
    if (!expected.has(subsystem.key)) {
      throw new Error(`Unknown runtime admin control plane subsystem descriptor: ${subsystem.key}`);
    }
    if (!seen.add(subsystem.key)) {
      throw new Error(`Duplicate runtime admin control plane subsystem descriptor: ${subsystem.key}`);
    }
    if (subsystem.mountPath !== null) {
      if (!subsystem.mountPath.startsWith('/')) {
        throw new Error(`Runtime admin control plane subsystem mount path must be absolute: ${subsystem.key}`);
      }
      if (!mountPaths.add(subsystem.mountPath)) {
        throw new Error(`Duplicate runtime admin control plane subsystem mount path: ${subsystem.mountPath}`);
      }
    }
  }
  for (const key of RUNTIME_ADMIN_CONTROL_PLANE_SUBSYSTEM_KEYS) {
    if (!seen.has(key)) {
      throw new Error(`Missing runtime admin control plane subsystem descriptor: ${key}`);
    }
  }
  return Object.freeze(subsystems.map((subsystem) => Object.freeze({ ...subsystem })));
}

export const RUNTIME_ADMIN_CONTROL_PLANES: readonly RuntimeAdminControlPlane[] =
  validateAndFreezeControlPlanes([
    {
      name: 'ops',
      prefix: '/ops',
      reconcileLabel: 'OPS',
    },
    {
      name: 'api-admin',
      prefix: '/api/admin',
      reconcileLabel: 'ADMIN',
    },
  ]);

export const RUNTIME_ADMIN_CONTROL_PLANE_SUBSYSTEMS: readonly RuntimeAdminControlPlaneSubsystem[] =
  validateAndFreezeControlPlaneSubsystems([
    { key: 'runtime-control', mountPath: null },
    { key: 'publish', mountPath: '/publish' },
    { key: 'patterns', mountPath: '/patterns' },
    { key: 'render-contract', mountPath: '/render-contract' },
  ]);
