import {canonical, type Item, type Nbt, type Recipe} from '@elysium/contracts';
import {nativeNbtInt} from './native-nbt.ts';

type Process = Extract<NonNullable<Recipe['process']>, {kind:'calImprint'}>;
type Offered = Pick<Item, 'registry' | 'meta' | 'nbt'>;
function invalid():never { throw new Error('Invalid native CAL imprint process'); }
function tags(item:Offered):Record<string,Nbt> {
  if (item.nbt == null) return {};
  return item.nbt.type === 'compound' ? item.nbt.value : invalid();
}
function ids(values:readonly number[]):void {
  if (!values.length || values.length > 1000 || values.some((id, at) =>
    !Number.isInteger(id) || id < 0 || id >= 1000 || at > 0 && values[at - 1]! >= id)) invalid();
}

/** A role gate after catalog-bound identity selection, not arbitrary stack admission.
 * null means native legacy item decoding/name lookup is required, not a failed match. */
export function calImprintAccepts(p:Process, role:'machine'|'imprint', item:Offered):boolean|null {
  if (role === 'imprint') return p.imprintIds.includes(item.meta);
  const root = tags(item);
  if (Object.hasOwn(root, 'Type')) return null;
  return !Object.hasOwn(root, 'id_imprint') || !p.imprintIds.includes(nativeNbtInt(root.id_imprint));
}

/** Installation itself preserves Type and every unrelated tag, even for legacy machines. */
export function calImprintResult(p:Process, machine:Offered, imprint:Offered):Offered & {amount:'1'} {
  if (!p.imprintIds.includes(imprint.meta)) invalid();
  const root = structuredClone(tags(machine));
  root.id_imprint = {type:'int',value:String(imprint.meta)};
  return {registry:machine.registry,meta:machine.meta,nbt:{type:'compound',value:root},amount:'1'};
}

export function validateCalImprintRecipe(r:Recipe, items?:ReadonlyMap<string,Item>):void {
  const p = r.process;
  if (p?.kind !== 'calImprint') invalid();
  ids(p.imprintIds);
  if (r.source.handler !== 'gregtech.nei.GTNEIImprintHandler'
    || p.nativeRecipe !== 'gregtech.common.recipes.CALImprintRecipe' || p.tag !== 'id_imprint'
    || p.occupiedLimit !== 2 || p.machine === p.imprint || r.inputs.length !== 2 || r.outputs.length !== 1
    || r.grid != null || r.magic != null || r.duration != null || r.energy != null) invalid();
  const machineColumn = r.inputs.findIndex(input => input.kind === 'item' && input.slot === p.machine);
  const imprintColumn = r.inputs.findIndex(input => input.kind === 'item' && input.slot === p.imprint);
  if (machineColumn < 0 || imprintColumn < 0) invalid();
  for (const [column, role] of [[machineColumn,'machine'], [imprintColumn,'imprint']] as const) {
    const input = r.inputs[column]!;
    if (!input.choices.length) invalid();
    for (const choice of input.choices) {
      if (choice.amount !== '1' || choice.consume.kind !== 'consume' || choice.returns.length !== 0
        || choice.rule.kind !== 'calInput' || choice.rule.role !== role
        || canonical(choice.rule.imprintIds) !== canonical(p.imprintIds)) invalid();
      if (items && calImprintAccepts(p, role, items.get(choice.id) ?? invalid()) !== true) invalid();
    }
  }
  const out = r.outputs[0]!, change = out.change ?? invalid();
  if (out.kind !== 'item' || out.role !== 'result' || out.amount !== '1' || out.quantity != null
    || out.chance.numerator !== '1' || out.chance.denominator !== '1'
    || change.input !== p.machine || change.action.kind !== 'calImprint' || change.action.imprint !== p.imprint
    || change.bindings == null || change.bindings.length !== change.samples.length
    || change.samples.length !== r.inputs[machineColumn]!.choices.length * r.inputs[imprintColumn]!.choices.length
    || !change.samples.length || out.id !== change.samples[0]!.id) invalid();
  const seen = new Set<string>();
  for (const [at, tuple] of change.bindings.entries()) {
    const key = canonical(tuple);
    if (tuple.length !== 2 || seen.has(key)) invalid();
    seen.add(key);
    const machine = r.inputs[machineColumn]!.choices[tuple[machineColumn]!];
    const imprint = r.inputs[imprintColumn]!.choices[tuple[imprintColumn]!];
    const sample = change.samples[at]!;
    if (!machine || !imprint || sample.amount !== '1') invalid();
    if (items) {
      const expected = calImprintResult(p, items.get(machine.id) ?? invalid(), items.get(imprint.id) ?? invalid());
      const result = items.get(sample.id) ?? invalid();
      if (result.registry !== expected.registry || result.meta !== expected.meta
        || canonical(result.nbt) !== canonical(expected.nbt)) invalid();
    }
  }
}
