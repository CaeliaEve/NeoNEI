import { assertTable, type Input, type Item, type Output, type Recipe } from '@elysium/contracts';
import { Catalog, Fault } from './store.ts';
import { Query } from './query.ts';
import { creativeCoreSelect } from './creativecore.ts';
import { aeCraftingSelect } from './ae-crafting.ts';
import { wirelessTerminalMatches } from './wireless-terminal.ts';
import { projectRedSelect } from './projectred.ts';
import { botaniaRunicSelect } from './botania.ts';
import { botaniaWorldSelect } from './botania-world.ts';
import { bloodOrbSelect } from './blood-orb.ts';
import { bloodAlchemySelect, logisticsSolderingSelect } from './inventory-process.ts';
import { arcaneSpecialMatch } from './arcane-special.ts';
import { witcherySpinningSelect } from './witchery-spinning.ts';
import { witchingSpinningSelect } from './witching-spinning.ts';
import { nativeOvenSelect } from './native-oven.ts';
import { nativeRitualDispatch, nativeRitualSelectItems } from './native-ritual.ts';
import { salisInventoryMatch } from './salis-wand.ts';
import { matterManipulatorSelect } from './matter-manipulator.ts';
import { disguiseInfusionSelect } from './infusion-disguise.ts';
import { nativeInfusionMatch } from './infusion.ts';
import { enchanterAccepts } from './enchanter.ts';
import { ic2AdvancedOrder } from './ic2-advanced.ts';
import { decayBatch, type DecayBatch } from './decay-state.ts';
import { randomInfusionCostRanges } from './infusion-cost.ts';
import { calImprintAccepts } from './cal-imprint.ts';
import {
  correlatedRecipeOutput, recipeChoiceIndex, recipeGridCells, recipeSampleIndex,
  selectCraftingNbtSample, selectGtCraftingSample, selectIc2AdvancedSample, selectRecipeChoice, selectRecipeSample,
  type Selection,
} from './selection.ts';

type Items = ReadonlyMap<string, Item>;
export type RecipeSelectionContext =
  | { kind: 'creativeCoreCrafting'; counts: readonly string[] }
  | { kind: 'enderioEnchanter'; count: string; bookPresent: boolean }
  | { kind: 'decayChest'; state: 'fresh' | 'empty' | 'fault' | 'saved' | 'inactive'; tick?: string };
export interface RecipeSelectionOptions {
  choices?: readonly number[];
  mirrored?: boolean;
  /** Compact slot order, with unoccupied trailing physical cells implicit. */
  order?: readonly number[];
  focus?: { id: string; direction: 'recipes' | 'uses' };
  sample?: { output: number; index: number };
}
export interface RecipeSelectionRequest extends RecipeSelectionOptions {
  catalog: string;
  recipe: string;
  context?: RecipeSelectionContext;
}
export interface RecipeSelectionState {
  readonly choices: readonly number[];
  readonly mirrored: boolean;
  readonly order: readonly number[];
  readonly reachable: boolean;
}
export type RecipeSelectionStatus = 'matched' | 'unmatched' | 'missing-context' | 'unsupported';
export type RecipeObservation = 'observed' | 'unobserved' | 'prototype' | 'none';
export interface RecipeSelectedProduct {
  readonly output: Output;
  readonly sample: number | null;
  readonly evidence: 'recorded' | 'observed-sample' | 'prototype';
  readonly conditional: boolean;
  /** Matching and selecting a recorded fact never certify machine completion. */
  readonly guaranteed: false;
}
export interface RecipeFactEvaluation {
  readonly status: RecipeSelectionStatus;
  readonly scope: 'recorded-facts';
  readonly observation: RecipeObservation;
  readonly reason: string | null;
  readonly state: RecipeSelectionState;
  readonly products: readonly RecipeSelectedProduct[];
  readonly suppressed: readonly { slot: number; reason: string }[];
  readonly decay?: DecayBatch;
  readonly infusionRanges?: ReturnType<typeof randomInfusionCostRanges>;
}
export interface RecipeSelectionResult extends RecipeFactEvaluation {
  readonly catalog: string;
  readonly recipe: string;
}
export const recipeSelectionLimits = Object.freeze({ payload: 4096, inputs: 81, work: 65536 });
const key = (input: Input) => 'input' + input.kind + input.slot;
function invalid(message = 'Invalid recipe selection'): never { throw new Fault('invalid_query', message, 400); }
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}
function fields(value: Record<string, unknown>, allowed: readonly string[]): void {
  if (Object.keys(value).some(key => !allowed.includes(key))) invalid();
}
const id = (value: unknown): value is string => typeof value === 'string' && value.length > 0
  && value.length <= 256 && /^[\x21-\x7e]+$/.test(value);
function signed(value: unknown, bits: 32 | 64, label: string): asserts value is string {
  if (typeof value !== 'string' || value.length > (bits === 32 ? 11 : 20) || !/^(0|-?[1-9][0-9]*)$/.test(value)
    || BigInt(value) < -(1n << BigInt(bits - 1)) || BigInt(value) >= 1n << BigInt(bits - 1)) invalid('Invalid ' + label);
}
function context(value: unknown): RecipeSelectionContext {
  const data = object(value);
  if (data.kind === 'creativeCoreCrafting') {
    fields(data, ['kind', 'counts']);
    if (!Array.isArray(data.counts) || data.counts.length > recipeSelectionLimits.inputs) invalid('Invalid selection counts');
    data.counts.forEach(count => signed(count, 32, 'selection count'));
  } else if (data.kind === 'enderioEnchanter') {
    fields(data, ['kind', 'count', 'bookPresent']); signed(data.count, 32, 'selection count');
    if (typeof data.bookPresent !== 'boolean') invalid('Invalid selection book context');
  } else if (data.kind === 'decayChest') {
    fields(data, ['kind', 'state', 'tick']);
    if (!['fresh', 'empty', 'fault', 'saved', 'inactive'].includes(String(data.state))) invalid('Invalid decay selection state');
    if (data.state === 'saved' || data.state === 'inactive') signed(data.tick, 64, 'decay tick');
    else if (data.tick !== undefined) invalid('Unexpected decay tick');
  } else invalid('Invalid recipe selection context');
  return structuredClone(data) as unknown as RecipeSelectionContext;
}

/** Strict transport boundary. Numeric quantities and native NBT are never accepted as JSON floats. */
export function readRecipeSelectionRequest(value: unknown): RecipeSelectionRequest {
  const data = object(value);
  fields(data, ['catalog', 'recipe', 'choices', 'mirrored', 'order', 'focus', 'sample', 'context']);
  if (typeof data.catalog !== 'string' || !/^[a-f0-9]{64}$/.test(data.catalog) || !id(data.recipe)) invalid();
  if (data.choices !== undefined && (!Array.isArray(data.choices) || data.choices.length > recipeSelectionLimits.inputs
    || data.choices.some(choice => !Number.isSafeInteger(choice) || choice < -1))) invalid('Invalid selection choices');
  if (data.mirrored !== undefined && typeof data.mirrored !== 'boolean') invalid('Invalid selection mirror');
  if (data.order !== undefined && (!Array.isArray(data.order) || data.order.length > recipeSelectionLimits.inputs
    || new Set(data.order).size !== data.order.length
    || data.order.some(slot => !Number.isSafeInteger(slot) || slot < 0))) invalid('Invalid selection order');
  if (data.focus !== undefined) {
    const focus = object(data.focus); fields(focus, ['id', 'direction']);
    if (!id(focus.id) || !['recipes', 'uses'].includes(String(focus.direction))) invalid('Invalid selection focus');
  }
  if (data.sample !== undefined) {
    const sample = object(data.sample); fields(sample, ['output', 'index']);
    if (!Number.isSafeInteger(sample.output) || Number(sample.output) < 0
      || !Number.isSafeInteger(sample.index) || Number(sample.index) < 0) invalid('Invalid selection sample');
  }
  if (data.context !== undefined) context(data.context);
  if (JSON.stringify(data).length > recipeSelectionLimits.payload) invalid('Recipe selection payload exceeds limit');
  return structuredClone(data) as unknown as RecipeSelectionRequest;
}

function selected(recipe: Recipe, choices: readonly number[]): Selection {
  if (choices.length !== recipe.inputs.length) invalid('Selection choices do not cover the recipe');
  const bindings = correlatedRecipeOutput(recipe)?.change?.bindings;
  const result: Selection = {};
  recipe.inputs.forEach((input, column) => {
    const index = choices[column]!;
    if (!Number.isInteger(index) || index < -1 || index === -1 && !bindings?.some(tuple => tuple[column] === -1)
      || index >= 0 && !input.choices[index]) invalid('Invalid recipe selection candidate');
    result[key(input)] = index;
  });
  if (bindings && !bindings.some(tuple => tuple.length === choices.length && tuple.every((index, at) => index === choices[at]))) {
    invalid('Selection is not a recorded correlated tuple');
  }
  return result;
}
export function recipeSelectedChoice(recipe: Recipe, selection: Selection, input: Input) {
  const index = recipeChoiceIndex(recipe, selection, input);
  if (index === -1) return undefined;
  const choice = input.choices[index];
  if (!choice) throw new Error('Recipe input is missing its selected candidate');
  return choice;
}
export function recipeItemInput(recipe: Recipe, slot: number): Input {
  const input = recipe.inputs.find(input => input.kind === 'item' && input.slot === slot);
  if (!input) throw new Error('Native grid refers to a missing recipe input');
  return input;
}
export function moveRecipeOffered(order: readonly number[], cell: number, direction: -1 | 1): number[] {
  if (!Number.isInteger(cell) || cell < 0 || cell >= order.length || direction !== -1 && direction !== 1) invalid('Invalid selection order move');
  const result = [...order], next = cell + direction;
  if (next >= 0 && next < result.length) [result[cell], result[next]] = [result[next]!, result[cell]!];
  return result;
}
function allowsMirror(recipe: Recipe): boolean {
  const p = recipe.process;
  return Boolean(recipe.grid?.mirror || p?.kind === 'ic2Advanced' && p.layout.mirroredOrder
    || p?.kind === 'xuMicroblock' && p.states.some(state => state.offeredMirrored));
}
function offeredInputSlots(recipe: Recipe): number[] {
  if (recipe.process?.kind === 'botaniaWorld') return recipe.process.inputSlots.filter((slot): slot is number => slot != null);
  return recipe.inputs.filter(input => input.kind === 'item'
    && (recipe.process?.kind !== 'botaniaRunic' || input.slot !== 16)
    && (recipe.process?.kind !== 'bloodAlchemy' || input.slot !== 5)).map(input => input.slot);
}
function validateOrder(recipe: Recipe, order: readonly number[]): void {
  const expected = offeredInputSlots(recipe);
  if (order.length !== expected.length || new Set(order).size !== order.length || order.some(slot => !expected.includes(slot))) {
    invalid('Invalid recipe selection order');
  }
}

/** Initialization/focus/sample selection formerly performed by the recipe watcher. No caller state is changed. */
export function initializeRecipeSelection(recipe: Recipe, items: Items, options: RecipeSelectionOptions = {}): RecipeSelectionState {
  const selection: Selection = {};
  let mirrored = false, reachable = true;
  let order = offeredInputSlots(recipe);
  const sample = (output: Output, index: number) => {
    const change = output.change;
    if (!change || !Number.isInteger(index) || index < 0 || !change.samples[index]) invalid('Invalid selection sample');
    if (change.action.kind === 'gtCrafting') ({ mirrored, order } = selectGtCraftingSample(recipe, selection, index));
    else if (change.action.kind === 'ic2Advanced') ({ mirrored, order } = selectIc2AdvancedSample(recipe, selection, index));
    else if (change.action.kind === 'xuResult' && recipe.process?.kind === 'xuMicroblock') {
      selectRecipeSample(recipe, selection, index); mirrored = recipe.process.states[index]!.offeredMirrored;
    } else if (change.action.kind === 'craftingNbt') {
      const witness = selectCraftingNbtSample(recipe, selection, output, index, items);
      reachable = witness !== undefined; if (reachable) mirrored = witness!;
    } else if (change.bindings) selectRecipeSample(recipe, selection, index);
    else selection['inputitem' + change.input] = index;
  };
  if (recipe.process?.kind === 'gtCrafting') ({ mirrored, order } = selectGtCraftingSample(recipe, selection, 0));
  if (recipe.process?.kind === 'ic2Advanced') ({ mirrored, order } = selectIc2AdvancedSample(recipe, selection, 0));
  if (correlatedRecipeOutput(recipe)) selectRecipeSample(recipe, selection, 0);
  if (options.focus?.direction === 'uses') {
    for (const input of recipe.inputs) {
      const index = input.choices.findIndex(choice => choice.id === options.focus!.id);
      if (index >= 0) { selectRecipeChoice(recipe, selection, input, index); if (recipe.process?.kind === 'buildcraftIntegration') break; }
    }
  } else if (options.focus) {
    for (const output of recipe.outputs) {
      const index = output.change?.samples.findIndex(sample => sample.id === options.focus!.id) ?? -1;
      if (index >= 0) { sample(output, index); break; }
    }
  }
  if (options.choices !== undefined) Object.assign(selection, selected(recipe, options.choices));
  if (options.mirrored !== undefined) {
    if (options.mirrored && !allowsMirror(recipe)) invalid('Recipe selection does not allow mirror');
    mirrored = options.mirrored;
  }
  if (options.order !== undefined) {
    validateOrder(recipe, options.order);
    const p = recipe.process;
    const fixed = p?.kind === 'ic2Advanced' && !p.layout.shapeless ? ic2AdvancedOrder(recipe, mirrored)
      : recipe.grid || p?.kind === 'xuMicroblock' || p?.kind === 'fmpMicroblock' || p?.kind === 'bannerPattern'
        ? recipeGridCells(recipe, mirrored).filter((slot): slot is number => slot != null) : null;
    const ordered = ['gtCrafting', 'ic2Advanced', 'creativeCoreCrafting', 'aeCrafting', 'projectRedCrafting',
      'botaniaRunic', 'botaniaWorld', 'bloodOrbCrafting', 'bloodAlchemy', 'witchingSpinning', 'salisReplacement', 'matterManipulatorUpgrade'];
    const expected = fixed ?? (ordered.includes(p?.kind ?? '') ? null : order);
    if (expected && (options.order.length !== expected.length || options.order.some((slot, cell) => slot !== expected[cell]))) {
      invalid('Selection order conflicts with fixed input placement');
    }
    order = [...options.order];
  }
  if (options.sample) {
    const output = recipe.outputs[options.sample.output];
    if (!output) invalid('Invalid selection output');
    sample(output, options.sample.index);
  }
  return { choices: recipe.inputs.map(input => recipeChoiceIndex(recipe, selection, input)), mirrored, order, reachable };
}

export function evaluateDecayContext(process: NonNullable<Recipe['process']>,
  request: Extract<RecipeSelectionContext, { kind: 'decayChest' }>): DecayBatch {
  if (process.kind !== 'decayChest' || process.scope !== 'nativeStateLaw') invalid('Recipe has no native decay context');
  const data = context(request) as typeof request;
  let input: Extract<NonNullable<Item['nbt']>, { type: 'compound' }> | null = null;
  if (data.state === 'empty') input = { type: 'compound', value: {} };
  else if (data.state === 'fault') input = { type: 'compound', value: { TickableItem: { type: 'string', value: 'wrong type' } } };
  else if (data.state !== 'fresh') input = { type: 'compound', value: { TickableItem: { type: 'compound', value: {
    Tick: { type: 'long', value: data.tick! }, isActive: { type: 'byte', value: data.state === 'saved' ? '1' : '0' },
  } } } };
  return decayBatch(process.maxTicks, input);
}

/** Evaluates already-validated recorded facts. The catalog-bound query below is the public trust boundary. */
export function evaluateRecipeFacts(recipe: Recipe, items: Items, state: RecipeSelectionState,
  suppliedContext?: RecipeSelectionContext): RecipeFactEvaluation {
  const selection = selected(recipe, state.choices), p = recipe.process;
  const requestContext = suppliedContext === undefined ? undefined : context(suppliedContext);
  if (requestContext && requestContext.kind !== p?.kind) invalid('Selection context belongs to another family');
  if (requestContext?.kind === 'creativeCoreCrafting' && requestContext.counts.length !== recipe.inputs.length) invalid('Selection counts do not cover the recipe');
  const read = (slot: number | null): Item | null => {
    if (slot == null) return null;
    const choice = recipeSelectedChoice(recipe, selection, recipeItemInput(recipe, slot));
    if (!choice) return null;
    const item = items.get(choice.id);
    if (!item) throw new Error('Recipe selection is missing a concrete item');
    return item;
  };
  const offered = (length: number) => Array.from({ length }, (_, cell) => read(state.order[cell] ?? null));
  const hasGrid = recipe.grid || p?.kind === 'bannerPattern' || p?.kind === 'fmpMicroblock' || p?.kind === 'xuMicroblock';
  const cells = hasGrid ? recipeGridCells(recipe, state.mirrored) : [];
  const grid = (physical = true): (Item | null)[] => {
    const result: (Item | null)[] = Array(9).fill(null);
    for (const [cell, slot] of (recipe.grid ? cells : Array.from({ length: 9 }, (_, cell) => state.order[cell] ?? null)).entries()) {
      const at = physical && recipe.grid ? cell % recipe.grid.width + 3 * Math.floor(cell / recipe.grid.width) : cell;
      result[at] = read(slot);
    }
    return result;
  };
  const chosenItems = () => recipe.inputs.map(input => {
    const choice = recipeSelectedChoice(recipe, selection, input);
    if (!choice) return null;
    const item = items.get(choice.id); if (!item) throw new Error('Recipe selection is missing a concrete item');
    return item;
  });
  let status: RecipeSelectionStatus = 'matched', reason: string | null = null;
  let observation: RecipeObservation = 'none', matched = state.reachable, suppress = false, prototype = false;
  let decay: DecayBatch | undefined;
  if (!state.reachable) reason = 'sample-unreachable';
  else if (recipe.gtNative) {
    const referenceOnly = recipe.gtNative.policy.execution === 'referenceOnly';
    status = referenceOnly ? 'unsupported' : 'missing-context';
    reason = referenceOnly ? 'gt-reference-only' : 'gt-machine-context-required';
    observation = 'prototype'; prototype = true;
  }
  else if (p?.kind === 'nativeBotaniaPool') {
    status = 'missing-context'; reason = 'use-native-pool-preview'; observation = 'prototype'; prototype = true;
  } else if (p?.kind === 'creativeCoreCrafting') {
    if (requestContext?.kind !== p.kind) { status = 'missing-context'; reason = 'creative-counts-required'; suppress = true; }
    else {
      const offered = grid().map(item => item == null ? null : { item, count: 0 });
      for (const [cell, slot] of (recipe.grid ? cells : Array.from({ length: 9 }, (_, cell) => state.order[cell] ?? null)).entries()) {
        if (slot == null) continue;
        const at = recipe.grid ? cell % recipe.grid.width + 3 * Math.floor(cell / recipe.grid.width) : cell;
        const column = recipe.inputs.findIndex(input => input.kind === 'item' && input.slot === slot);
        if (offered[at]) offered[at]!.count = Number(requestContext.counts[column]);
      }
      matched = creativeCoreSelect(p, offered) != null;
    }
  } else if (p?.kind === 'enderioEnchanter') {
    if (requestContext?.kind !== p.kind) { status = 'missing-context'; reason = 'enchanter-inventory-required'; suppress = true; }
    else matched = requestContext.bookPresent && enchanterAccepts(p, requestContext.count);
  } else if (p?.kind === 'calImprint') {
    const machine = read(p.machine), imprint = read(p.imprint);
    const accepted = machine == null ? false : calImprintAccepts(p, 'machine', machine);
    if (accepted === null) {
      status = 'missing-context'; reason = 'cal-legacy-lookup-required'; suppress = true;
    } else matched = accepted && imprint != null && calImprintAccepts(p, 'imprint', imprint) === true;
  } else if (p?.kind === 'aeCrafting') matched = aeCraftingSelect(p, grid()) != null;
  else if (p?.kind === 'wirelessTerminalUpgrade') matched = wirelessTerminalMatches(p, cells.map(read));
  else if (p?.kind === 'projectRedCrafting') matched = projectRedSelect(p, grid(false)) != null;
  else if (p?.kind === 'botaniaRunic') matched = botaniaRunicSelect(p, offered(16)) != null;
  else if (p?.kind === 'botaniaWorld') {
    if (p.machine === 'daisy' && p.inputSlots[0] == null) {
      status = 'missing-context'; reason = 'world-block-required'; prototype = true; observation = 'prototype';
    } else matched = botaniaWorldSelect(p, offered(p.machine === 'petal' ? 16 : p.machine === 'brewery' ? 6 : Math.max(1, state.order.length))) != null;
  } else if (p?.kind === 'bloodOrbCrafting') matched = bloodOrbSelect(p, grid()) != null;
  else if (p?.kind === 'bloodAlchemy') {
    const orb = read(5); matched = orb != null && bloodAlchemySelect(p, offered(5), orb.registry) != null;
  } else if (p?.kind === 'logisticsSoldering') matched = logisticsSolderingSelect(p, cells.map(read));
  else if (p?.kind === 'arcaneSpecial' || p?.kind === 'stickyJar') matched = arcaneSpecialMatch(p, items, grid()) === true;
  else if (p?.kind === 'witcherySpinning') {
    const offered = chosenItems().map((item, column) => {
      const choice = recipeSelectedChoice(recipe, selection, recipe.inputs[column]!);
      return item && choice?.rule.kind === 'metadata' ? { ...item, meta: choice.rule.value } : item;
    });
    const modifiers = offered.slice(1); while (modifiers.length < 3) modifiers.push(null);
    const fibre = recipeSelectedChoice(recipe, selection, recipeItemInput(recipe, 0));
    matched = fibre != null && witcherySpinningSelect(p, offered[0] ?? null, Number(fibre.amount), modifiers) === p.selected;
  } else if (p?.kind === 'witchingSpinning') {
    const offered = state.order.map(read); while (offered.length < 5) offered.push(null);
    matched = witchingSpinningSelect(p, offered) === p.selected;
  } else if (p?.kind === 'witcheryNativeRitual') {
    const offered = recipe.inputs.filter(input => input.kind === 'item').map(input => read(input.slot));
    const trigger = offered.at(-1);
    matched = offered.every(item => item != null) && trigger != null
      && nativeRitualDispatch(p, trigger)?.target === p.triggerTarget && nativeRitualSelectItems(p, offered as Item[]) === p.selected;
  } else if (p?.kind === 'witcheryNativeOven') {
    const input = read(0); matched = input != null && nativeOvenSelect(p, input, p.jarStock) === p.selected;
  } else if (p?.kind === 'salisReplacement') matched = salisInventoryMatch(recipe, offered(9), items);
  else if (p?.kind === 'matterManipulatorUpgrade') {
    const match = matterManipulatorSelect(p, state.order.map(read)); matched = match != null;
    if (match?.status === 'unobserved') { observation = 'unobserved'; reason = 'native-normalization-unobserved'; suppress = true; }
  } else if (p?.kind === 'disguiseInfusion' || p?.kind === 'nativeInfusion') {
    const offered = chosenItems();
    matched = offered.every(item => item != null) && (p.kind === 'disguiseInfusion'
      ? disguiseInfusionSelect(p, offered[0]!, offered.slice(1) as Item[]) != null
      : nativeInfusionMatch(p, offered[0]!, offered.slice(1) as Item[], items));
  } else if (p?.kind === 'decayChest' && p.scope === 'nativeStateLaw') {
    if (requestContext?.kind !== p.kind) { status = 'missing-context'; reason = 'decay-state-required'; prototype = true; observation = 'prototype'; }
    else { decay = evaluateDecayContext(p, requestContext); suppress = decay.outcome !== 'complete'; reason = 'native-decay-' + decay.outcome; }
  } else if (p && !['gtCrafting', 'ic2Advanced', 'craftingNbt', 'rolling', 'qed', 'xuMicroblock', 'fmpMicroblock',
    'gendustryTemplate', 'gendustryGenetics', 'buildcraftIntegration', 'bannerPattern'].includes(p.kind)) {
    status = 'unsupported'; reason = 'execution-law-not-evaluated'; prototype = true; observation = 'prototype';
  }
  if (!matched) { status = 'unmatched'; reason ??= 'recorded-predicate-rejected'; suppress = true; }
  const products: RecipeSelectedProduct[] = [], suppressed: { slot: number; reason: string }[] = [];
  for (const output of recipe.outputs) {
    if (suppress) { suppressed.push({ slot: output.slot, reason: reason ?? 'recorded-predicate-rejected' }); continue; }
    if ((p?.kind === 'gendustryTemplate' || p?.kind === 'gendustryGenetics') && output.change?.samples.length === 0) {
      status = 'missing-context'; reason = 'native-result-unobserved';
      if (p.kind === 'gendustryTemplate') { observation = 'unobserved'; suppressed.push({ slot: output.slot, reason }); continue; }
      prototype = true; observation = 'prototype';
    }
    let product = output, sample: number | null = null;
    if (output.change && (!prototype || status === 'unsupported')) {
      const index = recipeSampleIndex(recipe, selection, output, items, state.mirrored, state.order);
      if (index < 0) { suppressed.push({ slot: output.slot, reason: 'recorded-predicate-rejected' }); continue; }
      const observed = output.change.samples[index];
      if (!observed) throw new Error('Selected input is missing its recorded product sample');
      product = { ...output, ...observed }; sample = index;
    }
    products.push({ output: structuredClone(product), sample, evidence: sample != null ? 'observed-sample' : prototype ? 'prototype' : 'recorded',
      conditional: Boolean(recipe.gtNative || p || output.change || output.quantity || output.amount == null || output.chance.numerator !== output.chance.denominator),
      guaranteed: false });
  }
  if (status === 'matched' && !products.length && suppressed.length && !suppress) {
    status = 'unmatched'; reason = 'recorded-predicate-rejected';
  }
  if (observation === 'none' && products.some(product => product.evidence === 'observed-sample')) observation = 'observed';
  return { status, scope: 'recorded-facts', observation, reason, state: structuredClone(state), products, suppressed,
    ...(decay ? { decay } : {}), ...(p?.kind === 'nativeInfusion' && p.randomAspects != null
      ? { infusionRanges: randomInfusionCostRanges(p.randomAspects) } : {}) };
}

function budget(recipe: Recipe): void {
  const count = recipe.inputs.length;
  let work = count + recipe.outputs.length;
  if (count > recipeSelectionLimits.inputs) invalid('Recipe selection input budget exceeded');
  for (const input of recipe.inputs) work += input.choices.length;
  for (const output of recipe.outputs) work += (output.change?.samples.length ?? 0) * (count * count + 1);
  if (work > recipeSelectionLimits.work) invalid('Recipe selection work budget exceeded');
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { Object.freeze(value); Object.values(value).forEach(freeze); }
  return value;
}

/** One immutable Catalog owns recipe lookup, fact validation and every returned selection. No result cache. */
export class RecipeSelectionQuery {
  private readonly catalog: Catalog;
  private readonly query: Query;
  constructor(catalog: Catalog) { this.catalog = catalog; this.query = new Query(catalog); }
  async evaluate(value: RecipeSelectionRequest, signal?: AbortSignal): Promise<RecipeSelectionResult> {
    signal?.throwIfAborted();
    const request = readRecipeSelectionRequest(value);
    if (request.catalog !== this.catalog.manifest.id) invalid('Recipe selection belongs to another Catalog snapshot');
    const recipe = await this.catalog.record('recipes', request.recipe);
    signal?.throwIfAborted(); budget(recipe);
    const facts = await this.query.related([recipe]);
    signal?.throwIfAborted();
    const items = new Map(facts.items.map(item => [item.id, item]));
    const state = initializeRecipeSelection(recipe, items, request);
    selected(recipe, state.choices);
    if (state.mirrored && !allowsMirror(recipe)) invalid('Recipe selection does not allow mirror');
    const result = evaluateRecipeFacts(recipe, items, state, request.context);
    signal?.throwIfAborted();
    return freeze({ catalog: this.catalog.manifest.id, recipe: recipe.id, ...result });
  }
}

/** Explicit client response reader; stale snapshot/recipe responses are never accepted. */
export function readRecipeSelectionResult(value: unknown, catalog: string, recipe: string): RecipeSelectionResult {
  const data = object(value);
  if (data.catalog !== catalog || data.recipe !== recipe || data.scope !== 'recorded-facts'
    || !['matched', 'unmatched', 'missing-context', 'unsupported'].includes(String(data.status))
    || !['observed', 'unobserved', 'prototype', 'none'].includes(String(data.observation))
    || !(data.reason === null || typeof data.reason === 'string')
    || !Array.isArray(data.products) || !Array.isArray(data.suppressed)) invalid('Invalid recipe selection response');
  if (data.status === 'unmatched' && data.products.length > 0) invalid('Unmatched selection has products');
  const state = object(data.state);
  if (!Array.isArray(state.choices) || !Array.isArray(state.order) || typeof state.reachable !== 'boolean'
    || typeof state.mirrored !== 'boolean') invalid('Invalid recipe selection response state');
  readRecipeSelectionRequest({ catalog, recipe, choices: state.choices, order: state.order, mirrored: state.mirrored });
  for (const value of data.products) {
    const product = object(value);
    if (!['recorded', 'observed-sample', 'prototype'].includes(String(product.evidence))
      || typeof product.conditional !== 'boolean' || product.guaranteed !== false
      || product.sample !== null && (!Number.isSafeInteger(product.sample) || Number(product.sample) < 0)
      || (product.evidence === 'observed-sample') !== (product.sample !== null)) invalid('Invalid recipe selection product');
    assertTable({ kind: 'recipes', records: [{
      id: recipe, source: { owner: 'neonei', handler: 'recorded-facts', key: 'selection' }, category: 'category_selection',
      order: 0, inputs: [], outputs: [product.output], properties: {}, process: null, grid: null, magic: null,
      duration: null, energy: null, view: null,
    }] });
  }
  for (const value of data.suppressed) {
    const entry = object(value);
    if (!Number.isSafeInteger(entry.slot) || Number(entry.slot) < 0 || typeof entry.reason !== 'string') invalid('Invalid suppressed recipe output');
  }
  if (data.decay !== undefined) {
    const decay = object(data.decay); fields(decay, ['input', 'state', 'outcome', 'steps']);
    if (!['fault', 'ongoing', 'complete'].includes(String(decay.outcome)) || !Number.isSafeInteger(decay.steps)
      || Number(decay.steps) < 0 || Number(decay.steps) > 20) invalid('Invalid selection decay facts');
    for (const tags of [decay.input, decay.state]) {
      if (tags !== null && object(tags).type !== 'compound') invalid('Invalid selection decay state');
      assertTable({ kind: 'items', records: [{
        id: 'item_selection', registry: 'neonei:selection', name: 'text_selection', meta: 0, nbt: tags,
        armor: false, durability: 0, stackLimit: 1, tags: [], tools: {}, tooltip: [], icon: null,
      }] });
    }
  }
  if (data.infusionRanges !== undefined) {
    if (!Array.isArray(data.infusionRanges) || data.infusionRanges.length > 4096) invalid('Invalid selection infusion ranges');
    const seen = new Set<string>();
    for (const value of data.infusionRanges) {
      const range = object(value); fields(range, ['aspect', 'min', 'max']);
      if (!id(range.aspect) || seen.has(range.aspect) || !Number.isSafeInteger(range.min) || !Number.isSafeInteger(range.max)
        || Number(range.min) < 0 || Number(range.max) > 2147483647 || Number(range.max) < Number(range.min)) invalid('Invalid selection infusion range');
      seen.add(range.aspect);
    }
  }
  return freeze(structuredClone(data)) as unknown as RecipeSelectionResult;
}
