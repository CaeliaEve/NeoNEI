const COMPACT_BROWSER_MAGIC: &[u8; 8] = b"NEIBRW1\0";
const COMPACT_BROWSER_VERSION: u32 = 1;
const COMPACT_BROWSER_ROW_STRIDE: u32 = 6;
const COMPACT_BROWSER_HEADER_BYTES: usize = 24;
pub const COMPACT_BROWSER_GROUP_COLLAPSED_FLAG: u32 = 0x8000_0000;
const COMPACT_BROWSER_INDEX_MASK: u32 = 0x7fff_ffff;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CompactBrowserHeader {
    pub item_count: u32,
    pub string_count: u32,
    pub row_stride: u32,
    offsets_start: usize,
    rows_start: usize,
    string_table_start: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CompactBrowserRow {
    pub item_id_ref: u32,
    pub localized_name_ref: u32,
    pub mod_id_ref: u32,
    pub group_key_ref: u32,
    pub browser_order: u32,
    pub flags: u32,
}

fn read_u32_le(bytes: &[u8], offset: usize) -> Option<u32> {
    let chunk = bytes.get(offset..offset + 4)?;
    Some(u32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
}

pub fn parse_compact_browser_header(bytes: &[u8]) -> Option<CompactBrowserHeader> {
    if bytes.len() < COMPACT_BROWSER_HEADER_BYTES {
        return None;
    }
    if bytes.get(0..8)? != COMPACT_BROWSER_MAGIC {
        return None;
    }
    let version = read_u32_le(bytes, 8)?;
    if version != COMPACT_BROWSER_VERSION {
        return None;
    }
    let item_count = read_u32_le(bytes, 12)?;
    let string_count = read_u32_le(bytes, 16)?;
    let row_stride = read_u32_le(bytes, 20)?;
    if row_stride != COMPACT_BROWSER_ROW_STRIDE {
        return None;
    }

    let offsets_start = COMPACT_BROWSER_HEADER_BYTES;
    let rows_start = offsets_start.checked_add((string_count as usize).checked_mul(4)?)?;
    let rows_bytes = (item_count as usize)
        .checked_mul(row_stride as usize)?
        .checked_mul(4)?;
    let string_table_start = rows_start.checked_add(rows_bytes)?;
    if string_table_start > bytes.len() {
        return None;
    }

    Some(CompactBrowserHeader {
        item_count,
        string_count,
        row_stride,
        offsets_start,
        rows_start,
        string_table_start,
    })
}

pub fn compact_browser_row(
    bytes: &[u8],
    header: CompactBrowserHeader,
    index: u32,
) -> Option<CompactBrowserRow> {
    if index >= header.item_count {
        return None;
    }
    let offset = header.rows_start.checked_add(
        (index as usize)
            .checked_mul(header.row_stride as usize)?
            .checked_mul(4)?,
    )?;
    Some(CompactBrowserRow {
        item_id_ref: read_u32_le(bytes, offset)?,
        localized_name_ref: read_u32_le(bytes, offset + 4)?,
        mod_id_ref: read_u32_le(bytes, offset + 8)?,
        group_key_ref: read_u32_le(bytes, offset + 12)?,
        browser_order: read_u32_le(bytes, offset + 16)?,
        flags: read_u32_le(bytes, offset + 20)?,
    })
}

pub fn compact_browser_string(
    bytes: &[u8],
    header: CompactBrowserHeader,
    string_ref: u32,
) -> Option<&str> {
    if string_ref >= header.string_count {
        return None;
    }
    let offset_offset = header
        .offsets_start
        .checked_add((string_ref as usize).checked_mul(4)?)?;
    let relative_offset = read_u32_le(bytes, offset_offset)? as usize;
    let string_start = header.string_table_start.checked_add(relative_offset)?;
    if string_start >= bytes.len() {
        return Some("");
    }
    let tail = bytes.get(string_start..)?;
    let len = tail
        .iter()
        .position(|byte| *byte == 0)
        .unwrap_or(tail.len());
    std::str::from_utf8(tail.get(0..len)?).ok()
}

pub fn normalize_search_text(value: &str) -> String {
    value
        .chars()
        .filter(|ch| !ch.is_whitespace())
        .flat_map(|ch| ch.to_lowercase())
        .collect()
}

pub fn compact_browser_project_count(bytes: &[u8], query: &str, mod_filter: &str) -> Option<u32> {
    Some(compact_browser_project_indices(
        bytes, query, mod_filter, None,
    )?)
}

pub fn compact_browser_project_indices(
    bytes: &[u8],
    query: &str,
    mod_filter: &str,
    mut out: Option<&mut [u32]>,
) -> Option<u32> {
    let header = parse_compact_browser_header(bytes)?;
    let normalized_query = normalize_search_text(query);
    let normalized_mod = mod_filter.trim().to_lowercase();
    let mut count = 0u32;

    for index in 0..header.item_count {
        let row = compact_browser_row(bytes, header, index)?;
        let item_id = compact_browser_string(bytes, header, row.item_id_ref).unwrap_or("");
        let localized_name =
            compact_browser_string(bytes, header, row.localized_name_ref).unwrap_or("");
        let mod_id = compact_browser_string(bytes, header, row.mod_id_ref).unwrap_or("");
        let group_key = compact_browser_string(bytes, header, row.group_key_ref).unwrap_or("");

        if !normalized_mod.is_empty() && mod_id.to_lowercase() != normalized_mod {
            continue;
        }
        if !normalized_query.is_empty() {
            let haystack =
                normalize_search_text(&format!("{localized_name}|{item_id}|{mod_id}|{group_key}"));
            if !haystack.contains(&normalized_query) {
                continue;
            }
        }
        if let Some(out_indices) = out.as_deref_mut() {
            let out_index = count as usize;
            if out_index < out_indices.len() {
                out_indices[out_index] = index;
            }
        }
        count = count.saturating_add(1);
    }

    Some(count)
}

pub fn expanded_group_keys(expanded_groups: &str) -> std::collections::HashSet<String> {
    expanded_groups
        .split(['\n', '\r', ','])
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
        .collect()
}

pub fn encode_visible_entry(row_index: u32, collapsed_group: bool) -> u32 {
    let index = row_index & COMPACT_BROWSER_INDEX_MASK;
    if collapsed_group {
        index | COMPACT_BROWSER_GROUP_COLLAPSED_FLAG
    } else {
        index
    }
}

/// Projects browser rows after search/mod filtering and native group collapse.
///
/// Encoded output uses bit 31 as the collapsed-group flag and the lower 31 bits
/// as the compact browser row index. Expanded groups emit plain item row indices.
pub fn compact_browser_project_visible_indices(
    bytes: &[u8],
    query: &str,
    mod_filter: &str,
    expanded_groups: &str,
    mut out: Option<&mut [u32]>,
) -> Option<u32> {
    let header = parse_compact_browser_header(bytes)?;
    let normalized_query = normalize_search_text(query);
    let normalized_mod = mod_filter.trim().to_lowercase();
    let expanded = expanded_group_keys(expanded_groups);
    let mut collapsed_seen = std::collections::HashSet::<String>::new();
    let mut count = 0u32;

    for index in 0..header.item_count {
        let row = compact_browser_row(bytes, header, index)?;
        let item_id = compact_browser_string(bytes, header, row.item_id_ref).unwrap_or("");
        let localized_name =
            compact_browser_string(bytes, header, row.localized_name_ref).unwrap_or("");
        let mod_id = compact_browser_string(bytes, header, row.mod_id_ref).unwrap_or("");
        let group_key = compact_browser_string(bytes, header, row.group_key_ref).unwrap_or("");

        if !normalized_mod.is_empty() && mod_id.to_lowercase() != normalized_mod {
            continue;
        }
        if !normalized_query.is_empty() {
            let haystack =
                normalize_search_text(&format!("{localized_name}|{item_id}|{mod_id}|{group_key}"));
            if !haystack.contains(&normalized_query) {
                continue;
            }
        }

        let collapsed_group = !group_key.is_empty() && !expanded.contains(group_key);
        if collapsed_group && !collapsed_seen.insert(group_key.to_owned()) {
            continue;
        }

        if let Some(out_indices) = out.as_deref_mut() {
            let out_index = count as usize;
            if out_index < out_indices.len() {
                out_indices[out_index] = encode_visible_entry(index, collapsed_group);
            }
        }
        count = count.saturating_add(1);
    }

    Some(count)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture_pack() -> Vec<u8> {
        let strings = [
            "minecraft:iron_ingot",
            "铁锭",
            "minecraft",
            "",
            "gregtech:gt.metaitem.01:32000",
            "UIV 超导粗胚锭",
            "gregtech",
            "gt-superconductor",
            "appliedenergistics2:item.ItemMultiMaterial:47",
            "奇点",
            "appliedenergistics2",
            "ae2-singularity",
        ];
        let rows = [
            [0u32, 1, 2, 3, 0, 0],
            [4, 5, 6, 7, 1, 1],
            [8, 9, 10, 11, 2, 1],
        ];
        let mut string_table = Vec::new();
        let mut offsets = Vec::new();
        for value in strings {
            offsets.push(string_table.len() as u32);
            string_table.extend_from_slice(value.as_bytes());
            string_table.push(0);
        }

        let mut out = Vec::new();
        out.extend_from_slice(COMPACT_BROWSER_MAGIC);
        out.extend_from_slice(&COMPACT_BROWSER_VERSION.to_le_bytes());
        out.extend_from_slice(&(rows.len() as u32).to_le_bytes());
        out.extend_from_slice(&(offsets.len() as u32).to_le_bytes());
        out.extend_from_slice(&COMPACT_BROWSER_ROW_STRIDE.to_le_bytes());
        for offset in offsets {
            out.extend_from_slice(&offset.to_le_bytes());
        }
        for row in rows {
            for value in row {
                out.extend_from_slice(&value.to_le_bytes());
            }
        }
        out.extend_from_slice(&string_table);
        out
    }

    #[test]
    fn parses_fixture_header() {
        let pack = fixture_pack();
        let header = parse_compact_browser_header(&pack).expect("header");
        assert_eq!(header.item_count, 3);
        assert_eq!(header.string_count, 12);
        assert_eq!(header.row_stride, 6);
    }

    #[test]
    fn projects_by_query_and_mod() {
        let pack = fixture_pack();
        assert_eq!(compact_browser_project_count(&pack, "", "").unwrap(), 3);
        assert_eq!(compact_browser_project_count(&pack, "超导", "").unwrap(), 1);
        assert_eq!(
            compact_browser_project_count(&pack, "", "gregtech").unwrap(),
            1
        );
        assert_eq!(
            compact_browser_project_count(&pack, "奇点", "appliedenergistics2").unwrap(),
            1
        );
        assert_eq!(
            compact_browser_project_count(&pack, "奇点", "gregtech").unwrap(),
            0
        );
    }

    #[test]
    fn writes_projected_indices() {
        let pack = fixture_pack();
        let mut out = [u32::MAX; 4];
        let count = compact_browser_project_indices(&pack, "奇点", "", Some(&mut out)).unwrap();
        assert_eq!(count, 1);
        assert_eq!(out[0], 2);
        assert_eq!(out[1], u32::MAX);
    }

    #[test]
    fn projects_collapsed_and_expanded_groups_natively() {
        let pack = fixture_pack();
        let mut collapsed = [u32::MAX; 4];
        let collapsed_count =
            compact_browser_project_visible_indices(&pack, "", "", "", Some(&mut collapsed))
                .unwrap();
        assert_eq!(collapsed_count, 3);
        assert_eq!(collapsed[0], 0);
        assert_eq!(collapsed[1], COMPACT_BROWSER_GROUP_COLLAPSED_FLAG | 1);
        assert_eq!(collapsed[2], COMPACT_BROWSER_GROUP_COLLAPSED_FLAG | 2);

        let mut expanded = [u32::MAX; 4];
        let expanded_count = compact_browser_project_visible_indices(
            &pack,
            "",
            "",
            "gt-superconductor",
            Some(&mut expanded),
        )
        .unwrap();
        assert_eq!(expanded_count, 3);
        assert_eq!(expanded[1], 1);
        assert_eq!(expanded[2], COMPACT_BROWSER_GROUP_COLLAPSED_FLAG | 2);
    }
}
