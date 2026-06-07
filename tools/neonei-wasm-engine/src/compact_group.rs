fn read_u32_le(bytes: &[u8], offset: usize) -> Option<u32> {
    let chunk = bytes.get(offset..offset + 4)?;
    Some(u32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
}

const COMPACT_GROUP_MAGIC: &[u8; 8] = b"NEIGRP1\0";
const COMPACT_GROUP_VERSION: u32 = 1;
const COMPACT_GROUP_ROW_STRIDE: u32 = 6;
const COMPACT_GROUP_HEADER_BYTES: usize = 28;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CompactGroupHeader {
    pub group_count: u32,
    pub string_count: u32,
    pub member_count: u32,
    pub row_stride: u32,
}

pub fn parse_compact_group_header(bytes: &[u8]) -> Option<CompactGroupHeader> {
    if bytes.len() < COMPACT_GROUP_HEADER_BYTES {
        return None;
    }
    if bytes.get(0..8)? != COMPACT_GROUP_MAGIC {
        return None;
    }
    let version = read_u32_le(bytes, 8)?;
    if version != COMPACT_GROUP_VERSION {
        return None;
    }
    let group_count = read_u32_le(bytes, 12)?;
    let string_count = read_u32_le(bytes, 16)?;
    let member_count = read_u32_le(bytes, 20)?;
    let row_stride = read_u32_le(bytes, 24)?;
    if row_stride != COMPACT_GROUP_ROW_STRIDE {
        return None;
    }

    let offsets_start = COMPACT_GROUP_HEADER_BYTES;
    let rows_start = offsets_start.checked_add((string_count as usize).checked_mul(4)?)?;
    let rows_bytes = (group_count as usize)
        .checked_mul(row_stride as usize)?
        .checked_mul(4)?;
    let members_start = rows_start.checked_add(rows_bytes)?;
    let members_bytes = (member_count as usize).checked_mul(4)?;
    let string_table_start = members_start.checked_add(members_bytes)?;
    if string_table_start > bytes.len() {
        return None;
    }

    Some(CompactGroupHeader {
        group_count,
        string_count,
        member_count,
        row_stride,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_empty_group_header() {
        let mut bytes = Vec::new();
        bytes.extend_from_slice(COMPACT_GROUP_MAGIC);
        bytes.extend_from_slice(&COMPACT_GROUP_VERSION.to_le_bytes());
        bytes.extend_from_slice(&0u32.to_le_bytes());
        bytes.extend_from_slice(&0u32.to_le_bytes());
        bytes.extend_from_slice(&0u32.to_le_bytes());
        bytes.extend_from_slice(&COMPACT_GROUP_ROW_STRIDE.to_le_bytes());
        let header = parse_compact_group_header(&bytes).expect("header");
        assert_eq!(header.group_count, 0);
        assert_eq!(header.member_count, 0);
    }
}
