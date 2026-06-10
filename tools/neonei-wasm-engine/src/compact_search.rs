use crate::compact_browser::{
    build_browser_index_by_item_id, compact_browser_row, compact_browser_string,
    encode_visible_entry, expanded_group_keys, normalize_search_text, parse_compact_browser_header,
};

const COMPACT_SEARCH_MAGIC: &[u8; 8] = b"NEISRC2\0";
const COMPACT_SEARCH_VERSION: u32 = 1;
const COMPACT_SEARCH_ROW_STRIDE: u32 = 13;
const COMPACT_SEARCH_HEADER_BYTES: usize = 24;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CompactSearchHeader {
    pub item_count: u32,
    pub string_count: u32,
    pub row_stride: u32,
    offsets_start: usize,
    rows_start: usize,
    string_table_start: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CompactSearchRow {
    pub item_id_ref: u32,
    pub public_item_id_ref: u32,
    pub localized_name_ref: u32,
    pub mod_id_ref: u32,
    pub normalized_localized_name_ref: u32,
    pub normalized_internal_name_ref: u32,
    pub normalized_item_id_ref: u32,
    pub normalized_search_terms_ref: u32,
    pub pinyin_full_ref: u32,
    pub pinyin_acronym_ref: u32,
    pub popularity_score: u32,
    pub search_rank: u32,
    pub browser_index: u32,
}

fn read_u32_le(bytes: &[u8], offset: usize) -> Option<u32> {
    let chunk = bytes.get(offset..offset + 4)?;
    Some(u32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
}

pub fn parse_compact_search_header(bytes: &[u8]) -> Option<CompactSearchHeader> {
    if bytes.len() < COMPACT_SEARCH_HEADER_BYTES {
        return None;
    }
    if bytes.get(0..8)? != COMPACT_SEARCH_MAGIC {
        return None;
    }
    let version = read_u32_le(bytes, 8)?;
    if version != COMPACT_SEARCH_VERSION {
        return None;
    }
    let item_count = read_u32_le(bytes, 12)?;
    let string_count = read_u32_le(bytes, 16)?;
    let row_stride = read_u32_le(bytes, 20)?;
    if row_stride != COMPACT_SEARCH_ROW_STRIDE {
        return None;
    }

    let offsets_start = COMPACT_SEARCH_HEADER_BYTES;
    let rows_start = offsets_start.checked_add((string_count as usize).checked_mul(4)?)?;
    let rows_bytes = (item_count as usize)
        .checked_mul(row_stride as usize)?
        .checked_mul(4)?;
    let string_table_start = rows_start.checked_add(rows_bytes)?;
    if string_table_start > bytes.len() {
        return None;
    }

    Some(CompactSearchHeader {
        item_count,
        string_count,
        row_stride,
        offsets_start,
        rows_start,
        string_table_start,
    })
}

pub fn compact_search_row(
    bytes: &[u8],
    header: CompactSearchHeader,
    index: u32,
) -> Option<CompactSearchRow> {
    if index >= header.item_count {
        return None;
    }
    let offset = header.rows_start.checked_add(
        (index as usize)
            .checked_mul(header.row_stride as usize)?
            .checked_mul(4)?,
    )?;
    Some(CompactSearchRow {
        item_id_ref: read_u32_le(bytes, offset)?,
        public_item_id_ref: read_u32_le(bytes, offset + 4)?,
        localized_name_ref: read_u32_le(bytes, offset + 8)?,
        mod_id_ref: read_u32_le(bytes, offset + 12)?,
        normalized_localized_name_ref: read_u32_le(bytes, offset + 16)?,
        normalized_internal_name_ref: read_u32_le(bytes, offset + 20)?,
        normalized_item_id_ref: read_u32_le(bytes, offset + 24)?,
        normalized_search_terms_ref: read_u32_le(bytes, offset + 28)?,
        pinyin_full_ref: read_u32_le(bytes, offset + 32)?,
        pinyin_acronym_ref: read_u32_le(bytes, offset + 36)?,
        popularity_score: read_u32_le(bytes, offset + 40)?,
        search_rank: read_u32_le(bytes, offset + 44)?,
        browser_index: read_u32_le(bytes, offset + 48)?,
    })
}

pub fn compact_search_string(
    bytes: &[u8],
    header: CompactSearchHeader,
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

fn normalized_string_matches(value: &str, normalized_query: &str) -> bool {
    if value.contains(normalized_query) {
        return true;
    }
    // Most search pack fields are already normalized by the compiler. Only pay
    // the allocation cost for the rare legacy/mixed-case string that cannot be
    // matched directly. This keeps the hot search projection path close to a
    // zero-allocation NEI-style scan.
    if value
        .chars()
        .any(|ch| ch.is_whitespace() || ch.is_uppercase())
    {
        return normalize_search_text(value).contains(normalized_query);
    }
    false
}

fn row_matches_query(
    search_pack: &[u8],
    header: CompactSearchHeader,
    row: CompactSearchRow,
    normalized_query: &str,
) -> bool {
    if normalized_query.is_empty() {
        return true;
    }
    [
        row.normalized_search_terms_ref,
        row.normalized_localized_name_ref,
        row.normalized_internal_name_ref,
        row.normalized_item_id_ref,
        row.pinyin_full_ref,
        row.pinyin_acronym_ref,
        row.item_id_ref,
        row.public_item_id_ref,
        row.localized_name_ref,
    ]
    .into_iter()
    .any(|string_ref| {
        let value = compact_search_string(search_pack, header, string_ref).unwrap_or("");
        normalized_string_matches(value, normalized_query)
    })
}

pub fn compact_search_project_visible_indices(
    browser_pack: &[u8],
    search_pack: &[u8],
    query: &str,
    mod_filter: &str,
    expanded_groups: &str,
    mut out: Option<&mut [u32]>,
) -> Option<u32> {
    let browser_header = parse_compact_browser_header(browser_pack)?;
    let search_header = parse_compact_search_header(search_pack)?;
    let normalized_query = normalize_search_text(query);
    let normalized_mod = mod_filter.trim().to_lowercase();
    let expanded = expanded_group_keys(expanded_groups);
    let mut collapsed_seen = std::collections::HashSet::<String>::new();
    let mut count = 0u32;

    for search_index in 0..search_header.item_count {
        let search_row = compact_search_row(search_pack, search_header, search_index)?;
        if search_row.browser_index >= browser_header.item_count {
            continue;
        }
        let search_mod =
            compact_search_string(search_pack, search_header, search_row.mod_id_ref).unwrap_or("");
        if !normalized_mod.is_empty() && search_mod.to_lowercase() != normalized_mod {
            continue;
        }
        if !row_matches_query(search_pack, search_header, search_row, &normalized_query) {
            continue;
        }

        let browser_row =
            compact_browser_row(browser_pack, browser_header, search_row.browser_index)?;
        let group_key =
            compact_browser_string(browser_pack, browser_header, browser_row.group_key_ref)
                .unwrap_or("");
        let collapsed_group = !group_key.is_empty() && !expanded.contains(group_key);
        if collapsed_group && !collapsed_seen.insert(group_key.to_owned()) {
            continue;
        }

        if let Some(out_indices) = out.as_deref_mut() {
            let out_index = count as usize;
            if out_index < out_indices.len() {
                out_indices[out_index] =
                    encode_visible_entry(search_row.browser_index, collapsed_group);
            }
        }
        count = count.saturating_add(1);
    }

    Some(count)
}

fn emit_search_group_members_at_anchor(
    browser_pack: &[u8],
    browser_header: crate::compact_browser::CompactBrowserHeader,
    group_pack: &[u8],
    group_header: crate::compact_group::CompactGroupHeader,
    index_by_item_id: &std::collections::HashMap<String, u32>,
    group_key: &str,
    current_index: u32,
    out: &mut Option<&mut [u32]>,
    count: &mut u32,
) -> Option<()> {
    let Some(group_row) = crate::compact_group::compact_group_find_row(group_pack, group_header, group_key) else {
        if let Some(out_indices) = out.as_deref_mut() {
            let out_index = *count as usize;
            if out_index < out_indices.len() {
                out_indices[out_index] = encode_visible_entry(current_index, false);
            }
        }
        *count = count.saturating_add(1);
        return Some(());
    };
    let mut emitted_any = false;
    let mut emitted_indices = std::collections::HashSet::<u32>::new();
    for member_offset in 0..group_row.member_count {
        let absolute_member_index = group_row.member_start.saturating_add(member_offset);
        let string_ref = crate::compact_group::compact_group_member_string_ref(
            group_pack,
            group_header,
            absolute_member_index,
        )?;
        let item_id =
            crate::compact_group::compact_group_string(group_pack, group_header, string_ref)
                .unwrap_or("");
        let Some(member_browser_index) = index_by_item_id.get(item_id).copied() else {
            continue;
        };
        if !emitted_indices.insert(member_browser_index) {
            continue;
        }
        let member_row = compact_browser_row(browser_pack, browser_header, member_browser_index)?;
        let member_group_key =
            compact_browser_string(browser_pack, browser_header, member_row.group_key_ref)
                .unwrap_or("");
        if member_group_key != group_key {
            continue;
        }
        if let Some(out_indices) = out.as_deref_mut() {
            let out_index = *count as usize;
            if out_index < out_indices.len() {
                out_indices[out_index] = encode_visible_entry(member_browser_index, false);
            }
        }
        *count = count.saturating_add(1);
        emitted_any = true;
    }
    if !emitted_any {
        if let Some(out_indices) = out.as_deref_mut() {
            let out_index = *count as usize;
            if out_index < out_indices.len() {
                out_indices[out_index] = encode_visible_entry(current_index, false);
            }
        }
        *count = count.saturating_add(1);
    }
    Some(())
}

pub fn compact_search_project_visible_indices_with_groups(
    browser_pack: &[u8],
    search_pack: &[u8],
    group_pack: &[u8],
    query: &str,
    mod_filter: &str,
    expanded_groups: &str,
    mut out: Option<&mut [u32]>,
) -> Option<u32> {
    let browser_header = parse_compact_browser_header(browser_pack)?;
    let search_header = parse_compact_search_header(search_pack)?;
    let group_header = crate::compact_group::parse_compact_group_header(group_pack)?;
    let index_by_item_id = build_browser_index_by_item_id(browser_pack, browser_header)?;
    let normalized_query = normalize_search_text(query);
    let normalized_mod = mod_filter.trim().to_lowercase();
    let expanded = expanded_group_keys(expanded_groups);
    let mut emitted_groups = std::collections::HashSet::<String>::new();
    let mut count = 0u32;

    for search_index in 0..search_header.item_count {
        let search_row = compact_search_row(search_pack, search_header, search_index)?;
        if search_row.browser_index >= browser_header.item_count {
            continue;
        }
        let search_mod =
            compact_search_string(search_pack, search_header, search_row.mod_id_ref).unwrap_or("");
        if !normalized_mod.is_empty() && search_mod.to_lowercase() != normalized_mod {
            continue;
        }
        if !row_matches_query(search_pack, search_header, search_row, &normalized_query) {
            continue;
        }

        let browser_row =
            compact_browser_row(browser_pack, browser_header, search_row.browser_index)?;
        let group_key =
            compact_browser_string(browser_pack, browser_header, browser_row.group_key_ref)
                .unwrap_or("");
        if group_key.is_empty() {
            if let Some(out_indices) = out.as_deref_mut() {
                let out_index = count as usize;
                if out_index < out_indices.len() {
                    out_indices[out_index] = encode_visible_entry(search_row.browser_index, false);
                }
            }
            count = count.saturating_add(1);
            continue;
        }

        if !emitted_groups.insert(group_key.to_owned()) {
            continue;
        }
        if expanded.contains(group_key) {
            emit_search_group_members_at_anchor(
                browser_pack,
                browser_header,
                group_pack,
                group_header,
                &index_by_item_id,
                group_key,
                search_row.browser_index,
                &mut out,
                &mut count,
            )?;
        } else if let Some(out_indices) = out.as_deref_mut() {
            let out_index = count as usize;
            if out_index < out_indices.len() {
                out_indices[out_index] = encode_visible_entry(search_row.browser_index, true);
            }
            count = count.saturating_add(1);
        } else {
            count = count.saturating_add(1);
        }
    }

    Some(count)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn search_fixture() -> Vec<u8> {
        let strings = [
            "minecraft:iron_ingot",
            "item:minecraft:iron_ingot",
            "铁锭",
            "minecraft",
            "铁锭",
            "item ingotiron",
            "minecraft iron_ingot",
            "iron ingot minecraft 铁锭",
            "tieding",
            "td",
        ];
        let rows = [[0u32, 1, 2, 3, 4, 5, 6, 7, 8, 9, 1, 0, 0]];
        let mut string_table = Vec::new();
        let mut offsets = Vec::new();
        for value in strings {
            offsets.push(string_table.len() as u32);
            string_table.extend_from_slice(value.as_bytes());
            string_table.push(0);
        }
        let mut out = Vec::new();
        out.extend_from_slice(COMPACT_SEARCH_MAGIC);
        out.extend_from_slice(&COMPACT_SEARCH_VERSION.to_le_bytes());
        out.extend_from_slice(&(rows.len() as u32).to_le_bytes());
        out.extend_from_slice(&(offsets.len() as u32).to_le_bytes());
        out.extend_from_slice(&COMPACT_SEARCH_ROW_STRIDE.to_le_bytes());
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
        let pack = search_fixture();
        let header = parse_compact_search_header(&pack).expect("header");
        assert_eq!(header.item_count, 1);
        assert_eq!(header.string_count, 10);
        assert_eq!(header.row_stride, 13);
    }

    #[test]
    fn matches_normalized_and_pinyin_queries() {
        let pack = search_fixture();
        let header = parse_compact_search_header(&pack).expect("header");
        let row = compact_search_row(&pack, header, 0).expect("row");
        assert!(row_matches_query(
            &pack,
            header,
            row,
            &normalize_search_text("iron")
        ));
        assert!(row_matches_query(
            &pack,
            header,
            row,
            &normalize_search_text("td")
        ));
        assert!(!row_matches_query(
            &pack,
            header,
            row,
            &normalize_search_text("gold")
        ));
    }
}

