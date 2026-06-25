# Compiler Split Plan

## Decision

NeoNEI's Rust compiler should become an independently maintainable compiler, but it should not be moved to a separate repository immediately.

The correct path is:

1. Modularize and contract-harden the compiler inside NeoNEI first.
2. Make NeoNEI call it only through a stable CLI boundary.
3. Add schema fixtures and conformance tests.
4. Extract it to a standalone repository only after the raw-export and dist-data contracts stabilize.

This avoids creating cross-repository version friction while Native UI export, UI assets, and runtime packs are still changing quickly.

## Current Evidence

- Compiler source has been split out of `tools/neonei-compiler-rs/src/main.rs`; `main.rs` is now a thin CLI bootstrap that calls `neonei_compiler::commands::run_command`.
- Pack compiler code is now separated under `tools/neonei-compiler-rs/src/packs/`, with focused modules for browser/search/recipe/texture/UI/runtime reports.
- `scripts/finalize-native-ui-export.mjs` directly points to `tools/neonei-compiler-rs/Cargo.toml` and runs `cargo test` / `cargo run` against that in-repo compiler.
- `scripts/finalize-native-ui-export.mjs` also supports `--compiler <path>` and `NEONEI_COMPILER_BIN`, so NeoNEI can call an external `elysium-compiler` binary through the same compile contract.
- The compiler output is consumed by NeoNEI frontend/backend through `backend/public/dist-data`, `rust/runtime-manifest.json`, and `rust/ui-pack/*` artifacts.
- Recent Native UI work changed the raw-export contract (`nativeBackground.assetRef`, UI background assets, nine-slice metadata), which proves the compiler contract is still actively evolving.

## Progress / Completion Log

### 2026-06-25 — Phase 1 compiler split foundation

- Completed thin binary entrypoint: `tools/neonei-compiler-rs/src/main.rs` now only parses CLI args and dispatches to the library.
- Split compiler orchestration into `src/commands.rs`; moved diagnostics reporting into `src/diagnostics.rs`; moved runtime report/debug cleanup into `src/runtime.rs`.
- Split pack compiler responsibilities into `src/packs/browser.rs`, `src/packs/search.rs`, `src/packs/recipe.rs`, `src/packs/texture.rs`, and `src/packs/ui.rs`.
- Moved unit tests out of the library root into `src/tests.rs`.
- Verification used during landing: Rust compiler tests, native UI gate regression, script syntax checks, frontend typecheck/build, and CodeGraph sync.

### 2026-06-25 — Phase 2 stable CLI boundary completed

- Replaced the old `baseline` command with explicit product commands: `inspect`, `validate`, `schemas`, and `compile`.
- Added `src/diagnostics.rs` as the shared Raw Export / dist-data diagnostics engine for `inspect`, `validate`, and post-compile reports.
- Added `src/schemas.rs` to emit the stable Elysium compiler schema/catalog contract, including raw-export manifest requirements, captured `nativeBackground.assetRef` policy, dist-data runtime entrypoints, UI pack schemas, and recipe UI payload index schema.
- Updated `scripts/rust-compiler-gate.mjs` to use `inspect` instead of the retired `baseline` command.
- Updated `scripts/native-ui-gate-regression.test.mjs` so the architecture gate rejects a return to `baseline` and requires `diagnostics` / `schemas` modules plus `Inspect` / `Validate` / `Schemas` CLI variants.
- Added Rust coverage proving `inspect`, `validate`, and `schemas` run through the stable `Cli -> run_command` boundary against compiler-owned fixtures.
- Updated `tools/neonei-compiler-rs/README.md` to document the current CLI and runtime outputs.

### 2026-06-25 — Phase 3 fixture corpus started

- Added compiler-owned fixture corpus under `tools/neonei-compiler-rs/fixtures/`.
- Added `raw-export-minimal`, a fixed raw-export fixture that compiles through the stable `Cli -> run_command` boundary and verifies runtime manifest, UI pack, layout report, recipe UI payload, and materialized background output.
- Added `raw-export-missing-background-should-fail`, a strict failure fixture proving a declared captured UI background asset cannot silently downgrade to a semantic fallback when the asset file is absent.
- Removed the in-test temporary raw-export generator from `src/tests.rs`; fixture tests now use stable on-disk fixtures via `compiler_fixture_path(...)`.
- Locked the fixture corpus in `scripts/native-ui-gate-regression.test.mjs` so regression gates reject a return to ad-hoc generated fixtures.

### 2026-06-25 — Phase 3 fixture corpus expanded

- Added `raw-export-native-ui-gt`, a GregTech native UI fixture proving captured `assets/ui-backgrounds/gregtech/nei_single_recipe.png` is copied into dist-data and listed by UI/runtime reports.
- Added `raw-export-semantic-background-only`, proving semantic GT backgrounds can compile strictly without a materialized captured asset when the raw-export uses `nativeBackground.status = semantic` and does not declare an `assetRef`.
- Added `raw-export-sharded-recipes`, proving the compiler reads every recipe shard declared by `recipes/recipe-index.json` and emits all recipe UI payload index entries.
- Added `raw-export-texture-atlas`, proving strict texture compilation copies runtime atlas assets and reports zero missing atlas asset files.
- Added expected report corpus under `tools/neonei-compiler-rs/fixtures/expected/` for runtime manifests, native UI layout reports, UI pack reports, UI asset manifests, integrity reports, texture reports, and sharded recipe UI payload indexes.
- Added Rust conformance tests that compile each fixture through the stable `Cli -> run_command` boundary and compare key outputs against the expected corpus.

## Goals

- Make the compiler a clean build-time product, not a large tool hidden inside NeoNEI.
- Preserve fast iteration while NESQL++ raw-export and NeoNEI runtime contracts are still evolving.
- Reduce long-term coupling between NeoNEI frontend/backend and raw-export internals.
- Keep the path open for a future standalone repo such as `elysium-compiler`.
- Maintain strict, fail-fast verification for missing assets, schema drift, and non-portable paths.

## Non-Goals

- Do not immediately create a new repo.
- Do not introduce legacy compatibility shims for old raw-export shapes.
- Do not preserve two competing compiler implementations.
- Do not make NeoNEI frontend parse raw-export directly.
- Do not weaken strict validation to make extraction easier.

## Target Architecture

Short term:

```text
NeoNEI/
  tools/neonei-compiler-rs/
    src/
      main.rs
      cli.rs
      manifest.rs
      raw_export/
      dist_data/
      packs/
      reports/
      binary/
      schema/
      validation/
```

Future extraction:

```text
elysium-compiler/
  crates/
    elysium-compiler-cli/
    elysium-raw-export/
    elysium-runtime-pack/
    elysium-binary-ir/
    elysium-schema/
  schemas/
  fixtures/
  docs/
```

NeoNEI should eventually depend on a compiler binary, not compiler source internals:

```powershell
node scripts/finalize-native-ui-export.mjs `
  --compiler E:\tools\elysium-compiler.exe `
  --raw-export <raw-export-dir> `
  --dist-data backend/public/dist-data
```

The in-repo compiler remains the default until the external compiler is stable.

## Phase 1 — Internal Modularization

**Status:** Completed on 2026-06-25. See the progress log above for landed modules and verification scope.

### Work

Split `tools/neonei-compiler-rs/src/main.rs` into focused modules:

```text
src/
  main.rs              # thin entrypoint only
  cli.rs               # clap args and scope selection
  manifest.rs          # raw/dist manifest loading and path policy
  raw_export/          # raw-export readers and schema structs
  dist_data/           # dist-data manifest writer and output layout
  packs/               # browser/search/recipes/textures/animations/ui/strings packs
  reports/             # runtime, native-ui, integrity, size, readiness reports
  binary/              # binary wrapper, string tables, numeric encoders
  schema/              # schema version constants and compatibility policy
  validation/          # strict gates and conformance checks
```

### Acceptance Criteria

- `main.rs` contains only CLI bootstrap and high-level dispatch.
- Each pack compiler is in its own module.
- No behavior change in generated artifacts.
- Existing tests still pass:

```powershell
cargo test --manifest-path tools/neonei-compiler-rs/Cargo.toml
node --test scripts/native-ui-gate-regression.test.mjs
node --check scripts/validate-native-ui-layouts.mjs
node --check scripts/validate-rust-recipe-runtime.mjs
```

## Phase 2 — Stable CLI Boundary

**Status:** Completed on 2026-06-25. The stable `compile`, `inspect`, `validate`, and `schemas` commands are landed; external binary invocation remains supported through `scripts/finalize-native-ui-export.mjs --compiler` / `NEONEI_COMPILER_BIN`.

### Work

Make the compiler invokable as a stable product:

```text
neonei-compiler compile
neonei-compiler inspect
neonei-compiler validate
neonei-compiler schemas
```

Required compile flags:

```text
--input <raw-export-dir>
--output <dist-data-dir>
--scope <all|native-ui|search|browser|recipes|ui|textures>
--strict
--report <report-path>
```

Update `scripts/finalize-native-ui-export.mjs` to support:

```text
--compiler <path-to-binary>
NEONEI_COMPILER_BIN=<path-to-binary>
```

Fallback behavior:

1. Use explicit `--compiler` when provided.
2. Use `NEONEI_COMPILER_BIN` when provided.
3. Fall back to in-repo Cargo compiler.

### Acceptance Criteria

- NeoNEI finalizer can run with either external binary or in-repo Cargo compiler.
- The selected compiler path is written to the final export report.
- No absolute Windows paths leak into runtime manifests.
- Strict compile still fails on missing declared UI assets.

## Phase 3 — Schema and Fixture Corpus

**Status:** Mostly completed. The compiler-owned fixtures now cover minimal Native UI, GregTech captured UI, missing captured background failure, semantic-only background, sharded recipes, and texture atlas assets. Schema examples are emitted by the `schemas` command and documented in `tools/neonei-compiler-rs/README.md`; remaining Phase 3 work is limited to adding more domain-specific fixture breadth if new raw-export contracts appear.

### Work

Create compiler-owned fixtures:

```text
tools/neonei-compiler-rs/fixtures/
  raw-export-minimal/
  raw-export-native-ui-gt/
  raw-export-missing-background-should-fail/
  raw-export-semantic-background-only/
  raw-export-sharded-recipes/
  raw-export-texture-atlas/
```

Create expected outputs for key reports:

```text
expected/
  runtime-manifest.json
  native-ui-layout-report.json
  ui-pack-report.json
  ui-assets.manifest.json
  integrity.json
```

Add schema docs or JSON examples for:

```text
raw-export manifest
nativeBackground
ui background assets
runtime manifest
ui pack manifest
recipe UI payload index
```

### Acceptance Criteria

- Missing captured UI background asset fails in fixture tests.
- Semantic-only background fixture is allowed to use fallback semantics.
- Native UI GT fixture proves `assets/ui-backgrounds/gregtech/nei_single_recipe.png` is copied and listed in runtime output.
- Fixtures run without the full GTNH dataset.

## Phase 4 — NeoNEI Consumer Decoupling

**Status:** Pending audit after the CLI/schema fixture corpus is complete.

### Work

Reduce NeoNEI frontend/backend assumptions about compiler internals.

NeoNEI should consume only:

```text
backend/public/dist-data/manifest.json
backend/public/dist-data/rust/runtime-manifest.json
backend/public/dist-data/rust/*.bin
backend/public/dist-data/rust/ui-pack/*
backend/public/dist-data/recipes/*
backend/public/dist-data/assets/ui-backgrounds/*
```

The frontend must not know raw-export file names.
The backend should serve compiled runtime artifacts, not compile-time intermediate assumptions.

### Acceptance Criteria

- Frontend runtime loaders only depend on dist-data manifests.
- Finalizer is the only NeoNEI script that knows how to call the compiler.
- Validator scripts verify dist-data outputs rather than compiler internals.
- No frontend/backend import depends on `tools/neonei-compiler-rs` paths.

## Phase 5 — Extraction Readiness Gate

**Status:** Pending. This cannot be marked complete until the stable CLI, fixture corpus, consumer decoupling audit, and external-binary strict compile gate all pass.

The compiler is ready to move to a standalone repository only when all conditions are met:

- `main.rs` is thin and modules are cleanly separated.
- CLI is stable and documented.
- Fixture corpus covers Native UI, recipes, search, browser, textures, and asset failures.
- NeoNEI finalizer supports external compiler binary.
- NeoNEI runtime only consumes dist-data contracts.
- NESQL++ raw-export schema has stopped changing every feature iteration.
- Full finalizer run passes with strict mode using the external binary path.

## Future Repo Name

The standalone compiler repository name is fixed as:

```text
elysium-compiler
```

Reason:

- It describes the broader role: compiling GTNH/NESQL++ raw-export data into Elysium/NeoNEI web-native runtime packs.
- It is not limited to the NeoNEI frontend name.
- It leaves room for future consumers beyond NeoNEI.
- It makes the compiler a first-class Elysium infrastructure project instead of a NeoNEI-local tool.

## Risks and Mitigations

### Risk: premature repo split slows active development

Mitigation:

- Keep compiler in NeoNEI until CLI, schemas, and fixtures are stable.

### Risk: schema drift between NESQL++ and compiler

Mitigation:

- Add fixture tests for every raw-export contract change.
- Fail fast on missing declared assets or unsupported schema versions.

### Risk: frontend silently hides compiler/export problems

Mitigation:

- Keep strict runtime validation.
- Do not silently downgrade captured assets to fake semantic fallbacks.

### Risk: large refactor changes runtime output

Mitigation:

- Refactor one module group at a time.
- Compare runtime manifests, report counts, and binary artifact hashes before/after where deterministic.

## Verification Commands

Run after each phase:

```powershell
cd E:\codex\ae2\NeoNEI
cargo test --manifest-path tools/neonei-compiler-rs/Cargo.toml
node --test scripts/native-ui-gate-regression.test.mjs
node --check scripts/validate-native-ui-layouts.mjs
node --check scripts/validate-rust-recipe-runtime.mjs
cd frontend
npm run typecheck --if-present
npm run build --if-present
```

When using a real export:

```powershell
cd E:\codex\ae2\NeoNEI
node scripts/finalize-native-ui-export.mjs `
  --raw-export "E:\GTNH\.minecraft\versions\GT New Horizons 2.8.4-java8\nesql\elysium-dev\raw-export" `
  --dist-data backend/public/dist-data
```

## Stop Condition

This plan is complete when NeoNEI can compile a real NESQL++ raw-export through a stable compiler CLI boundary, validate the generated dist-data strictly, and optionally swap the in-repo compiler for an external compiler binary without changing frontend/backend runtime code.

