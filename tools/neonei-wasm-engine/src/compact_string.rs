fn read_u32_le(bytes: &[u8], offset: usize) -> Option<u32> {
    let chunk = bytes.get(offset..offset + 4)?;
    Some(u32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
}

const COMPACT_STRING_MAGIC: &[u8; 8] = b"NEISTR1\0";
const COMPACT_STRING_VERSION: u32 = 1;
const COMPACT_STRING_ROW_STRIDE: u32 = 6;
const COMPACT_STRING_HEADER_BYTES: usize = 24;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CompactStringHeader {
    pub item_count: u32,
    pub string_count: u32,
    pub row_stride: u32,
}

pub fn parse_compact_string_header(bytes: &[u8]) -> Option<CompactStringHeader> {
    if bytes.len() < COMPACT_STRING_HEADER_BYTES {
        return None;
    }
    if bytes.get(0..8)? != COMPACT_STRING_MAGIC {
        return None;
    }
    let version = read_u32_le(bytes, 8)?;
    if version != COMPACT_STRING_VERSION {
        return None;
    }
    let item_count = read_u32_le(bytes, 12)?;
    let string_count = read_u32_le(bytes, 16)?;
    let row_stride = read_u32_le(bytes, 20)?;
    if row_stride != COMPACT_STRING_ROW_STRIDE {
        return None;
    }

    let offsets_start = COMPACT_STRING_HEADER_BYTES;
    let rows_start = offsets_start.checked_add((string_count as usize).checked_mul(4)?)?;
    let rows_bytes = (item_count as usize)
        .checked_mul(row_stride as usize)?
        .checked_mul(4)?;
    let string_table_start = rows_start.checked_add(rows_bytes)?;
    if string_table_start > bytes.len() {
        return None;
    }

    Some(CompactStringHeader {
        item_count,
        string_count,
        row_stride,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_empty_string_header() {
        let mut bytes = Vec::new();
        bytes.extend_from_slice(COMPACT_STRING_MAGIC);
        bytes.extend_from_slice(&COMPACT_STRING_VERSION.to_le_bytes());
        bytes.extend_from_slice(&0u32.to_le_bytes());
        bytes.extend_from_slice(&0u32.to_le_bytes());
        bytes.extend_from_slice(&COMPACT_STRING_ROW_STRIDE.to_le_bytes());
        let header = parse_compact_string_header(&bytes).expect("header");
        assert_eq!(header.item_count, 0);
        assert_eq!(header.string_count, 0);
    }
}
