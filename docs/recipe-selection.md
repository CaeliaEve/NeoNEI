# Recorded Recipe Selection

`@neonei/catalog/source` exports `RecipeSelectionQuery`, the selection helpers,
and exact material quantity operations. The query is bound to one `Catalog`.
Requests and results carry both its content ID and the recipe ID.

```ts
import { RecipeSelectionQuery } from '@neonei/catalog/source';

const selector = new RecipeSelectionQuery(catalog);
const result = await selector.evaluate({
  catalog: catalog.manifest.id,
  recipe: recipeId,
  choices: [0, 1],
}, abortController.signal);
```

Omit `choices` to initialize the first recorded witness. Choice positions align
with `recipe.inputs`, including fluid columns; `-1` is legal only in a recorded
correlated tuple. Changing a correlated choice with `selectRecipeChoice` selects
a compatible complete tuple, retaining empty columns and stable ties.

Focus and observed-output selection reuse the former viewer initialization:

```ts
const focused = await selector.evaluate({
  catalog: catalog.manifest.id, recipe: recipeId,
  focus: { id: itemId, direction: 'uses' },
});
const observed = await selector.evaluate({
  catalog: catalog.manifest.id, recipe: recipeId,
  sample: { output: 0, index: 2 },
});
```

Initialization applies focus, explicit choices/mirror/order, then an explicit
sample witness. Unreachable NBT projections return `unmatched`; they do not
invent an input assignment. An output sample identifies an observation for the
recorded candidates, not an arbitrary stack simulation.

## Context And Scope

Only existing context-dependent adapters are exposed:

```ts
await selector.evaluate({
  catalog: catalog.manifest.id, recipe: enchanterRecipeId,
  context: { kind: 'enderioEnchanter', count: '32', bookPresent: true },
});
await selector.evaluate({
  catalog: catalog.manifest.id, recipe: decayRecipeId,
  context: { kind: 'decayChest', state: 'saved', tick: '9223372036854775807' },
});
```

- CreativeCore context supplies one signed-int decimal `counts` string per
  input column. Enchanter supplies signed-int `count` and book-slot presence.
- Decay accepts `fresh`, `empty`, `fault`, `saved`, or `inactive`. Saved/inactive
  states require a canonical signed-long `tick` string. The existing native
  coercion/overflow kernel performs at most 20 steps on owned tags.
- `order` is a compact permutation of item input slot numbers, not input column
  positions. Empty trailing physical cells are implicit. Fixed grids/masks
  reject conflicting orders; families without reorder semantics accept only
  their fixed order. Mirror permission comes from the recorded native layout.
- The adapters retain current 3x3, 4x4, world and inventory conventions. They
  delegate to the existing GT, IC2, AE, CreativeCore, Botania, ProjectRed,
  blood/orb/alchemy, soldering, arcane/jar, spinning, ritual/oven, Salis, Matter
  Manipulator and infusion kernels. Ritual dispatch still uses the last trigger.
- Native pool evaluation stays on `pool-preview`/`NativeBeePoolQuery`. Selection
  returns its constructor prototype with `missing-context`, never settlement.
- Gendustry template without observations suppresses products; genetics without
  observations retains its prototype. Matching-but-unobserved Matter states
  remain `matched`/`unobserved`, with no fabricated exact output. Daisy witnesses
  lacking a concrete block retain a prototype and report missing context.
- CAL 2.9 selects the recorded enum imprint and copied-machine observation.
  `imprintIds` are enum IDs; `id_imprint` uses native integer narrowing. The role
  gate reports a legacy `Type` lookup as `missing-context` with reason
  `cal-legacy-lookup-required`, not a false match. The public action still accepts
  recorded candidates only, not arbitrary machine NBT or caller-supplied native
  legacy-name lookup results.
- Other process laws are `unsupported`; their available recorded descriptions,
  quantities and sample projections remain accessible. No machine/player/world
  lifecycle, output-space, energy, chance-roll or arbitrary NBT simulator is
  introduced.

Every result has `scope: 'recorded-facts'` and one of `matched`, `unmatched`,
`missing-context`, `unsupported`. `matched` means acceptance or selection within
that recorded scope, **not** successful machine execution. Products retain the
original `Output` facts, including chance, quantity, return role and correlated
samples. `evidence` distinguishes `recorded`, `observed-sample`, `prototype`;
`sample` is an index or null. `guaranteed` is always false. Suppressed outputs
carry their slot and reason. Decay state/range facts are separate typed fields.
Missing catalog references and invalid parameters are errors, not no-match.

`calImprintResult(process, machine, imprint)` is also exported for a validated
CAL process. It returns an owned `{ registry, meta, nbt, amount: '1' }` descriptor:
only `id_imprint` is replaced, including when a legacy `Type` tag is present.
It deliberately returns no Catalog item ID and does not certify inventory
matching or legacy lookup. Callers must not reuse the offered machine's item ID
for a descriptor whose NBT has changed.

## Transport And Ownership

The existing `Api.read` action is shared by HTTP and offline:

```ts
const selection = { catalog: catalogId, recipe: recipeId, choices: [0, 1] };
const parameters = new URLSearchParams({ selection: JSON.stringify(selection) });
await api.read(['recipes', recipeId, 'selection'], parameters);
// HTTP: GET /api/catalog/:catalog/recipes/:recipe/selection?selection=<JSON>
await browserCatalog.evaluateSelection(selection, abortController.signal);
```

There is no new server or worker protocol. The client uses its existing
online/local/fallback transport, combines caller/session cancellation, checks
snapshot ownership again on response, and does not cache evaluation results.
It bypasses the existing recipe-detail-only interaction-worker shortcut.

The action accepts only one `selection` parameter, at most 4,096 JSON characters
and 81 input columns. Indices, duplicate/nonexistent order slots, mirror options,
context families and signed numbers are validated. Recorded sample evaluation
has a 65,536-unit candidate/sample work budget; larger facts fail explicitly.
The ordinary catalog reference/hydration budgets still apply. Calls check
cancellation around asynchronous reads; synchronous family work remains bounded.
Caller input and catalog facts are not mutated. Public results are owned and
deep-frozen; integer quantities and typed NBT values do not round-trip via float.
IC2's already-recorded native-double charge kernel is intentionally unchanged.

## Material Totals

`addMaterialQuantities`, `multiplyQuantity` and `parseBatches` live in the catalog
package and use decimal strings/bigint:

```ts
import { addMaterialQuantities, multiplyQuantity } from '@neonei/catalog/source';
addMaterialQuantities('9007199254740993.125', '0.875'); // '9007199254740994'
multiplyQuantity('0.125', 3n); // '0.375'
```

The existing nonrecursive material classification is preserved as the shared
`frontend/src/catalog/materials.ts` helper. It takes `{ language, t }` explicitly.
Chance, native/dynamic consumption, conditional returns and prototype outcomes
remain uncertain; they are not multiplied into guaranteed yields. The old
recipe-tool module is only a temporary locale-injecting presentation adapter.
Translations, note formatting and rendering data are not moved into the core.

These are extraction/regression guarantees, not a new native parity claim.
