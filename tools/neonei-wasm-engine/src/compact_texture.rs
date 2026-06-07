fn read_u32_le(bytes: &[u8], offset: usize) -> Option<u32> {
    let chunk = bytes.get(offset..offset + 4)?;
    Some(u32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
}

const COMPACT_TEXTURE_MAGIC: &[u8; 8] = b"NEITEX1\0";
const COMPACT_TEXTURE_VERSION: u32 = 1;
const COMPACT_TEXTURE_ROW_STRIDE: u32 = 10;
const COMPACT_TEXTURE_FRAME_STRIDE: u32 = 5;
const COMPACT_TEXTURE_HEADER_BYTES: usize = 32;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CompactTextureHeader {
    pub item_count: u32,
    pub string_count: u32,
    pub frame_count: u32,
    pub row_stride: u32,
    pub frame_stride: u32,
}

pub fn parse_compact_texture_header(bytes: &[u8]) -> Option<CompactTextureHeader> {
    if bytes.len() < COMPACT_TEXTURE_HEADER_BYTES {
        return None;
    }
    if bytes.get(0..8)? != COMPACT_TEXTURE_MAGIC {
        return None;
    }
    let version = read_u32_le(bytes, 8)?;
    if version != COMPACT_TEXTURE_VERSION {
        return None;
    }
    let item_count = read_u32_le(bytes, 12)?;
    let string_count = read_u32_le(bytes, 16)?;
    let frame_count = read_u32_le(bytes, 20)?;
    let row_stride = read_u32_le(bytes, 24)?;
    let frame_stride = read_u32_le(bytes, 28)?;
    if row_stride != COMPACT_TEXTURE_ROW_STRIDE || frame_stride != COMPACT_TEXTURE_FRAME_STRIDE {
        return None;
    }

    let offsets_start = COMPACT_TEXTURE_HEADER_BYTES;
    let rows_start = offsets_start.checked_add((string_count as usize).checked_mul(4)?)?;
    let rows_bytes = (item_count as usize)
        .checked_mul(row_stride as usize)?
        .checked_mul(4)?;
    let frames_start = rows_start.checked_add(rows_bytes)?;
    let frames_bytes = (frame_count as usize)
        .checked_mul(frame_stride as usize)?
        .checked_mul(4)?;
    let string_table_start = frames_start.checked_add(frames_bytes)?;
    if string_table_start > bytes.len() {
        return None;
    }

    Some(CompactTextureHeader {
        item_count,
        string_count,
        frame_count,
        row_stride,
        frame_stride,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_empty_texture_header() {
        let mut bytes = Vec::new();
        bytes.extend_from_slice(COMPACT_TEXTURE_MAGIC);
        bytes.extend_from_slice(&COMPACT_TEXTURE_VERSION.to_le_bytes());
        bytes.extend_from_slice(&0u32.to_le_bytes());
        bytes.extend_from_slice(&0u32.to_le_bytes());
        bytes.extend_from_slice(&0u32.to_le_bytes());
        bytes.extend_from_slice(&COMPACT_TEXTURE_ROW_STRIDE.to_le_bytes());
        bytes.extend_from_slice(&COMPACT_TEXTURE_FRAME_STRIDE.to_le_bytes());
        let header = parse_compact_texture_header(&bytes).expect("header");
        assert_eq!(header.item_count, 0);
        assert_eq!(header.frame_count, 0);
    }
}
