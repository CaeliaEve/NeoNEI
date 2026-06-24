use crate::binary::{intern_compact_string, push_u32};
use crate::json_ext::{nested_value_string, value_string, value_u64};
use anyhow::Result;
use serde_json::Value;
use std::collections::HashMap;

pub fn build_compact_recipe_payload_from_pack(pack: &Value) -> Result<Vec<u8>> {
    let mut strings = vec![String::new()];
    let mut string_refs = HashMap::new();
    string_refs.insert(String::new(), 0u32);
    let mut item_rows = Vec::<[u32; 5]>::new();
    let mut ref_rows = Vec::<[u32; 3]>::new();
    let mut ui_rows = Vec::<[u32; 7]>::new();
    let mut category_rows = Vec::<[u32; 7]>::new();
    let mut category_sources = Vec::<u32>::new();

    for item in pack
        .get("itemIndex")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        let produced_start = ref_rows.len() as u32;
        for recipe_ref in item
            .get("producedBy")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
        {
            ref_rows.push([
                intern_compact_string(
                    &mut strings,
                    &mut string_refs,
                    value_string(recipe_ref, "recipeId"),
                ),
                intern_compact_string(
                    &mut strings,
                    &mut string_refs,
                    value_string(recipe_ref, "categoryId"),
                ),
                intern_compact_string(
                    &mut strings,
                    &mut string_refs,
                    value_string(recipe_ref, "displayName"),
                ),
            ]);
        }
        let produced_count = (ref_rows.len() as u32).saturating_sub(produced_start);
        let used_start = ref_rows.len() as u32;
        for recipe_ref in item
            .get("usedIn")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
        {
            ref_rows.push([
                intern_compact_string(
                    &mut strings,
                    &mut string_refs,
                    value_string(recipe_ref, "recipeId"),
                ),
                intern_compact_string(
                    &mut strings,
                    &mut string_refs,
                    value_string(recipe_ref, "categoryId"),
                ),
                intern_compact_string(
                    &mut strings,
                    &mut string_refs,
                    value_string(recipe_ref, "displayName"),
                ),
            ]);
        }
        let used_count = (ref_rows.len() as u32).saturating_sub(used_start);
        item_rows.push([
            intern_compact_string(&mut strings, &mut string_refs, value_string(item, "itemId")),
            produced_start,
            produced_count,
            used_start,
            used_count,
        ]);
    }

    for entry in pack
        .get("uiPayloadIndex")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        ui_rows.push([
            intern_compact_string(
                &mut strings,
                &mut string_refs,
                value_string(entry, "recipeId"),
            ),
            intern_compact_string(&mut strings, &mut string_refs, value_string(entry, "path")),
            intern_compact_string(
                &mut strings,
                &mut string_refs,
                value_string(entry, "payloadKey"),
            ),
            intern_compact_string(
                &mut strings,
                &mut string_refs,
                value_string(entry, "familyKey"),
            ),
            intern_compact_string(
                &mut strings,
                &mut string_refs,
                value_string(entry, "recipeType"),
            ),
            intern_compact_string(
                &mut strings,
                &mut string_refs,
                value_string(entry, "machineType"),
            ),
            intern_compact_string(
                &mut strings,
                &mut string_refs,
                value_string(entry, "handlerKey"),
            ),
        ]);
    }

    for category in pack
        .get("categoryIndex")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        let source_start = category_sources.len() as u32;
        for source in category
            .get("sourceCategoryIds")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
        {
            category_sources.push(intern_compact_string(
                &mut strings,
                &mut string_refs,
                source.as_str().map(str::to_string),
            ));
        }
        let source_count = (category_sources.len() as u32).saturating_sub(source_start);
        category_rows.push([
            intern_compact_string(
                &mut strings,
                &mut string_refs,
                value_string(category, "categoryId"),
            ),
            intern_compact_string(
                &mut strings,
                &mut string_refs,
                value_string(category, "displayName"),
            ),
            value_u64(category, "recipeCount")
                .unwrap_or(0)
                .min(u32::MAX as u64) as u32,
            source_start,
            source_count,
            intern_compact_string(
                &mut strings,
                &mut string_refs,
                nested_value_string(category, &["machineIcon", "itemId"]),
            ),
            intern_compact_string(
                &mut strings,
                &mut string_refs,
                nested_value_string(category, &["machineIcon", "renderAssetRef"]),
            ),
        ]);
    }

    let mut string_offsets = Vec::<u32>::with_capacity(strings.len());
    let mut string_bytes = Vec::<u8>::new();
    for value in &strings {
        string_offsets.push(string_bytes.len() as u32);
        string_bytes.extend_from_slice(value.as_bytes());
        string_bytes.push(0);
    }

    let item_stride = 5u32;
    let ref_stride = 3u32;
    let ui_stride = 7u32;
    let category_stride = 7u32;
    let mut payload = Vec::with_capacity(
        8 + 11 * 4
            + string_offsets.len() * 4
            + item_rows.len() * item_stride as usize * 4
            + ref_rows.len() * ref_stride as usize * 4
            + ui_rows.len() * ui_stride as usize * 4
            + category_rows.len() * category_stride as usize * 4
            + category_sources.len() * 4
            + string_bytes.len(),
    );
    payload.extend_from_slice(b"NEIRCP1\0");
    push_u32(&mut payload, 1);
    push_u32(&mut payload, strings.len() as u32);
    push_u32(&mut payload, item_rows.len() as u32);
    push_u32(&mut payload, ref_rows.len() as u32);
    push_u32(&mut payload, ui_rows.len() as u32);
    push_u32(&mut payload, category_rows.len() as u32);
    push_u32(&mut payload, category_sources.len() as u32);
    push_u32(&mut payload, item_stride);
    push_u32(&mut payload, ref_stride);
    push_u32(&mut payload, ui_stride);
    push_u32(&mut payload, category_stride);
    for offset in string_offsets {
        push_u32(&mut payload, offset);
    }
    for row in item_rows {
        for value in row {
            push_u32(&mut payload, value);
        }
    }
    for row in ref_rows {
        for value in row {
            push_u32(&mut payload, value);
        }
    }
    for row in ui_rows {
        for value in row {
            push_u32(&mut payload, value);
        }
    }
    for row in category_rows {
        for value in row {
            push_u32(&mut payload, value);
        }
    }
    for source in category_sources {
        push_u32(&mut payload, source);
    }
    payload.extend_from_slice(&string_bytes);
    Ok(payload)
}
