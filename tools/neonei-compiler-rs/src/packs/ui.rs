use crate::binary::{intern_compact_string, push_i32, push_u32};
use crate::json_ext::{value_i64, value_string, value_u64};
use anyhow::Result;
use serde_json::Value;
use std::collections::HashMap;

pub fn build_compact_ui_template_payload(
    templates: &[Value],
    strings: &mut Vec<String>,
    string_refs: &mut HashMap<String, u32>,
) -> Result<Vec<u8>> {
    let mut template_bytes = Vec::new();
    let mut slot_bytes = Vec::new();
    let mut text_bytes = Vec::new();
    let mut hotspot_bytes = Vec::new();
    let mut viewport_bytes = Vec::new();
    let mut slot_count = 0u32;
    let mut text_count = 0u32;
    let mut hotspot_count = 0u32;
    let mut viewport_count = 0u32;

    for template in templates {
        let slot_start = slot_count;
        if let Some(slots) = template.get("slots").and_then(Value::as_array) {
            for slot in slots {
                push_u32(
                    &mut slot_bytes,
                    intern_compact_string(strings, string_refs, value_string(slot, "role")),
                );
                push_u32(
                    &mut slot_bytes,
                    value_u64(slot, "startIndex").unwrap_or(0) as u32,
                );
                push_u32(
                    &mut slot_bytes,
                    value_u64(slot, "columns").unwrap_or(0) as u32,
                );
                push_u32(&mut slot_bytes, value_u64(slot, "rows").unwrap_or(0) as u32);
                push_i32(&mut slot_bytes, value_i64(slot, "x").unwrap_or(0) as i32);
                push_i32(&mut slot_bytes, value_i64(slot, "y").unwrap_or(0) as i32);
                slot_count += 1;
            }
        }
        let slot_total = slot_count.saturating_sub(slot_start);
        let text_start = text_count;
        if let Some(overlays) = template.get("textOverlays").and_then(Value::as_array) {
            for overlay in overlays {
                push_u32(
                    &mut text_bytes,
                    intern_compact_string(strings, string_refs, value_string(overlay, "text")),
                );
                push_i32(&mut text_bytes, value_i64(overlay, "x").unwrap_or(0) as i32);
                push_i32(&mut text_bytes, value_i64(overlay, "y").unwrap_or(0) as i32);
                push_u32(
                    &mut text_bytes,
                    value_u64(overlay, "width").unwrap_or(0) as u32,
                );
                push_u32(
                    &mut text_bytes,
                    value_u64(overlay, "height").unwrap_or(0) as u32,
                );
                text_count += 1;
            }
        }
        let text_total = text_count.saturating_sub(text_start);
        let hotspot_start = hotspot_count;
        if let Some(hotspots) = template.get("hotspots").and_then(Value::as_array) {
            for hotspot in hotspots {
                push_compact_ui_rect(&mut hotspot_bytes, strings, string_refs, hotspot);
                hotspot_count += 1;
            }
        }
        let hotspot_total = hotspot_count.saturating_sub(hotspot_start);
        let viewport_start = viewport_count;
        if let Some(viewports) = template.get("viewports").and_then(Value::as_array) {
            for viewport in viewports {
                push_compact_ui_rect(&mut viewport_bytes, strings, string_refs, viewport);
                viewport_count += 1;
            }
        }
        let viewport_total = viewport_count.saturating_sub(viewport_start);

        push_u32(
            &mut template_bytes,
            intern_compact_string(strings, string_refs, value_string(template, "templateKey")),
        );
        push_u32(
            &mut template_bytes,
            intern_compact_string(
                strings,
                string_refs,
                value_string(template, "templateSignature"),
            ),
        );
        push_u32(
            &mut template_bytes,
            intern_compact_string(strings, string_refs, value_string(template, "familyKey")),
        );
        push_u32(
            &mut template_bytes,
            intern_compact_string(
                strings,
                string_refs,
                value_string(template, "canonicalMachineFamily"),
            ),
        );
        push_u32(
            &mut template_bytes,
            intern_compact_string(strings, string_refs, value_string(template, "layoutKind")),
        );
        push_u32(
            &mut template_bytes,
            value_u64(template, "width").unwrap_or(0) as u32,
        );
        push_u32(
            &mut template_bytes,
            value_u64(template, "height").unwrap_or(0) as u32,
        );
        push_i32(
            &mut template_bytes,
            value_i64(template, "yShift").unwrap_or(0) as i32,
        );
        push_u32(
            &mut template_bytes,
            value_u64(template, "maxRecipesPerPage").unwrap_or(1) as u32,
        );
        push_u32(
            &mut template_bytes,
            intern_compact_string(
                strings,
                string_refs,
                value_string(template, "imageResource"),
            ),
        );
        push_u32(
            &mut template_bytes,
            value_u64(template, "handlerCount").unwrap_or(0) as u32,
        );
        push_u32(&mut template_bytes, slot_start);
        push_u32(&mut template_bytes, slot_total);
        push_u32(&mut template_bytes, text_start);
        push_u32(&mut template_bytes, text_total);
        push_u32(&mut template_bytes, hotspot_start);
        push_u32(&mut template_bytes, hotspot_total);
        push_u32(&mut template_bytes, viewport_start);
        push_u32(&mut template_bytes, viewport_total);
    }

    let mut payload = Vec::with_capacity(
        8 + 10 * 4
            + template_bytes.len()
            + slot_bytes.len()
            + text_bytes.len()
            + hotspot_bytes.len()
            + viewport_bytes.len(),
    );
    payload.extend_from_slice(b"NEIUIT1\0");
    push_u32(&mut payload, 3);
    push_u32(&mut payload, templates.len() as u32);
    push_u32(&mut payload, slot_count);
    push_u32(&mut payload, text_count);
    push_u32(&mut payload, hotspot_count);
    push_u32(&mut payload, viewport_count);
    push_u32(&mut payload, 19);
    push_u32(&mut payload, 6);
    push_u32(&mut payload, 5);
    push_u32(&mut payload, 12);
    payload.extend_from_slice(&template_bytes);
    payload.extend_from_slice(&slot_bytes);
    payload.extend_from_slice(&text_bytes);
    payload.extend_from_slice(&hotspot_bytes);
    payload.extend_from_slice(&viewport_bytes);
    Ok(payload)
}

fn push_compact_ui_rect(
    bytes: &mut Vec<u8>,
    strings: &mut Vec<String>,
    string_refs: &mut HashMap<String, u32>,
    rect: &Value,
) {
    for key in [
        "id",
        "kind",
        "role",
        "label",
        "tooltip",
        "action",
        "itemId",
        "payloadKey",
    ] {
        push_u32(
            bytes,
            intern_compact_string(strings, string_refs, value_string(rect, key)),
        );
    }
    push_i32(bytes, value_i64(rect, "x").unwrap_or(0) as i32);
    push_i32(bytes, value_i64(rect, "y").unwrap_or(0) as i32);
    push_u32(bytes, value_u64(rect, "width").unwrap_or(0) as u32);
    push_u32(bytes, value_u64(rect, "height").unwrap_or(0) as u32);
}

pub fn build_compact_ui_binding_payload(
    bindings: &[Value],
    strings: &mut Vec<String>,
    string_refs: &mut HashMap<String, u32>,
) -> Result<Vec<u8>> {
    let mut row_bytes = Vec::new();
    for binding in bindings {
        for key in [
            "recipeId",
            "path",
            "payloadKey",
            "familyKey",
            "recipeType",
            "machineType",
            "templateKey",
            "templateSignature",
            "canonicalMachineFamily",
            "layoutKind",
        ] {
            push_u32(
                &mut row_bytes,
                intern_compact_string(strings, string_refs, value_string(binding, key)),
            );
        }
        let flags = if value_string(binding, "templateKey").is_some_and(|value| !value.is_empty()) {
            1
        } else {
            0
        };
        push_u32(&mut row_bytes, flags);
    }
    let mut payload = Vec::with_capacity(8 + 3 * 4 + row_bytes.len());
    payload.extend_from_slice(b"NEIUIB1\0");
    push_u32(&mut payload, 1);
    push_u32(&mut payload, bindings.len() as u32);
    push_u32(&mut payload, 11);
    payload.extend_from_slice(&row_bytes);
    Ok(payload)
}

pub fn build_compact_ui_string_payload(strings: &[String]) -> Result<Vec<u8>> {
    let mut string_offsets = Vec::<u32>::with_capacity(strings.len());
    let mut string_bytes = Vec::<u8>::new();
    for value in strings {
        string_offsets.push(string_bytes.len() as u32);
        string_bytes.extend_from_slice(value.as_bytes());
        string_bytes.push(0);
    }
    let mut payload = Vec::with_capacity(8 + 3 * 4 + string_offsets.len() * 4 + string_bytes.len());
    payload.extend_from_slice(b"NEIUIS1\0");
    push_u32(&mut payload, 1);
    push_u32(&mut payload, strings.len() as u32);
    push_u32(&mut payload, string_bytes.len() as u32);
    for offset in string_offsets {
        push_u32(&mut payload, offset);
    }
    payload.extend_from_slice(&string_bytes);
    Ok(payload)
}
