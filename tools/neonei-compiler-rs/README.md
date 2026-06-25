# NeoNEI / Elysium Compiler

This crate is the in-repo staging home for the future `elysium-compiler` binary. It compiles NESQL++ Raw Export data into NeoNEI/Elysium browser-native runtime packs.

Current scope:

- inspect Raw Export manifests and declared files;
- validate Raw Export / optional dist-data diagnostics with strict blockers;
- emit the compiler schema/catalog contract;
- compile browser, search, recipe, texture, UI, and runtime report packs;
- support the same CLI shape expected from a future standalone `elysium-compiler` repository.

## Commands

```bash
cargo run --manifest-path tools/neonei-compiler-rs/Cargo.toml -- inspect   --input <raw-export>   --report .tmp-runtime/rust-inspect.json

cargo run --manifest-path tools/neonei-compiler-rs/Cargo.toml -- validate   --input <raw-export>   --report .tmp-runtime/rust-validate.json

cargo run --manifest-path tools/neonei-compiler-rs/Cargo.toml -- schemas   --output .tmp-runtime/elysium-compiler-schema-catalog.json

cargo run --manifest-path tools/neonei-compiler-rs/Cargo.toml -- compile   --input <raw-export>   --output <dist-data>   --report .tmp-runtime/rust-compile-report.json   --scope all   --strict
```

The old `baseline` command name has been retired. Use `inspect` for non-blocking Raw Export diagnostics and `validate` for strict diagnostics.

## Runtime outputs

The compiler writes production runtime artifacts under `dist-data/rust/` and related dist-data folders:

- `rust/browser.bin`
- `rust/groups.bin`
- `rust/search.bin`
- `rust/recipes.bin`
- `rust/textures.bin`
- `rust/atlas.meta.bin`
- `rust/animations.bin`
- `rust/strings.zh_cn.bin`
- `rust/runtime-manifest.json`
- `rust/integrity.json`
- `rust/size-report.json`
- `rust/missing-data-report.json`
- `rust/migration-readiness.json`
- `rust/deployment-report.json`
- `rust/ui-pack/ui_templates.bin`
- `rust/ui-pack/ui_bindings.bin`
- `rust/ui-pack/ui_strings.bin`
- `rust/ui-pack/ui_assets.manifest.json`
- `rust/ui-pack/ui_pack_report.json`
- `recipes/handler-layout-index.json`
- `recipes/ui-payload-index.json`
- `assets/ui-backgrounds/**`

## Extraction boundary

NeoNEI's finalizer can call either this in-repo Cargo compiler or an external compiler binary:

```bash
node scripts/finalize-native-ui-export.mjs   --compiler <path-to-elysium-compiler>   --raw-export <raw-export-dir>   --dist-data backend/public/dist-data
```

The finalizer is the only NeoNEI script that should know how to invoke the compiler. Frontend/backend runtime code should consume dist-data manifests and runtime packs only.

## Binary search index design

Binary search indexes are compile-time products.

```text
search.bin
  header: magic, version, endian, item_count, term_count
  item table: fixed-width offsets into string/term pools
  term table: normalized term hash + posting-list offset
  posting lists: delta-encoded item ordinals sorted by rank
  string pool: UTF-8 names, ids, mod ids, pinyin terms
```

Rules:

- keep all text normalized at compile time;
- store item ordinals, not repeated item ids, inside posting lists;
- preserve Chinese, pinyin full, pinyin acronym, mod id, internal name, localized name, and alias terms;
- avoid moving large JS object arrays across future WASM/native boundaries.

## Binary recipe index design

```text
recipes.bin
  header: magic, version, recipe_count, item_count, handler_count
  recipe table: fixed-width offsets into payload shards
  item usage table: item ordinal -> produced/used posting-list offsets
  handler table: handler family and UI-layout offsets
  payload shards: recipe UI payload slices
```

Rules:

- item ? producedBy and item ? usedIn are compile-time indexes;
- handler family/page grouping semantics must match GTNH NEI;
- special recipe metadata remains explicit for Thaumcraft, Botania, Blood Magic, GT machines, EEC, and multiblock blueprints;
- JSON reports remain inspection artifacts, not frontend runtime hot paths.
