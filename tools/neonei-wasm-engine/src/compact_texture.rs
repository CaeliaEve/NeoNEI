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

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CompactTextureRow {
    pub frame_start: u32,
    pub frame_count: u32,
    pub frame_duration_ms: u32,
}

pub fn compact_texture_row(
    bytes: &[u8],
    header: CompactTextureHeader,
    index: u32,
) -> Option<CompactTextureRow> {
    if index >= header.item_count {
        return None;
    }
    let offsets_start = COMPACT_TEXTURE_HEADER_BYTES;
    let rows_start = offsets_start.checked_add((header.string_count as usize).checked_mul(4)?)?;
    let row_offset = rows_start.checked_add(
        (index as usize)
            .checked_mul(header.row_stride as usize)?
            .checked_mul(4)?,
    )?;
    Some(CompactTextureRow {
        frame_start: read_u32_le(bytes, row_offset + 28)?,
        frame_count: read_u32_le(bytes, row_offset + 32)?,
        frame_duration_ms: read_u32_le(bytes, row_offset + 36)?,
    })
}

pub fn compact_texture_select_frame_index(
    bytes: &[u8],
    row_index: u32,
    now_ms: u32,
) -> Option<u32> {
    let header = parse_compact_texture_header(bytes)?;
    let row = compact_texture_row(bytes, header, row_index)?;
    if row.frame_count == 0 || row.frame_start >= header.frame_count {
        return None;
    }
    let visible_frame_count = row
        .frame_count
        .min(header.frame_count.saturating_sub(row.frame_start));
    if visible_frame_count == 0 {
        return None;
    }
    let offsets_start = COMPACT_TEXTURE_HEADER_BYTES;
    let rows_start = offsets_start.checked_add((header.string_count as usize).checked_mul(4)?)?;
    let rows_bytes = (header.item_count as usize)
        .checked_mul(header.row_stride as usize)?
        .checked_mul(4)?;
    let frames_start = rows_start.checked_add(rows_bytes)?;
    let mut total_duration = 0u32;
    for local_index in 0..visible_frame_count {
        let absolute_index = row.frame_start.checked_add(local_index)?;
        let frame_offset = frames_start.checked_add(
            (absolute_index as usize)
                .checked_mul(header.frame_stride as usize)?
                .checked_mul(4)?,
        )?;
        let duration = read_u32_le(bytes, frame_offset + 16).unwrap_or(row.frame_duration_ms);
        total_duration = total_duration.saturating_add(duration.max(16));
    }
    if total_duration == 0 {
        return Some(0);
    }
    let mut cursor = now_ms % total_duration;
    for local_index in 0..visible_frame_count {
        let absolute_index = row.frame_start.checked_add(local_index)?;
        let frame_offset = frames_start.checked_add(
            (absolute_index as usize)
                .checked_mul(header.frame_stride as usize)?
                .checked_mul(4)?,
        )?;
        let duration = read_u32_le(bytes, frame_offset + 16)
            .unwrap_or(row.frame_duration_ms)
            .max(16);
        if cursor < duration {
            return Some(local_index);
        }
        cursor = cursor.saturating_sub(duration);
    }
    Some(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn texture_timeline_fixture() -> Vec<u8> {
        let mut bytes = Vec::new();
        bytes.extend_from_slice(COMPACT_TEXTURE_MAGIC);
        bytes.extend_from_slice(&COMPACT_TEXTURE_VERSION.to_le_bytes());
        bytes.extend_from_slice(&1u32.to_le_bytes());
        bytes.extend_from_slice(&0u32.to_le_bytes());
        bytes.extend_from_slice(&2u32.to_le_bytes());
        bytes.extend_from_slice(&COMPACT_TEXTURE_ROW_STRIDE.to_le_bytes());
        bytes.extend_from_slice(&COMPACT_TEXTURE_FRAME_STRIDE.to_le_bytes());
        let row = [0u32, 0, 0, 0, 16, 16, 0, 0, 2, 50];
        for value in row {
            bytes.extend_from_slice(&value.to_le_bytes());
        }
        for frame in [[0u32, 0, 16, 16, 30], [16, 0, 16, 16, 70]] {
            for value in frame {
                bytes.extend_from_slice(&value.to_le_bytes());
            }
        }
        bytes
    }

    #[test]
    fn selects_texture_frame_by_exported_timeline() {
        let fixture = texture_timeline_fixture();
        assert_eq!(compact_texture_select_frame_index(&fixture, 0, 0), Some(0));
        assert_eq!(compact_texture_select_frame_index(&fixture, 0, 29), Some(0));
        assert_eq!(compact_texture_select_frame_index(&fixture, 0, 30), Some(1));
        assert_eq!(compact_texture_select_frame_index(&fixture, 0, 99), Some(1));
        assert_eq!(
            compact_texture_select_frame_index(&fixture, 0, 100),
            Some(0)
        );
    }

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
