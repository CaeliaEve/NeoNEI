//! NeoNEI native surface engine core.
//!
//! This crate is intentionally small at the scaffold stage: it owns deterministic
//! layout and hit-test math that can be compiled both for native tests and for
//! `wasm32-unknown-unknown`. The TypeScript worker mirrors these contracts until
//! the browser loads the compiled WASM module.

pub mod hit_test;
pub mod layout;

pub use hit_test::{hit_test_index, NativeHit};
pub use layout::{compute_columns, compute_layout, NativeLayoutCommand};

/// C/WASM ABI helper for browser-side smoke tests and future worker bindings.
#[no_mangle]
pub extern "C" fn neonei_engine_compute_columns(viewport_width: u32, item_size: u32, gap: u32) -> u32 {
    compute_columns(viewport_width, item_size, gap)
}

/// C/WASM ABI helper. Returns -1 when the pointer misses every visible slot.
#[no_mangle]
pub extern "C" fn neonei_engine_hit_test_index(
    x: u32,
    y: u32,
    viewport_width: u32,
    item_size: u32,
    gap: u32,
    entry_count: u32,
) -> i32 {
    hit_test_index(x, y, viewport_width, item_size, gap, entry_count)
        .map(|index| index as i32)
        .unwrap_or(-1)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn columns_never_drop_below_one() {
        assert_eq!(compute_columns(0, 44, 4), 1);
        assert_eq!(compute_columns(10, 44, 4), 1);
    }

    #[test]
    fn computes_expected_columns() {
        assert_eq!(compute_columns(489, 44, 4), 10);
    }

    #[test]
    fn hit_test_matches_grid_slot() {
        assert_eq!(neonei_engine_hit_test_index(24, 24, 489, 44, 4, 130), 0);
        assert_eq!(neonei_engine_hit_test_index(52, 24, 489, 44, 4, 130), 1);
        assert_eq!(neonei_engine_hit_test_index(999, 999, 489, 44, 4, 130), -1);
    }
}
