//! NeoNEI native surface engine core.
//!
//! This crate is intentionally small at the scaffold stage: it owns deterministic
//! layout and hit-test math that can be compiled both for native tests and for
//! `wasm32-unknown-unknown`. The TypeScript worker mirrors these contracts until
//! the browser loads the compiled WASM module.

pub mod compact_animation;
pub mod compact_browser;
pub mod compact_group;
pub mod compact_search;
pub mod compact_string;
pub mod compact_texture;
pub mod hit_test;
pub mod layout;

pub use compact_animation::{compact_animation_select_frame_index, parse_compact_animation_header};
pub use compact_browser::{
    compact_browser_project_count, compact_browser_project_indices,
    compact_browser_project_visible_indices, compact_browser_project_visible_indices_with_groups,
    parse_compact_browser_header,
};
pub use compact_group::parse_compact_group_header;
pub use compact_search::{
    compact_search_project_visible_indices, compact_search_project_visible_indices_with_groups,
    parse_compact_search_header,
};
pub use compact_string::parse_compact_string_header;
pub use compact_texture::{compact_texture_select_frame_index, parse_compact_texture_header};
pub use hit_test::{hit_test_index, NativeHit};
pub use layout::{compute_columns, compute_layout, NativeLayoutCommand};

/// C/WASM ABI helper for browser-side smoke tests and future worker bindings.
#[no_mangle]
pub extern "C" fn neonei_engine_compute_columns(
    viewport_width: u32,
    item_size: u32,
    gap: u32,
) -> u32 {
    compute_columns(viewport_width, item_size, gap)
}

/// Writes base layout commands into a caller-provided `u32` buffer.
///
/// Each command uses seven `u32` values:
/// `entryIndex, x, y, size, iconX, iconY, iconSize`.
/// The return value is the full command count. If `out_len` is smaller than
/// `entry_count * 7`, only the prefix that fits is written.
#[no_mangle]
pub unsafe extern "C" fn neonei_engine_write_layout_commands(
    entry_count: u32,
    viewport_width: u32,
    item_size: u32,
    gap: u32,
    out_ptr: *mut u32,
    out_len: u32,
) -> u32 {
    if out_ptr.is_null() || out_len == 0 {
        return entry_count;
    }
    let out = std::slice::from_raw_parts_mut(out_ptr, out_len as usize);
    let commands = compute_layout(entry_count, viewport_width, item_size, gap);
    let mut cursor = 0usize;
    for command in &commands {
        if cursor + 7 > out.len() {
            break;
        }
        out[cursor] = command.entry_index;
        out[cursor + 1] = command.x;
        out[cursor + 2] = command.y;
        out[cursor + 3] = command.size;
        out[cursor + 4] = command.icon_x;
        out[cursor + 5] = command.icon_y;
        out[cursor + 6] = command.icon_size;
        cursor += 7;
    }
    entry_count
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

/// Allocates linear-memory bytes for JS callers that need to pass binary packs
/// into the native engine without wasm-bindgen.
#[no_mangle]
pub extern "C" fn neonei_engine_alloc(len: u32) -> *mut u8 {
    let mut buffer = Vec::<u8>::with_capacity(len as usize);
    let ptr = buffer.as_mut_ptr();
    std::mem::forget(buffer);
    ptr
}

/// Releases memory allocated by `neonei_engine_alloc`.
///
/// # Safety
/// The pointer and length must match a previous successful allocation.
#[no_mangle]
pub unsafe extern "C" fn neonei_engine_dealloc(ptr: *mut u8, len: u32) {
    if ptr.is_null() || len == 0 {
        return;
    }
    drop(Vec::from_raw_parts(ptr, 0, len as usize));
}

/// Allocates u32-aligned linear memory for index buffers.
#[no_mangle]
pub extern "C" fn neonei_engine_alloc_u32(len: u32) -> *mut u32 {
    let mut buffer = Vec::<u32>::with_capacity(len as usize);
    let ptr = buffer.as_mut_ptr();
    std::mem::forget(buffer);
    ptr
}

/// Releases memory allocated by `neonei_engine_alloc_u32`.
///
/// # Safety
/// The pointer and length must match a previous successful allocation.
#[no_mangle]
pub unsafe extern "C" fn neonei_engine_dealloc_u32(ptr: *mut u32, len: u32) {
    if ptr.is_null() || len == 0 {
        return;
    }
    drop(Vec::from_raw_parts(ptr, 0, len as usize));
}

unsafe fn wasm_slice<'a>(ptr: *const u8, len: u32) -> Option<&'a [u8]> {
    if ptr.is_null() {
        return None;
    }
    Some(std::slice::from_raw_parts(ptr, len as usize))
}

unsafe fn wasm_str<'a>(ptr: *const u8, len: u32) -> Option<&'a str> {
    let bytes = wasm_slice(ptr, len)?;
    std::str::from_utf8(bytes).ok()
}

/// Returns the compact browser item count, or 0 when the payload is invalid.
#[no_mangle]
pub unsafe extern "C" fn neonei_engine_compact_browser_item_count(ptr: *const u8, len: u32) -> u32 {
    let Some(bytes) = wasm_slice(ptr, len) else {
        return 0;
    };
    parse_compact_browser_header(bytes)
        .map(|header| header.item_count)
        .unwrap_or(0)
}

/// Returns the projected item count for a compact browser payload and query/mod
/// filter. This is the first WASM ABI step toward moving search projection out
/// of TypeScript and into the native runtime.
#[no_mangle]
pub unsafe extern "C" fn neonei_engine_compact_browser_project_count(
    pack_ptr: *const u8,
    pack_len: u32,
    query_ptr: *const u8,
    query_len: u32,
    mod_ptr: *const u8,
    mod_len: u32,
) -> u32 {
    let Some(pack) = wasm_slice(pack_ptr, pack_len) else {
        return 0;
    };
    let query = wasm_str(query_ptr, query_len).unwrap_or("");
    let mod_filter = wasm_str(mod_ptr, mod_len).unwrap_or("");
    compact_browser_project_count(pack, query, mod_filter).unwrap_or(0)
}

/// Writes projected compact browser row indices into `out_ptr` and returns the
/// full projected count. When the count is larger than `out_len`, only the first
/// `out_len` indices are written.
#[no_mangle]
pub unsafe extern "C" fn neonei_engine_compact_browser_project_indices(
    pack_ptr: *const u8,
    pack_len: u32,
    query_ptr: *const u8,
    query_len: u32,
    mod_ptr: *const u8,
    mod_len: u32,
    out_ptr: *mut u32,
    out_len: u32,
) -> u32 {
    let Some(pack) = wasm_slice(pack_ptr, pack_len) else {
        return 0;
    };
    let query = wasm_str(query_ptr, query_len).unwrap_or("");
    let mod_filter = wasm_str(mod_ptr, mod_len).unwrap_or("");
    let out = if out_ptr.is_null() || out_len == 0 {
        None
    } else {
        Some(std::slice::from_raw_parts_mut(out_ptr, out_len as usize))
    };
    compact_browser_project_indices(pack, query, mod_filter, out).unwrap_or(0)
}

/// Writes group-aware visible entries into `out_ptr` and returns the full
/// projected count. Encoded output uses bit 31 as collapsed group flag and the
/// lower 31 bits as compact browser row index.
#[no_mangle]
pub unsafe extern "C" fn neonei_engine_compact_browser_project_visible_indices(
    pack_ptr: *const u8,
    pack_len: u32,
    query_ptr: *const u8,
    query_len: u32,
    mod_ptr: *const u8,
    mod_len: u32,
    expanded_ptr: *const u8,
    expanded_len: u32,
    out_ptr: *mut u32,
    out_len: u32,
) -> u32 {
    let Some(pack) = wasm_slice(pack_ptr, pack_len) else {
        return 0;
    };
    let query = wasm_str(query_ptr, query_len).unwrap_or("");
    let mod_filter = wasm_str(mod_ptr, mod_len).unwrap_or("");
    let expanded_groups = wasm_str(expanded_ptr, expanded_len).unwrap_or("");
    let out = if out_ptr.is_null() || out_len == 0 {
        None
    } else {
        Some(std::slice::from_raw_parts_mut(out_ptr, out_len as usize))
    };
    compact_browser_project_visible_indices(pack, query, mod_filter, expanded_groups, out)
        .unwrap_or(0)
}

/// Writes group-aware visible entries using both browser and group packs.
/// Expanded groups are emitted in-place from the group member list, matching
/// the native NEI interaction model instead of leaving far-away browser rows in
/// their original raw order.
#[no_mangle]
pub unsafe extern "C" fn neonei_engine_compact_browser_project_visible_indices_with_groups(
    browser_ptr: *const u8,
    browser_len: u32,
    group_ptr: *const u8,
    group_len: u32,
    query_ptr: *const u8,
    query_len: u32,
    mod_ptr: *const u8,
    mod_len: u32,
    expanded_ptr: *const u8,
    expanded_len: u32,
    out_ptr: *mut u32,
    out_len: u32,
) -> u32 {
    let Some(browser_pack) = wasm_slice(browser_ptr, browser_len) else {
        return 0;
    };
    let Some(group_pack) = wasm_slice(group_ptr, group_len) else {
        return 0;
    };
    let query = wasm_str(query_ptr, query_len).unwrap_or("");
    let mod_filter = wasm_str(mod_ptr, mod_len).unwrap_or("");
    let expanded_groups = wasm_str(expanded_ptr, expanded_len).unwrap_or("");
    let out = if out_ptr.is_null() || out_len == 0 {
        None
    } else {
        Some(std::slice::from_raw_parts_mut(out_ptr, out_len as usize))
    };
    compact_browser_project_visible_indices_with_groups(
        browser_pack,
        group_pack,
        query,
        mod_filter,
        expanded_groups,
        out,
    )
    .unwrap_or(0)
}

#[no_mangle]
pub unsafe extern "C" fn neonei_engine_compact_search_project_visible_indices_with_groups(
    browser_ptr: *const u8,
    browser_len: u32,
    search_ptr: *const u8,
    search_len: u32,
    group_ptr: *const u8,
    group_len: u32,
    query_ptr: *const u8,
    query_len: u32,
    mod_ptr: *const u8,
    mod_len: u32,
    expanded_ptr: *const u8,
    expanded_len: u32,
    out_ptr: *mut u32,
    out_len: u32,
) -> u32 {
    let Some(browser_pack) = wasm_slice(browser_ptr, browser_len) else {
        return 0;
    };
    let Some(search_pack) = wasm_slice(search_ptr, search_len) else {
        return 0;
    };
    let Some(group_pack) = wasm_slice(group_ptr, group_len) else {
        return 0;
    };
    let query = wasm_str(query_ptr, query_len).unwrap_or("");
    let mod_filter = wasm_str(mod_ptr, mod_len).unwrap_or("");
    let expanded_groups = wasm_str(expanded_ptr, expanded_len).unwrap_or("");
    let out = if out_ptr.is_null() || out_len == 0 {
        None
    } else {
        Some(std::slice::from_raw_parts_mut(out_ptr, out_len as usize))
    };
    compact_search_project_visible_indices_with_groups(
        browser_pack,
        search_pack,
        group_pack,
        query,
        mod_filter,
        expanded_groups,
        out,
    )
    .unwrap_or(0)
}

/// Returns the compact group count, or 0 when the payload is invalid.
#[no_mangle]
pub unsafe extern "C" fn neonei_engine_compact_group_count(ptr: *const u8, len: u32) -> u32 {
    let Some(bytes) = wasm_slice(ptr, len) else {
        return 0;
    };
    parse_compact_group_header(bytes)
        .map(|header| header.group_count)
        .unwrap_or(0)
}

/// Returns the compact string-pack item count, or 0 when the payload is invalid.
#[no_mangle]
pub unsafe extern "C" fn neonei_engine_compact_string_item_count(ptr: *const u8, len: u32) -> u32 {
    let Some(bytes) = wasm_slice(ptr, len) else {
        return 0;
    };
    parse_compact_string_header(bytes)
        .map(|header| header.item_count)
        .unwrap_or(0)
}

/// Returns the compact texture item count, or 0 when the payload is invalid.
#[no_mangle]
pub unsafe extern "C" fn neonei_engine_compact_texture_item_count(ptr: *const u8, len: u32) -> u32 {
    let Some(bytes) = wasm_slice(ptr, len) else {
        return 0;
    };
    parse_compact_texture_header(bytes)
        .map(|header| header.item_count)
        .unwrap_or(0)
}

/// Returns the compact animation item count, or 0 when the payload is invalid.
#[no_mangle]
pub unsafe extern "C" fn neonei_engine_compact_animation_item_count(
    ptr: *const u8,
    len: u32,
) -> u32 {
    let Some(bytes) = wasm_slice(ptr, len) else {
        return 0;
    };
    parse_compact_animation_header(bytes)
        .map(|header| header.item_count)
        .unwrap_or(0)
}

/// Returns the selected local texture frame index for a compact texture row.
/// `u32::MAX` means the pack/row has no valid animated frame.
#[no_mangle]
pub unsafe extern "C" fn neonei_engine_compact_texture_select_frame_index(
    ptr: *const u8,
    len: u32,
    row_index: u32,
    now_ms: u32,
) -> u32 {
    let Some(bytes) = wasm_slice(ptr, len) else {
        return u32::MAX;
    };
    compact_texture_select_frame_index(bytes, row_index, now_ms).unwrap_or(u32::MAX)
}

/// Returns the selected exported animation frame index for a compact animation row.
/// `u32::MAX` means the pack/row has no valid animated frame.
#[no_mangle]
pub unsafe extern "C" fn neonei_engine_compact_animation_select_frame_index(
    ptr: *const u8,
    len: u32,
    row_index: u32,
    now_ms: u32,
) -> u32 {
    let Some(bytes) = wasm_slice(ptr, len) else {
        return u32::MAX;
    };
    compact_animation_select_frame_index(bytes, row_index, now_ms).unwrap_or(u32::MAX)
}

/// Writes search-pack projected visible entries into `out_ptr`.
///
/// Empty queries should keep using browser-pack projection so the default
/// browser order remains identical to the exported NEI order. Non-empty queries
/// can call this function to use normalized/pinyin search metadata without JS
/// object scanning.
#[no_mangle]
pub unsafe extern "C" fn neonei_engine_compact_search_project_visible_indices(
    browser_ptr: *const u8,
    browser_len: u32,
    search_ptr: *const u8,
    search_len: u32,
    query_ptr: *const u8,
    query_len: u32,
    mod_ptr: *const u8,
    mod_len: u32,
    expanded_ptr: *const u8,
    expanded_len: u32,
    out_ptr: *mut u32,
    out_len: u32,
) -> u32 {
    let Some(browser_pack) = wasm_slice(browser_ptr, browser_len) else {
        return 0;
    };
    let Some(search_pack) = wasm_slice(search_ptr, search_len) else {
        return 0;
    };
    let query = wasm_str(query_ptr, query_len).unwrap_or("");
    let mod_filter = wasm_str(mod_ptr, mod_len).unwrap_or("");
    let expanded_groups = wasm_str(expanded_ptr, expanded_len).unwrap_or("");
    let out = if out_ptr.is_null() || out_len == 0 {
        None
    } else {
        Some(std::slice::from_raw_parts_mut(out_ptr, out_len as usize))
    };
    compact_search_project_visible_indices(
        browser_pack,
        search_pack,
        query,
        mod_filter,
        expanded_groups,
        out,
    )
    .unwrap_or(0)
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
    fn writes_layout_commands_to_u32_buffer() {
        let mut out = vec![0u32; 14];
        let count = unsafe {
            neonei_engine_write_layout_commands(2, 489, 44, 4, out.as_mut_ptr(), out.len() as u32)
        };
        assert_eq!(count, 2);
        assert_eq!(&out[0..7], &[0, 0, 0, 44, 3, 3, 39]);
        assert_eq!(&out[7..14], &[1, 48, 0, 44, 51, 3, 39]);
    }

    #[test]
    fn hit_test_matches_grid_slot() {
        assert_eq!(neonei_engine_hit_test_index(24, 24, 489, 44, 4, 130), 0);
        assert_eq!(neonei_engine_hit_test_index(52, 24, 489, 44, 4, 130), 1);
        assert_eq!(neonei_engine_hit_test_index(999, 999, 489, 44, 4, 130), -1);
    }
}
