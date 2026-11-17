import type {Item, Recipe} from '@elysium/contracts';
import {nativeNbtEqual} from './native-nbt.ts';

type Process = Extract<NonNullable<Recipe['process']>, {kind: 'nativeInfusion'}>;
export type EnhancedIngredient = NonNullable<Process['pattern']['predicates']>[number];
type Specimen = Pick<Item, 'registry' | 'meta' | 'nbt' | 'tags'>;
type Template = Process['declaredInput'];
const invalid = (): never => { throw new Error('Invalid enhanced infusion predicate'); };

/** Bounded source-bound predicates; their templates are not renderable item facts. */
export function validateEnhancedIngredients(predicates: readonly EnhancedIngredient[]): void {
  if (!predicates.length || predicates.length > 4096) invalid();
  let nodes = 0;
  const template = (value: Template): void => {
    if (!value.registry || !/^[^:\s]+:[^:\s]+$/.test(value.registry)
      || !Number.isInteger(value.metadata) || value.metadata < -2147483648 || value.metadata > 2147483647
      || value.nbt != null && value.nbt.type !== 'compound') invalid();
  };
  const visit = (predicate: EnhancedIngredient, depth: number): void => {
    if (++nodes > 262144 || depth > 16) invalid();
    switch (predicate.kind) {
      case 'never': return;
      case 'ore': if (predicate.name.length > 4096) invalid(); return;
      case 'items':
        if (predicate.templates.length > 4096) invalid();
        predicate.templates.forEach(template); return;
      case 'any':
        if (predicate.options.length > 4096) invalid();
        predicate.options.forEach(option => visit(option, depth + 1)); return;
      case 'deferred': template(predicate.template); visit(predicate.rule, depth + 1); return;
      default: invalid();
    }
  };
  predicates.forEach(predicate => visit(predicate, 0));
}

export function enhancedIngredientMatch(predicate: EnhancedIngredient, item: Specimen, depth = 0): boolean {
  if (depth > 16) invalid();
  switch (predicate.kind) {
    case 'never': return false;
    case 'ore': return (!predicate.exclusive || item.tags.length === 1) && item.tags.includes(predicate.name);
    case 'items': return predicate.templates.some(template => template.registry === item.registry
      && (template.metadata === 32767 || template.metadata === item.meta)
      && (!predicate.nbt || nativeNbtEqual(template.nbt, item.nbt)));
    case 'any': return predicate.options.some(option => enhancedIngredientMatch(option, item, depth + 1));
    case 'deferred': return enhancedIngredientMatch(predicate.rule, item, depth + 1);
    default: return invalid();
  }
}

/** Enhanced startup removes each first match and deliberately accepts leftovers. */
export function enhancedComponentsMatch(predicates: readonly EnhancedIngredient[], outer: readonly Specimen[]): boolean {
  const remaining = [...outer];
  for (const predicate of predicates) {
    const first = remaining.findIndex(item => enhancedIngredientMatch(predicate, item));
    if (first < 0) return false;
    remaining.splice(first, 1);
  }
  return true;
}
