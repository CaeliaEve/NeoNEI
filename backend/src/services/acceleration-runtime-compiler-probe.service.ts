import { IMAGES_PATH, NESQL_CANONICAL_DIR, SPLIT_ITEMS_DIR, SPLIT_RECIPES_DIR } from '../config/runtime-paths';
import { getAccelerationDatabaseManager } from '../models/database';
import { NeoNeiCompilerService, type CompilerSourceRoots } from './neonei-compiler.service';

export type AccelerationCompilerProbeInput = {
  manager: ReturnType<typeof getAccelerationDatabaseManager>;
};

export type AccelerationCompilerProbe = {
  sourceRoots: CompilerSourceRoots;
  fresh: boolean;
};

export const ACCELERATION_SOURCE_ROOTS: CompilerSourceRoots = Object.freeze({
  itemsDir: SPLIT_ITEMS_DIR,
  recipesDir: SPLIT_RECIPES_DIR,
  canonicalDir: NESQL_CANONICAL_DIR,
  imageRoot: IMAGES_PATH,
});

export function getAccelerationCompilerSourceRoots(): CompilerSourceRoots {
  return ACCELERATION_SOURCE_ROOTS;
}

export function probeAccelerationCompilerState(input: AccelerationCompilerProbeInput): AccelerationCompilerProbe {
  const compiler = new NeoNeiCompilerService(input.manager, getAccelerationCompilerSourceRoots());
  return {
    sourceRoots: getAccelerationCompilerSourceRoots(),
    fresh: compiler.isAccelerationStateFresh(),
  };
}
