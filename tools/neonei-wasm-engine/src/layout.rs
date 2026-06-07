#[repr(C)]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct NativeLayoutCommand {
    pub entry_index: u32,
    pub x: u32,
    pub y: u32,
    pub size: u32,
    pub icon_x: u32,
    pub icon_y: u32,
    pub icon_size: u32,
}

pub fn compute_columns(viewport_width: u32, item_size: u32, gap: u32) -> u32 {
    let safe_width = viewport_width.max(1);
    let safe_item_size = item_size.max(1);
    let stride = safe_item_size.saturating_add(gap).max(1);
    (safe_width.saturating_add(gap) / stride).max(1)
}

pub fn compute_layout(
    entry_count: u32,
    viewport_width: u32,
    item_size: u32,
    gap: u32,
) -> Vec<NativeLayoutCommand> {
    let columns = compute_columns(viewport_width, item_size, gap);
    let safe_item_size = item_size.max(1);
    let icon_size = ((safe_item_size as f32) * 0.9).floor().max(1.0) as u32;
    let icon_inset = safe_item_size.saturating_sub(icon_size).saturating_add(1) / 2;
    let stride = safe_item_size.saturating_add(gap);

    (0..entry_count)
        .map(|entry_index| {
            let col = entry_index % columns;
            let row = entry_index / columns;
            let x = col.saturating_mul(stride);
            let y = row.saturating_mul(stride);
            NativeLayoutCommand {
                entry_index,
                x,
                y,
                size: safe_item_size,
                icon_x: x.saturating_add(icon_inset),
                icon_y: y.saturating_add(icon_inset),
                icon_size,
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn layout_positions_use_nei_stride() {
        let layout = compute_layout(12, 489, 44, 4);
        assert_eq!(layout[0].x, 0);
        assert_eq!(layout[0].y, 0);
        assert_eq!(layout[1].x, 48);
        assert_eq!(layout[10].x, 0);
        assert_eq!(layout[10].y, 48);
    }
}
