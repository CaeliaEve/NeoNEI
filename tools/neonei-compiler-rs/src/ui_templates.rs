use crate::io::normalize_path;
use crate::json_ext::value_string;
use crate::manifest::portable_relative_path;
use anyhow::{Context, Result};
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

pub fn ui_template_catalog_templates(catalog: &Value) -> Vec<Value> {
    let mut templates = catalog
        .get("templates")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .filter(|template| {
            value_string(template, "templateKey").is_some_and(|value| !value.trim().is_empty())
        })
        .collect::<Vec<_>>();
    templates.sort_by(|left, right| {
        value_string(left, "templateKey").cmp(&value_string(right, "templateKey"))
    });
    templates
}

pub fn build_ui_template_bindings(recipe_index: &[Value], templates: &[Value]) -> Vec<Value> {
    let template_by_family = templates
        .iter()
        .filter_map(|template| Some((value_string(template, "familyKey")?, template)))
        .collect::<BTreeMap<_, _>>();
    let mut bindings = recipe_index
        .iter()
        .filter_map(|entry| {
            let recipe_id = value_string(entry, "recipeId")?;
            let family_key = value_string(entry, "familyKey").unwrap_or_default();
            let template = template_by_family.get(&family_key).copied();
            Some(json!({
                "recipeId": recipe_id,
                "path": value_string(entry, "path").unwrap_or_default(),
                "payloadKey": value_string(entry, "payloadKey").unwrap_or_default(),
                "familyKey": family_key,
                "recipeType": value_string(entry, "recipeType").unwrap_or_default(),
                "machineType": value_string(entry, "machineType").unwrap_or_default(),
                "templateKey": template.and_then(|template| value_string(template, "templateKey")).unwrap_or_default(),
                "templateSignature": template.and_then(|template| value_string(template, "templateSignature")).unwrap_or_default(),
                "canonicalMachineFamily": template.and_then(|template| value_string(template, "canonicalMachineFamily")).unwrap_or_default(),
                "layoutKind": template.and_then(|template| value_string(template, "layoutKind")).unwrap_or_default(),
            }))
        })
        .collect::<Vec<_>>();
    bindings.sort_by(|left, right| {
        value_string(left, "recipeId").cmp(&value_string(right, "recipeId"))
    });
    bindings
}

pub fn build_ui_assets_manifest(templates: &[Value]) -> Value {
    let mut assets_by_ref: BTreeMap<String, Vec<String>> = BTreeMap::new();
    for template in templates {
        let asset = value_string(template, "imageResource").unwrap_or_default();
        if asset.trim().is_empty() {
            // Template backgrounds may be exported through the structured
            // nativeBackground contract instead of legacy imageResource.
        } else {
            let template_key = value_string(template, "templateKey").unwrap_or_default();
            assets_by_ref.entry(asset).or_default().push(template_key);
        }
        let template_key = value_string(template, "templateKey").unwrap_or_default();
        if let Some(asset) = template
            .get("nativeBackground")
            .and_then(|background| value_string(background, "assetRef"))
            .filter(|value| !value.trim().is_empty())
        {
            assets_by_ref.entry(asset).or_default().push(template_key);
        }
    }
    let assets = assets_by_ref
        .into_iter()
        .map(|(asset_ref, mut template_keys)| {
            template_keys.sort();
            template_keys.dedup();
            json!({
                "assetRef": asset_ref,
                "kind": "template-background",
                "templateKeys": template_keys,
            })
        })
        .collect::<Vec<_>>();
    json!({
        "schemaVersion": "neonei/ui-assets-manifest/current",
        "generatedAt": "deterministic-rust-compiler",
        "assets": assets,
    })
}

pub fn materialize_ui_background_assets(
    input: &Path,
    output: &Path,
    assets_manifest: &Value,
) -> Result<Value> {
    let mut copied = Vec::new();
    let mut missing = Vec::new();
    let Some(assets) = assets_manifest.get("assets").and_then(Value::as_array) else {
        return Ok(json!({
            "schemaVersion": "neonei/ui-background-assets/current",
            "copied": copied,
            "missing": missing,
        }));
    };
    for asset in assets {
        let asset_ref = value_string(asset, "assetRef").unwrap_or_default();
        if !asset_ref.starts_with("assets/ui-backgrounds/") {
            continue;
        }
        let Some(relative) = portable_relative_path(&asset_ref) else {
            missing.push(json!({
                "assetRef": asset_ref,
                "reason": "non-portable-path",
            }));
            continue;
        };
        let source = input.join(&relative);
        if !source.is_file() {
            missing.push(json!({
                "assetRef": asset_ref,
                "path": normalize_path(relative.as_path()),
                "reason": "raw-export-asset-missing",
            }));
            continue;
        }
        let target = output.join(&relative);
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::copy(&source, &target).with_context(|| {
            format!(
                "copy UI background asset {} -> {}",
                source.display(),
                target.display()
            )
        })?;
        copied.push(json!({
            "assetRef": asset_ref,
            "path": normalize_path(relative.as_path()),
        }));
    }
    Ok(json!({
        "schemaVersion": "neonei/ui-background-assets/current",
        "copied": copied,
        "missing": missing,
    }))
}

pub fn ui_template_slot_count(template: &Value) -> usize {
    template
        .get("slots")
        .and_then(Value::as_array)
        .map(|values| values.len())
        .unwrap_or(0)
}

pub fn ui_template_text_count(template: &Value) -> usize {
    template
        .get("textOverlays")
        .and_then(Value::as_array)
        .map(|values| values.len())
        .unwrap_or(0)
}

pub fn ui_template_rect_count(template: &Value, key: &str) -> usize {
    template
        .get(key)
        .and_then(Value::as_array)
        .map(|values| values.len())
        .unwrap_or(0)
}

pub fn ui_template_rect_action_count(template: &Value, key: &str) -> usize {
    template
        .get(key)
        .and_then(Value::as_array)
        .map(|values| {
            values
                .iter()
                .filter(|rect| value_string(rect, "action").is_some_and(|value| !value.is_empty()))
                .count()
        })
        .unwrap_or(0)
}
