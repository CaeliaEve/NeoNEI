export type RecipeHydrationRecoveryReason =
  | 'initial-visible-pack'
  | 'used-in-visible-pack'
  | 'category-window-recovery'
  | 'group-window-recovery';

export type RecipeHydrationFailureSource =
  | 'produced-by-machine-group'
  | 'used-in-machine-group'
  | 'category-group'
  | 'runtime-shard'
  | 'search-result-batch';

type RecipeHydrationRecoveryDescriptor = Readonly<{
  reason: RecipeHydrationRecoveryReason;
  label: string;
  source: 'visible-pack' | 'group-window' | 'category-window';
  fullShard: true;
}>;

type RecipeHydrationFailureDescriptor = Readonly<{
  source: RecipeHydrationFailureSource;
  message: string;
}>;

export const RECIPE_HYDRATION_RECOVERY_REASONS = Object.freeze({
  initialVisiblePack: 'initial-visible-pack',
  usedInVisiblePack: 'used-in-visible-pack',
  categoryWindowRecovery: 'category-window-recovery',
  groupWindowRecovery: 'group-window-recovery',
} as const satisfies Readonly<Record<string, RecipeHydrationRecoveryReason>>);

const RECIPE_HYDRATION_RECOVERY_DESCRIPTORS: readonly RecipeHydrationRecoveryDescriptor[] = validateRecoveryDescriptors([
  {
    reason: RECIPE_HYDRATION_RECOVERY_REASONS.initialVisiblePack,
    label: 'initial visible recipe pack requires full-shard completion',
    source: 'visible-pack',
    fullShard: true,
  },
  {
    reason: RECIPE_HYDRATION_RECOVERY_REASONS.usedInVisiblePack,
    label: 'used-in visible recipe pack requires full-shard completion',
    source: 'visible-pack',
    fullShard: true,
  },
  {
    reason: RECIPE_HYDRATION_RECOVERY_REASONS.categoryWindowRecovery,
    label: 'category window index unavailable; request full-shard completion',
    source: 'category-window',
    fullShard: true,
  },
  {
    reason: RECIPE_HYDRATION_RECOVERY_REASONS.groupWindowRecovery,
    label: 'machine/category group window request failed; request full-shard completion',
    source: 'group-window',
    fullShard: true,
  },
]);

const RECIPE_HYDRATION_FAILURE_DESCRIPTORS: readonly RecipeHydrationFailureDescriptor[] = validateFailureDescriptors([
  {
    source: 'produced-by-machine-group',
    message: 'Produced-by machine group hydration failed',
  },
  {
    source: 'used-in-machine-group',
    message: 'Used-in machine group hydration failed',
  },
  {
    source: 'category-group',
    message: 'Recipe category group hydration failed',
  },
  {
    source: 'runtime-shard',
    message: 'Runtime recipe shard hydration failed; chunked indexed-recipe fallback is forbidden',
  },
  {
    source: 'search-result-batch',
    message: 'Recipe search matched unloaded recipes; indexed-recipe batch hydration is forbidden',
  },
]);

const RECOVERY_DESCRIPTOR_BY_REASON = new Map(
  RECIPE_HYDRATION_RECOVERY_DESCRIPTORS.map((descriptor) => [descriptor.reason, descriptor]),
);

const FAILURE_DESCRIPTOR_BY_SOURCE = new Map(
  RECIPE_HYDRATION_FAILURE_DESCRIPTORS.map((descriptor) => [descriptor.source, descriptor]),
);

function validateRecoveryDescriptors(
  descriptors: readonly RecipeHydrationRecoveryDescriptor[],
): readonly RecipeHydrationRecoveryDescriptor[] {
  const seen = new Set<string>();
  for (const descriptor of descriptors) {
    if (!seen.add(descriptor.reason)) {
      throw new Error(`Duplicate recipe hydration recovery descriptor: ${descriptor.reason}`);
    }
    if (descriptor.fullShard !== true) {
      throw new Error(`Recipe hydration recovery descriptor must use full-shard recovery: ${descriptor.reason}`);
    }
  }
  return Object.freeze(descriptors.map((descriptor) => Object.freeze({ ...descriptor })));
}

function validateFailureDescriptors(
  descriptors: readonly RecipeHydrationFailureDescriptor[],
): readonly RecipeHydrationFailureDescriptor[] {
  const seen = new Set<string>();
  for (const descriptor of descriptors) {
    if (!seen.add(descriptor.source)) {
      throw new Error(`Duplicate recipe hydration failure descriptor: ${descriptor.source}`);
    }
    if (!descriptor.message) {
      throw new Error(`Recipe hydration failure descriptor must declare a message: ${descriptor.source}`);
    }
  }
  return Object.freeze(descriptors.map((descriptor) => Object.freeze({ ...descriptor })));
}

export function recipeHydrationRecoveryReasonForTab(tab: 'usedIn' | 'producedBy'): RecipeHydrationRecoveryReason {
  return tab === 'usedIn'
    ? RECIPE_HYDRATION_RECOVERY_REASONS.usedInVisiblePack
    : RECIPE_HYDRATION_RECOVERY_REASONS.categoryWindowRecovery;
}

export function describeRecipeHydrationRecovery(reason: RecipeHydrationRecoveryReason): string {
  const descriptor = RECOVERY_DESCRIPTOR_BY_REASON.get(reason);
  if (!descriptor) {
    throw new Error(`Unknown recipe hydration recovery reason: ${reason}`);
  }
  return descriptor.label;
}

export function reportRecipeGroupHydrationFailure(
  source: Exclude<RecipeHydrationFailureSource, 'runtime-shard' | 'search-result-batch'>,
  recoveryReason: RecipeHydrationRecoveryReason,
  error: unknown,
): void {
  const descriptor = FAILURE_DESCRIPTOR_BY_SOURCE.get(source);
  const recovery = describeRecipeHydrationRecovery(recoveryReason);
  console.warn(`[recipe-hydration] ${descriptor?.message ?? source}; ${recovery}.`, error);
}

export function reportRecipeShardHydrationFailure(error: unknown): void {
  const descriptor = FAILURE_DESCRIPTOR_BY_SOURCE.get('runtime-shard');
  console.warn(`[recipe-hydration] ${descriptor?.message ?? 'Runtime recipe shard hydration failed'}.`, error);
}

export function reportRecipeSearchHydrationOmitted(recipeIds: readonly string[]): void {
  const descriptor = FAILURE_DESCRIPTOR_BY_SOURCE.get('search-result-batch');
  const count = recipeIds.length;
  if (count <= 0) {
    return;
  }
  console.debug(`[recipe-hydration] ${descriptor?.message ?? 'Recipe search hydration omitted'}; missing=${count}.`);
}

export const RECIPE_HYDRATION_POLICY_CATALOG = Object.freeze({
  abi: 'neonei.recipe-hydration-policy.v1',
  recoveryPolicy: 'full-shard-recovery-no-chunked-batch-fallback',
  recoveryDescriptors: RECIPE_HYDRATION_RECOVERY_DESCRIPTORS,
  failureDescriptors: RECIPE_HYDRATION_FAILURE_DESCRIPTORS,
});
