import type { Choice, Input, NativeZeroFluidPolicy, Recipe } from '@elysium/contracts';

/** Zero is accepted only with the native family rule carried by the compiled recipe. */
export function validateZeroFluid(recipe: Recipe, input: Input, choice: Choice): void {
  if (choice.rule.kind !== 'nativeZeroFluid') {
    if (input.kind === 'fluid' && !/^[1-9][0-9]*$/.test(choice.amount)) throw new Error('Fluid amount needs a verified native zero policy');
    if (recipe.process?.kind === 'vat' && input.kind === 'fluid' && choice.consume.kind !== 'consume')
      throw new Error('VAT zero debit needs its native zero policy');
    return;
  }
  const policy = choice.rule.policy;
  let valid = input.kind === 'fluid' && choice.amount === '0'
    && choice.consume.kind === 'keep' && choice.returns.length === 0;
  if (policy === 'binnieIncubator') valid &&= recipe.source.handler === 'binnie.genetics.nei.IncubatorRecipeHandler'
    && input.slot===0 && recipe.process?.kind==='binnie_genetics' && recipe.process.machine==='incubator' && recipe.process.recipe.fluidInput.amount===0;
  else if (policy === 'vatMatch') valid &&= recipe.source.handler === 'crazypants.enderio.nei.VatRecipeHandler'
    && recipe.process?.kind === 'vat';
  else if (policy === 'gregtechCost' || policy === 'gregtechPresence') valid &&=
    ['gregtech.nei.GTNEIDefaultHandler', 'bartworks.neiHandler.BioLabNEIHandler', 'bartworks.neiHandler.BioVatNEIHandler'].includes(recipe.source.handler)
    && !recipe.process && recipe.source.key.startsWith('gtpp.recipe.multiblockrockbreaker/') === (policy === 'gregtechPresence');
  else valid = false;
  if (policy === 'gregtechPresence') {
    const fluids = recipe.inputs.filter(input => input.kind === 'fluid');
    valid &&= fluids.length === 2 && [0, 1].every(slot => {
      const requirement = fluids.find(input => input.slot === slot);
      return requirement?.choices.length === 1 && requirement.choices[0]?.rule.kind === 'nativeZeroFluid'
        && requirement.choices[0].rule.policy === 'gregtechPresence' && requirement.choices[0].amount === '0'
        && requirement.choices[0].consume.kind === 'keep' && requirement.choices[0].returns.length === 0;
    });
  }
  if (!valid) throw new Error('Invalid native zero-fluid policy');
}

export function validateZeroFluidRecipe(recipe: Recipe): void {
  for (const input of recipe.inputs) for (const choice of input.choices) validateZeroFluid(recipe, input, choice);
}

export function zeroFluidNote(policy: NativeZeroFluidPolicy, locale: 'zh-CN' | 'en-US' = 'zh-CN'): string {
  const notes: Record<NativeZeroFluidPolicy, [string, string]> = {
    gregtechCost: ['流体成本为零；成本检查不要求该流体。机器自身的匹配与条件仍需满足。',
      'Zero fluid cost; the cost check does not require this fluid. Machine lookup and conditions still apply.'],
    gregtechPresence: ['需有对应流体对象，可为零量；忽略 NBT，不消耗流体。',
      'Requires a matching fluid object, including zero volume. NBT is ignored; no fluid is consumed.'],
    vatMatch: ['需有同种流体及相同 NBT 的对象，可为零量；不消耗流体。',
      'Requires the same fluid and NBT, including zero volume. No fluid is consumed.'],
    binnieIncubator: ['需有同种流体及相同 NBT 的对象；流体成本为零，不消耗流体。',
      'Requires the same fluid and NBT. The native fluid cost is zero; no fluid is consumed.'],
  };
  return notes[policy][locale === 'en-US' ? 1 : 0];
}
