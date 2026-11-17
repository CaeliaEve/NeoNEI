import type { Chance, Fluid, GtNative, GtStack, Item, Kind, Recipe, Reference } from '@elysium/contracts';

const handlers = new Set(['gregtech.nei.GTNEIDefaultHandler',
  'bartworks.neiHandler.BioLabNEIHandler', 'bartworks.neiHandler.BioVatNEIHandler']);
const limit = 65536;
function ensure(value: unknown, message: string): asserts value {
  if (!value) throw new Error('GT native probability: ' + message);
}
function amount(value: string): void {
  ensure(/^(0|-?[1-9][0-9]*)$/.test(value) && value.length <= 11
    && BigInt(value) >= -2147483648n && BigInt(value) <= 2147483647n, 'invalid native stack amount');
}
function probability(chance: Chance, native: number): void {
  ensure(/^(0|[1-9][0-9]*)$/.test(chance.numerator) && /^[1-9][0-9]*$/.test(chance.denominator)
    && chance.numerator.length <= 19 && chance.denominator.length <= 19, 'invalid projected chance');
  const numerator = BigInt(chance.numerator), denominator = BigInt(chance.denominator);
  let a = numerator, b = denominator;
  while (b) [a, b] = [b, a % b];
  ensure(denominator <= 9223372036854775807n && a === 1n
    && numerator * 10000n === denominator * BigInt(native), 'projected chance differs from native slot');
}
export function effectiveGtChance(raw: readonly number[] | null | undefined, slot: number): number {
  return raw?.[slot] ?? 10000;
}

/** Includes native evidence that has no projected recipe edge, including disabled alternative slots. */
export function* gtNativeReferences(native: GtNative): Generator<Reference> {
  for (const [kind, inputs, outputs, alternatives] of [
    ['item', native.itemInputs, native.itemOutputs, native.itemAlternatives],
    ['fluid', native.fluidInputs, native.fluidOutputs, native.fluidAlternatives],
  ] as const) {
    for (const array of [inputs, outputs]) for (const stack of array) if (stack) yield { kind, id: stack.id };
    for (const array of alternatives ?? []) if (array) for (const stack of array) if (stack) yield { kind, id: stack.id };
  }
}

/** A probability projection is recorded evidence, never an executable machine simulator. */
export function validateGtProbabilityRecipe(recipe: Recipe, items?: ReadonlyMap<string, Item>, fluids?: ReadonlyMap<string, Fluid>): void {
  const native = recipe.gtNative;
  if (!native) {
    if (handlers.has(recipe.source.handler)) ensure(!recipe.inputs.some(input =>
      input.choices.some(choice => choice.consume.kind === 'chance')), 'chance consumption is missing its native evidence');
    return;
  }
  ensure(handlers.has(recipe.source.handler) && /^[a-f0-9]{64}$/.test(native.archiveSha256)
    && native.nativeRecipeClass.length > 0 && native.nativeRecipeClass.length <= 512, 'invalid native origin');
  ensure(native.policy.itemConsumption === 'nativeMatchingGroups' && native.policy.fluidConsumption === 'nativeSlots'
    && native.policy.sampler === 'gtIntegralChancedMultiplier', 'unsupported native consumption policy');
  let budget = 0;
  const stacks = (values: (GtStack | null)[]) => {
    budget += values.length; ensure(budget <= limit, 'slot/alternative budget exceeded');
    for (const stack of values) if (stack) amount(stack.amount);
  };
  for (const values of [native.itemInputs, native.itemOutputs, native.fluidInputs, native.fluidOutputs]) stacks(values);
  for (const alternatives of [native.itemAlternatives, native.fluidAlternatives]) if (alternatives) {
    ensure(alternatives.length <= limit, 'alternative slot budget exceeded');
    for (const values of alternatives) if (values) stacks(values);
  }
  for (const raw of [native.inputChances, native.outputChances, native.fluidInputChances, native.fluidOutputChances]) {
    if (raw) ensure(raw.length <= limit && raw.every(value => Number.isInteger(value) && value >= 0 && value <= 10000),
      'malformed raw chance');
  }
  for (const reference of gtNativeReferences(native)) {
    const facts = reference.kind === 'item' ? items : fluids;
    if (facts) ensure(facts.has(reference.id), 'missing native ' + reference.kind + ' reference');
  }
  const referenceOnly = native.policy.execution === 'referenceOnly';
  ensure(referenceOnly ? native.fake || !native.enabled
    : native.policy.execution === 'unresolvedMachineContext' && native.enabled, 'invalid execution policy');
  if (native.policy.projection === 'specializedProcess') {
    ensure(recipe.process?.kind === 'harmony' || recipe.source.key.startsWith('gt.recipe.scanner/')
      && recipe.inputs.some(input => input.kind === 'item' && input.choices.every(choice =>
        choice.rule.kind === 'member' && choice.consume.kind === 'consume'))
      && recipe.outputs.some(output => output.change?.action.kind === 'analyze'), 'invalid specialized projection');
    return;
  }
  ensure(native.policy.projection === 'nativeSlots' && (!native.fake || referenceOnly), 'invalid native slot projection');
  const input = (kind: Kind, slot: number) => recipe.inputs.find(input => input.kind === kind && input.slot === slot);
  const consumption = (choice: Recipe['inputs'][number]['choices'][number], chance: number, expected: string) => {
    ensure(choice.amount === expected, 'admission quantity was replaced by expected consumption');
    if (expected === '0') ensure(choice.consume.kind === 'keep', 'zero debit lost native policy');
    else {
      ensure(choice.consume.kind === 'chance', 'input lost native grouped/slot chance consumption');
      probability(choice.consume.chance, chance);
    }
  };
  let expectedInputs = 0;
  for (const [slot, stack] of native.itemInputs.entries()) {
    if (!stack) continue;
    const projected = input('item', slot); ensure(projected, 'missing item input slot'); expectedInputs++;
    const alternatives = native.itemAlternatives?.[slot];
    const amounts = alternatives?.length ? alternatives.map(value => {
      ensure(value, 'null item alternative'); return value.amount;
    }) : [stack.amount];
    for (const choice of projected.choices) {
      if (amounts.every(value => value === '0')) ensure(choice.amount === '1' && choice.consume.kind === 'keep',
        'zero-size item presence projection changed');
      else {
        ensure(amounts.includes(choice.amount), 'native item admission amount changed');
        consumption(choice, effectiveGtChance(native.inputChances, slot), choice.amount);
      }
    }
  }
  for (const [slot, stack] of native.fluidInputs.entries()) {
    ensure(stack, 'null fluid representative');
    const alternatives = native.fluidAlternatives?.[slot];
    if (alternatives?.length === 0) continue;
    const projected = input('fluid', slot); ensure(projected, 'missing fluid input slot'); expectedInputs++;
    const choices = stack.amount === '0' ? [stack] : alternatives ?? [stack];
    ensure(projected.choices.length === choices.length, 'fluid alternative cardinality changed');
    for (const [index, value] of choices.entries()) {
      const choice = projected.choices[index]!;
      ensure(value && !value.amount.startsWith('-') && choice.id === value.id, 'fluid alternative identity/order changed');
      consumption(choice, effectiveGtChance(native.fluidInputChances, slot), value.amount);
    }
  }
  const specials = recipe.inputs.filter(input => input.kind === 'item' && input.slot === 65535).length;
  ensure(recipe.inputs.length === expectedInputs + specials, 'projection contains nonnative input slots');
  let expectedOutputs = 0;
  for (const [kind, values, raw] of [
    ['item', native.itemOutputs, native.outputChances], ['fluid', native.fluidOutputs, native.fluidOutputChances],
  ] as const) {
    for (const [slot, stack] of values.entries()) {
      if (!stack) continue;
      const output = recipe.outputs.find(output => output.kind === kind && output.slot === slot);
      ensure(output && output.id === stack.id && (output.amount == null || output.amount === stack.amount),
        'native output slot identity/amount changed');
      probability(output.chance, effectiveGtChance(raw, slot)); expectedOutputs++;
    }
  }
  ensure(recipe.outputs.length === expectedOutputs, 'projection contains nonnative output slots');
}
