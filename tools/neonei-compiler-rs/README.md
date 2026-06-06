# NeoNEI Rust Compiler Scaffold

This crate is the staged Rust compiler for NeoNEI runtime data.

Current scope:

- read Raw Export manifest,
- stream declared JSONL / JSONL.GZ files,
- generate deterministic baseline reports,
- provide the future `compile` CLI surface without replacing the production Node compiler yet.

The production path remains `scripts/compile-raw-export.mjs` until strict parity gates prove the Rust compiler output.

## Commands

```bash
cargo run --manifest-path tools/neonei-compiler-rs/Cargo.toml -- baseline \
  --input <raw-export> \
  --report .tmp-runtime/rust-baseline.json

cargo run --manifest-path tools/neonei-compiler-rs/Cargo.toml -- compile \
  --input <raw-export> \
  --output <dist-data> \
  --report .tmp-runtime/rust-compile-report.json \
  --strict
```

## Current Rust outputs

The compiler writes parity-first JSON artifacts under `dist-data/rust/`:

- `browser-pack.json`
- `search-pack.json`
- `recipe-pack.json`
- `texture-pack.json`
- `runtime-manifest.json`
- `integrity.json`
- `size-report.json`
- `missing-data-report.json`
- `migration-readiness.json`

These files intentionally do not replace the production Node outputs yet. They are compiled and compared by:

```bash
npm --prefix frontend run test:rust-compiler
npm --prefix frontend run test:rust-retirement
```

## Binary search index design

Binary search indexes are enabled only after JSON parity is green on real GTNH exports.

Planned layout:

```text
search-index.bin
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
- expose JSON sidecars until binary parity and debugging are proven;
- do not move large JS object arrays across any future WASM boundary.

## Binary recipe index design

Binary recipe indexes are enabled only after JSON recipe parity is green.

Planned layout:

```text
recipe-index.bin
  header: magic, version, recipe_count, item_count, handler_count
  recipe table: fixed-width offsets into payload shards
  item usage table: item ordinal -> produced/used posting-list offsets
  handler table: handler family and UI-layout offsets
  payload shards: compressed recipe UI payload slices
```

Rules:

- item → producedBy and item → usedIn are compile-time indexes;
- handler family/page grouping semantics must match GTNH NEI;
- special recipe metadata remains explicit for Thaumcraft, Botania, Blood Magic, GT machines, EEC, and multiblock blueprints;
- JSON payloads remain the inspection format until binary recipe opening benchmarks prove correctness and speed.
