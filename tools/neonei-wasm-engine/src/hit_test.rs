use crate::layout::compute_columns;

#[repr(C)]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct NativeHit {
    pub entry_index: u32,
}

pub fn hit_test_index(
    x: u32,
    y: u32,
    viewport_width: u32,
    item_size: u32,
    gap: u32,
    entry_count: u32,
) -> Option<u32> {
    if entry_count == 0 {
        return None;
    }

    let safe_item_size = item_size.max(1);
    let stride = safe_item_size.saturating_add(gap).max(1);
    let columns = compute_columns(viewport_width, safe_item_size, gap);
    let col = x / stride;
    let row = y / stride;
    let inside_x = x % stride;
    let inside_y = y % stride;

    if col >= columns || inside_x >= safe_item_size || inside_y >= safe_item_size {
        return None;
    }

    let index = row.saturating_mul(columns).saturating_add(col);
    (index < entry_count).then_some(index)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ignores_gap_between_slots() {
        assert_eq!(hit_test_index(45, 10, 489, 44, 4, 130), None);
    }

    #[test]
    fn rejects_out_of_range_slots() {
        assert_eq!(hit_test_index(480, 900, 489, 44, 4, 20), None);
    }
}
