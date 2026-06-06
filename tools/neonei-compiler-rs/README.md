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
