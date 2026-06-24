use anyhow::{anyhow, Context, Result};
use clap::Parser;
mod atlas_repair;
mod binary;
mod cli;
mod io;
mod json_ext;
mod manifest;
mod native_ui_report;
mod packs;
mod raw_export;
mod recipe_domain;
mod recipe_ui_payload;
mod reports;
mod runtime;
mod text;
mod texture_animation;
mod ui_templates;
mod validation;
use atlas_repair::{repaired_browser_atlas, select_group_representative};
use binary::write_binary_pack_payload;
use cli::{Cli, Command, CompileScope};
use io::{normalize_path, write_json_value};
use json_ext::{first_non_empty, nested_value_string, value_string, value_u64};
use manifest::{
    read_json_collection, read_jsonl_file_values, read_jsonl_values, read_manifest,
    read_manifest_json, read_optional_manifest_json,
};
use packs::browser::{
    build_compact_browser_payload_from_items, build_compact_group_payload_from_groups,
    compile_dist_browser_pack,
};
use packs::recipe::{build_compact_recipe_payload_from_pack, compile_dist_recipe_pack};
use packs::search::{
    build_compact_search_payload_from_items, build_compact_string_payload_from_items,
    compile_search_pack,
};
use packs::texture::{
    build_compact_animation_payload_from_table, build_compact_atlas_meta_payload_from_atlas_items,
    build_compact_texture_payload_from_atlas_items, compile_dist_texture_pack,
    copy_runtime_atlas_assets, normalize_runtime_atlas_file_path, normalize_timeline,
};
use packs::ui::{
    build_compact_ui_binding_payload, build_compact_ui_string_payload,
    build_compact_ui_template_payload,
};
use raw_export::summarize_raw_export;
use recipe_domain::{
    build_recipe_fragmentation_report, build_recipe_handler_metadata_report,
    captured_ui_family_key, classify_recipe_family_key, collect_recipe_item_ids,
    compact_fact_object, public_recipe_handler, public_recipe_layout, recipe_category_display_name,
    recipe_category_id_from_display_name, recipe_category_raw_id, recipe_id, recipe_machine_icon,
    RecipeCategoryAccumulator, RecipeHandlerContext,
};
use recipe_ui_payload::{
    build_raw_recipe_ui_payload_index, read_compiled_recipe_ui_payload_index,
    rust_recipe_ui_payload_relative_path, RecipeUiPayloadShardWriters,
};
use reports::{summarize_runtime_output, write_report, CompilerReport};
use runtime::compile_runtime_reports;
use serde_json::{json, Value};
use std::collections::{BTreeMap, HashMap};
use std::fs;
use std::path::Path;
use std::time::Instant;
use text::{build_pinyin_fields, normalize_search_terms, normalize_text};
use texture_animation::{
    expected_animated_item, expected_animation_reason, promote_animation_facts_to_animated_atlas,
};
use ui_templates::{
    build_ui_assets_manifest, build_ui_template_bindings, materialize_ui_background_assets,
    ui_template_catalog_templates, ui_template_rect_action_count, ui_template_rect_count,
    ui_template_slot_count, ui_template_text_count,
};
use validation::{
    compile_semantic_validation_report, validate_atlas_bounds, validate_atlas_ref,
    validate_frame_bounds,
};

fn main() -> Result<()> {
    let cli = Cli::parse();
    match cli.command {
        Command::Baseline {
            input,
            report,
            threads,
            strict,
        } => {
            configure_threads(threads);
            run_baseline(&input, None, &report, strict)
        }
        Command::Compile {
            input,
            output,
            report,
            scope,
            threads,
            strict,
            debug_json,
        } => {
            configure_threads(threads);
            fs::create_dir_all(&output)
                .with_context(|| format!("create output directory {}", output.display()))?;
            if !debug_json {
                purge_debug_json_artifacts(&output)?;
            }
            match scope {
                CompileScope::All => {
                    compile_browser_pack(&input, &output, strict, debug_json)?;
                    compile_recipe_pack(&input, &output, strict, debug_json)?;
                    compile_ui_pack(&input, &output, strict, debug_json)?;
                    compile_texture_pack(&input, &output, strict, debug_json)?;
                }
                CompileScope::NativeUi => {
                    compile_browser_pack(&input, &output, strict, debug_json)?;
                    compile_recipe_pack(&input, &output, strict, debug_json)?;
                    compile_ui_pack(&input, &output, strict, debug_json)?;
                }
                CompileScope::Search => compile_search_pack(&input, &output, strict, debug_json)?,
                CompileScope::Browser => compile_browser_pack(&input, &output, strict, debug_json)?,
                CompileScope::Recipes => compile_recipe_pack(&input, &output, strict, debug_json)?,
                CompileScope::Ui => compile_ui_pack(&input, &output, strict, debug_json)?,
                CompileScope::Textures => {
                    compile_texture_pack(&input, &output, strict, debug_json)?
                }
            }
            compile_semantic_validation_report(&input, &output)?;
            compile_runtime_reports(&output, scope, strict, debug_json, captured_ui_family_key)?;
            run_baseline(&input, Some(&output), &report, strict)
        }
    }
}

fn run_baseline(input: &Path, output: Option<&Path>, report: &Path, strict: bool) -> Result<()> {
    let started = Instant::now();
    let manifest = read_manifest(input)?;
    let mut warnings = Vec::new();
    let mut blocked = Vec::new();
    let summary = summarize_raw_export(input, &manifest, &mut warnings, &mut blocked)?;
    let runtime = summarize_runtime_output(output)?;

    if strict && !blocked.is_empty() {
        fs::create_dir_all(report.parent().unwrap_or_else(|| Path::new(".")))?;
        write_report(
            report,
            &CompilerReport {
                schema_version: "neonei/rust-compiler-report/current",
                mode: if output.is_some() {
                    "compile"
                } else {
                    "baseline"
                }
                .to_string(),
                input: normalize_path(input),
                output: output.map(normalize_path),
                elapsed_ms: started.elapsed().as_millis(),
                raw_export: summary,
                runtime,
                warnings,
                blocked,
            },
        )?;
        return Err(anyhow!(
            "Raw Export baseline blocked; see {}",
            report.display()
        ));
    }

    fs::create_dir_all(report.parent().unwrap_or_else(|| Path::new(".")))?;
    write_report(
        report,
        &CompilerReport {
            schema_version: "neonei/rust-compiler-report/current",
            mode: if output.is_some() {
                "compile"
            } else {
                "baseline"
            }
            .to_string(),
            input: normalize_path(input),
            output: output.map(normalize_path),
            elapsed_ms: started.elapsed().as_millis(),
            raw_export: summary,
            runtime,
            warnings,
            blocked,
        },
    )
}

fn configure_threads(threads: Option<usize>) {
    if let Some(threads) = threads {
        rayon::ThreadPoolBuilder::new()
            .num_threads(threads)
            .build_global()
            .ok();
    }
}

fn compile_browser_pack(input: &Path, output: &Path, strict: bool, debug_json: bool) -> Result<()> {
    let manifest = read_manifest(input)?;
    if manifest.files.contains_key("browserCatalog") {
        return compile_dist_browser_pack(input, output, strict, debug_json);
    }
    let items = read_json_collection(
        input,
        &manifest,
        &["items", "browserCatalog"],
        Some("items"),
    )?;
    let order_rows = read_json_collection(input, &manifest, &["neiOrder"], None)?;
    let group_rows = read_json_collection(
        input,
        &manifest,
        &["groups", "browserGroups"],
        Some("groups"),
    )?;
    let texture_rows = read_json_collection(input, &manifest, &["textures"], Some("textures"))?;
    let atlas =
        read_optional_manifest_json(input, &manifest, "browserAtlasIndex")?.unwrap_or(Value::Null);
    let atlas = repaired_browser_atlas(&atlas, &texture_rows, &items);

    if strict && items.is_empty() {
        return Err(anyhow!(
            "browser compiler blocked: raw items stream is empty"
        ));
    }

    let order_by_item = order_rows
        .iter()
        .filter_map(|row| {
            Some((
                value_string(row, "itemId")?,
                value_u64(row, "entryOrder").unwrap_or(u64::MAX),
            ))
        })
        .collect::<BTreeMap<_, _>>();

    let atlas_by_item = atlas
        .get("items")
        .and_then(Value::as_array)
        .map(|rows| {
            rows.iter()
                .filter_map(|row| Some((value_string(row, "itemId")?, row.clone())))
                .collect::<BTreeMap<_, _>>()
        })
        .unwrap_or_default();

    let mut group_by_member = BTreeMap::new();
    let groups = group_rows
        .iter()
        .map(|row| {
            let group_key = value_string(row, "groupKey");
            let group_label = value_string(row, "groupLabel");
            let members = row
                .get("memberItemIds")
                .and_then(Value::as_array)
                .map(|values| {
                    values
                        .iter()
                        .filter_map(Value::as_str)
                        .map(str::to_string)
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default();
            let representative = select_group_representative(
                value_string(row, "representativeItemId"),
                &members,
                &atlas_by_item,
            );
            for member in &members {
                group_by_member.insert(
                    member.clone(),
                    json!({
                        "groupKey": group_key,
                        "groupLabel": group_label,
                        "groupSize": value_u64(row, "groupSize").unwrap_or(members.len() as u64),
                        "representativeItemId": representative,
                        "groupSource": "nativeNei",
                    }),
                );
            }
            json!({
                "groupKey": group_key,
                "groupLabel": group_label,
                "groupSize": value_u64(row, "groupSize").unwrap_or(members.len() as u64),
                "representativeItemId": representative,
                "memberItemIds": members,
                "groupSource": "nativeNei",
            })
        })
        .collect::<Vec<_>>();

    let mut alias_map = BTreeMap::new();
    let mut search_items = Vec::new();
    let mut browser_items = items
        .iter()
        .enumerate()
        .map(|item| {
            let (search_rank, item) = item;
            let item_id = value_string(item, "itemId").unwrap_or_default();
            let localized_name = value_string(item, "localizedName");
            let mod_id = value_string(item, "modId");
            let internal_name = value_string(item, "internalName");
            let render_asset_ref = value_string(item, "renderAssetRef");
            let raw_search_terms = value_string(item, "searchTerms");
            let (pinyin_full, pinyin_acronym) =
                build_pinyin_fields(localized_name.as_deref().unwrap_or_default());
            let mut aliases = vec![item_id.clone()];
            for value in [
                localized_name.clone(),
                mod_id.clone(),
                internal_name.clone(),
                render_asset_ref.clone(),
                raw_search_terms.clone(),
            ]
            .into_iter()
            .flatten()
            {
                if !value.trim().is_empty() {
                    aliases.push(value);
                }
            }
            aliases.sort();
            aliases.dedup();
            alias_map.insert(item_id.clone(), aliases);
            let group = group_by_member.get(&item_id);
            let public_item_id = format!("item:{}", item_id.to_ascii_lowercase());
            let normalized_terms = normalize_search_terms(
                [
                    localized_name.as_deref(),
                    internal_name.as_deref(),
                    mod_id.as_deref(),
                    raw_search_terms.as_deref(),
                    Some(public_item_id.as_str()),
                    group
                        .and_then(|value| value.get("groupKey"))
                        .and_then(Value::as_str),
                    group
                        .and_then(|value| value.get("groupLabel"))
                        .and_then(Value::as_str),
                ]
                .into_iter()
                .flatten(),
            );
            search_items.push(json!({
                "itemId": item_id,
                "publicItemId": public_item_id,
                "localizedName": localized_name,
                "modId": mod_id,
                "internalName": internal_name,
                "normalizedLocalizedName": localized_name.as_deref().map(normalize_text).unwrap_or_default(),
                "normalizedInternalName": internal_name.as_deref().map(normalize_text).unwrap_or_default(),
                "normalizedItemId": normalize_text(&item_id),
                "normalizedSearchTerms": normalized_terms,
                "pinyinFull": pinyin_full,
                "pinyinAcronym": pinyin_acronym,
                "aliases": raw_search_terms.unwrap_or_default(),
                "popularityScore": group.and_then(|value| value.get("groupSize")).and_then(Value::as_u64).unwrap_or(1),
                "searchRank": search_rank,
                "renderAssetRef": render_asset_ref,
                "groupKey": group.and_then(|value| value.get("groupKey")).cloned().unwrap_or(Value::Null),
                "groupLabel": group.and_then(|value| value.get("groupLabel")).cloned().unwrap_or(Value::Null),
                "groupSize": group.and_then(|value| value.get("groupSize")).cloned().unwrap_or(json!(1)),
                "representativeItemId": group
                    .and_then(|value| value.get("representativeItemId"))
                    .cloned()
                    .unwrap_or_else(|| json!(item_id)),
            }));
            json!({
                "itemId": item_id,
                "publicItemId": public_item_id,
                "localizedName": localized_name,
                "modId": mod_id,
                "internalName": internal_name,
                "renderAssetRef": render_asset_ref,
                "browserOrder": order_by_item.get(&item_id).copied().unwrap_or(u64::MAX),
                "groupKey": group.and_then(|value| value.get("groupKey")).cloned().unwrap_or(Value::Null),
                "groupLabel": group.and_then(|value| value.get("groupLabel")).cloned().unwrap_or(Value::Null),
                "groupSize": group.and_then(|value| value.get("groupSize")).cloned().unwrap_or(json!(1)),
                "representativeItemId": group
                    .and_then(|value| value.get("representativeItemId"))
                    .cloned()
                    .unwrap_or_else(|| json!(item_id)),
                "groupSource": group.and_then(|value| value.get("groupSource")).cloned().unwrap_or(Value::Null),
                "atlas": atlas_by_item.get(&item_id).cloned().unwrap_or(Value::Null),
            })
        })
        .collect::<Vec<_>>();

    browser_items.sort_by(|left, right| {
        let left_order = left
            .get("browserOrder")
            .and_then(Value::as_u64)
            .unwrap_or(u64::MAX);
        let right_order = right
            .get("browserOrder")
            .and_then(Value::as_u64)
            .unwrap_or(u64::MAX);
        left_order
            .cmp(&right_order)
            .then_with(|| value_string(left, "itemId").cmp(&value_string(right, "itemId")))
    });
    let browser_index_by_item = browser_items
        .iter()
        .enumerate()
        .filter_map(|(index, item)| Some((value_string(item, "itemId")?, index as u64)))
        .collect::<BTreeMap<_, _>>();
    for item in &mut search_items {
        if let Some(item_object) = item.as_object_mut() {
            if let Some(item_id) = item_object.get("itemId").and_then(Value::as_str) {
                if let Some(browser_index) = browser_index_by_item.get(item_id) {
                    item_object.insert("browserIndex".to_string(), json!(browser_index));
                }
            }
        }
    }

    let atlas_items = atlas_by_item.len() as u64;
    let pack = json!({
        "schemaVersion": "neonei/rust-browser-pack/current",
        "counts": {
            "items": browser_items.len(),
            "groups": groups.len(),
            "aliasItems": alias_map.len(),
            "orderedItems": order_by_item.len(),
            "atlasItems": atlas_items,
            "missingAtlas": browser_items.iter().filter(|item| item.get("atlas") == Some(&Value::Null)).count(),
        },
        "items": browser_items,
        "groups": groups,
        "aliasMap": alias_map,
    });

    let rust_dir = output.join("rust");
    fs::create_dir_all(&rust_dir)?;
    if debug_json {
        write_json_value(&rust_dir.join("browser-pack.json"), &pack)?;
    }
    let compact_browser_payload = build_compact_browser_payload_from_items(&browser_items)?;
    write_binary_pack_payload(
        &rust_dir.join("browser.bin"),
        "neonei/browser-pack/current",
        &compact_browser_payload,
    )?;
    let search_pack = json!({
        "schemaVersion": "neonei/rust-search-pack/current",
        "counts": {
            "items": search_items.len(),
            "aliasItems": alias_map.len(),
        },
        "items": search_items,
    });
    let string_pack = build_compact_string_payload_from_items(&browser_items)?;
    let compact_search_payload = build_compact_search_payload_from_items(
        search_pack
            .get("items")
            .and_then(Value::as_array)
            .map(Vec::as_slice)
            .unwrap_or(&[]),
    )?;
    if debug_json {
        write_json_value(&rust_dir.join("search-pack.json"), &search_pack)?;
    }
    write_binary_pack_payload(
        &rust_dir.join("search.bin"),
        "neonei/search-pack/current",
        &compact_search_payload,
    )?;
    let group_payload = build_compact_group_payload_from_groups(&groups)?;
    write_binary_pack_payload(
        &rust_dir.join("groups.bin"),
        "neonei/group-pack/current",
        &group_payload,
    )?;
    write_binary_pack_payload(
        &rust_dir.join("strings.zh_cn.bin"),
        "neonei/string-pack/current",
        &string_pack,
    )?;
    Ok(())
}

fn compile_recipe_pack(input: &Path, output: &Path, strict: bool, debug_json: bool) -> Result<()> {
    let manifest = read_manifest(input)?;
    if !manifest.files.contains_key("recipeIndex") {
        return compile_dist_recipe_pack(input, output, strict, debug_json);
    }
    let recipe_index = read_manifest_json(input, &manifest, "recipeIndex")?
        .ok_or_else(|| anyhow!("recipe compiler blocked: recipeIndex is missing"))?;
    let handlers = read_jsonl_values(input, &manifest, "neiHandlers")?;
    let layouts = read_json_collection(
        input,
        &manifest,
        &["neiHandlerLayouts", "recipeLayouts"],
        Some("handler-layouts"),
    )?;
    let mut recipes = Vec::new();

    for shard in recipe_index
        .get("shards")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
    {
        let Some(path) = shard.get("path").and_then(Value::as_str) else {
            continue;
        };
        let shard_path = input.join(path.replace('\\', "/").trim_start_matches('/'));
        recipes.extend(read_jsonl_file_values(&shard_path)?);
    }

    if strict {
        let expected = recipe_index
            .get("recipeCount")
            .and_then(Value::as_u64)
            .unwrap_or(recipes.len() as u64);
        if expected != recipes.len() as u64 {
            return Err(anyhow!(
                "recipe compiler blocked: recipe count mismatch {} != {}",
                recipes.len(),
                expected
            ));
        }
    }

    let handler_context = RecipeHandlerContext::new(&handlers, &layouts);
    let handler_count = handlers.len();
    let public_handlers = handlers
        .iter()
        .map(public_recipe_handler)
        .collect::<Vec<_>>();
    let public_layouts = layouts.iter().map(public_recipe_layout).collect::<Vec<_>>();
    let handler_pack = if debug_json {
        public_handlers.clone()
    } else {
        Vec::new()
    };

    let mut produced_by: BTreeMap<String, Vec<Value>> = BTreeMap::new();
    let mut used_in: BTreeMap<String, Vec<Value>> = BTreeMap::new();
    let mut recipe_pack = Vec::new();
    let mut ui_payload_index = Vec::new();
    let mut ui_payload_shards = RecipeUiPayloadShardWriters::new(output)?;
    let mut category_map: BTreeMap<String, RecipeCategoryAccumulator> = BTreeMap::new();
    let mut recipe_count = 0usize;

    for recipe in &recipes {
        recipe_count += 1;
        let recipe_id = recipe_id(recipe);
        let (handler, layout) = handler_context.resolve(recipe);
        let public_handler = handler.map(public_recipe_handler);
        let public_layout = layout.map(public_recipe_layout);
        let raw_family_key = first_non_empty(&[
            value_string(recipe, "family"),
            value_string(recipe, "sourcePlugin"),
            value_string(recipe, "recipeType"),
            nested_value_string(recipe, &["machine", "machineId"]),
        ])
        .unwrap_or_else(|| "unknown".to_string());
        let family_key = captured_ui_family_key(handler, layout)
            .unwrap_or_else(|| classify_recipe_family_key(recipe, &raw_family_key, handler));
        let recipe_type = first_non_empty(&[
            value_string(recipe, "recipeType"),
            nested_value_string(recipe, &["machine", "machineId"]),
            Some(family_key.clone()),
        ])
        .unwrap_or_else(|| family_key.clone());
        let machine_type = first_non_empty(&[
            public_handler
                .as_ref()
                .and_then(|handler| value_string(handler, "localizedName")),
            public_handler
                .as_ref()
                .and_then(|handler| value_string(handler, "displayName")),
            nested_value_string(recipe, &["machine", "displayName"]),
            value_string(recipe, "displayName"),
            nested_value_string(recipe, &["machine", "machineId"]),
            Some(recipe_type.clone()),
        ])
        .unwrap_or_else(|| recipe_type.clone());
        let handler_key = public_handler
            .as_ref()
            .and_then(|handler| value_string(handler, "handlerKey"));
        let input_item_ids = collect_recipe_item_ids(
            recipe,
            &[
                "inputs",
                "inputItems",
                "itemInputs",
                "ingredients",
                "catalysts",
                "input",
            ],
        );
        let output_item_ids = collect_recipe_item_ids(
            recipe,
            &[
                "outputs",
                "outputItems",
                "itemOutputs",
                "results",
                "result",
                "output",
            ],
        );
        let machine_icon = recipe_machine_icon(recipe, public_handler.as_ref());
        let machine_info = json!({
            "machineType": machine_type,
            "machineId": nested_value_string(recipe, &["machine", "machineId"]).unwrap_or_else(|| recipe_type.clone()),
            "category": nested_value_string(recipe, &["machine", "category"]).unwrap_or_else(|| family_key.clone()),
            "iconInfo": nested_value_string(recipe, &["machine", "iconInfoRaw"]).unwrap_or_default(),
            "canonicalMachineFamily": public_handler
                .as_ref()
                .and_then(|handler| handler.get("canonicalMachineFamily").cloned())
                .unwrap_or(Value::Null),
            "catalystItemName": public_handler
                .as_ref()
                .and_then(|handler| handler.get("catalystItemName").cloned())
                .unwrap_or(Value::Null),
            "preferredMachineItemName": public_handler
                .as_ref()
                .and_then(|handler| handler.get("preferredMachineItemName").cloned())
                .unwrap_or(Value::Null),
            "gtMultiblockPreferred": public_handler
                .as_ref()
                .and_then(|handler| handler.get("gtMultiblockPreferred"))
                .and_then(Value::as_bool)
                .unwrap_or(false),
            "machineIcon": machine_icon.clone().unwrap_or(Value::Null),
        });
        let payload_meta = json!({
            "recipeId": recipe_id,
            "path": rust_recipe_ui_payload_relative_path(&recipe_id),
            "payloadKey": recipe_id,
            "familyKey": family_key,
            "recipeType": recipe_type,
            "machineType": machine_type,
            "handlerKey": handler_key,
            "handler": public_handler,
            "machineInfo": machine_info,
            "machineIcon": machine_icon,
            "nativeLayout": public_layout,
            "inputItemIds": input_item_ids,
            "outputItemIds": output_item_ids,
            "slotCount": { "input": input_item_ids.len(), "output": output_item_ids.len() },
            "presentation": {
                "surface": nested_value_string(recipe, &["machine", "machineId"]).unwrap_or_else(|| recipe_type.clone()),
                "density": if input_item_ids.len() + output_item_ids.len() > 12 { "dense" } else { "normal" },
            },
        });
        let payload_index_entry = json!({
            "recipeId": recipe_id,
            "path": rust_recipe_ui_payload_relative_path(&recipe_id),
            "payloadKey": recipe_id,
            "familyKey": family_key,
            "recipeType": recipe_type,
            "machineType": machine_type,
            "handlerKey": handler_key,
        });
        let mut payload_entry = payload_meta;
        if let Some(payload_object) = payload_entry.as_object_mut() {
            payload_object.insert(
                "schemaVersion".to_string(),
                Value::String("neonei/recipe-ui-payload/v1".to_string()),
            );
            if let Some(domain_facts) = compact_fact_object(recipe.get("domainFacts")) {
                payload_object.insert("domainFacts".to_string(), domain_facts);
            }
            if let Some(metadata_facts) = compact_fact_object(recipe.get("metadata")) {
                payload_object.insert("metadata".to_string(), metadata_facts);
            }
            if let Some(layout_facts) = compact_fact_object(recipe.get("layout")) {
                payload_object.insert("layout".to_string(), layout_facts);
            }
            payload_object.remove("path");
            payload_object.remove("payloadKey");
        }
        ui_payload_shards.write_payload(&recipe_id, &payload_entry)?;
        ui_payload_index.push(payload_index_entry);

        let category_display_name = recipe_category_display_name(recipe, handler);
        let raw_category_id = recipe_category_raw_id(recipe, handler);
        let category_id =
            recipe_category_id_from_display_name(&category_display_name, &raw_category_id);
        let category =
            category_map
                .entry(category_id.clone())
                .or_insert_with(|| RecipeCategoryAccumulator {
                    category_id,
                    recipe_count: 0,
                    display_name: category_display_name.clone(),
                    source_category_ids: Vec::new(),
                    handler: public_handler.clone(),
                    native_layout: public_layout.clone(),
                    machine_icon: machine_icon.clone(),
                });
        category.recipe_count += 1;
        if category.machine_icon.is_none() {
            category.machine_icon = machine_icon.clone();
        }
        if !category.source_category_ids.contains(&raw_category_id) {
            category.source_category_ids.push(raw_category_id.clone());
        }

        let ref_value = json!({
            "recipeId": recipe_id,
            "categoryId": recipe_category_id_from_display_name(&category_display_name, &raw_category_id),
            "displayName": category_display_name,
        });

        for item_id in input_item_ids {
            used_in.entry(item_id).or_default().push(ref_value.clone());
        }
        for item_id in output_item_ids {
            produced_by
                .entry(item_id)
                .or_default()
                .push(ref_value.clone());
        }
        if debug_json {
            recipe_pack.push(recipe.clone());
        }
    }

    let mut item_ids = produced_by
        .keys()
        .chain(used_in.keys())
        .cloned()
        .collect::<Vec<_>>();
    item_ids.sort();
    item_ids.dedup();
    let item_index = item_ids
        .into_iter()
        .map(|item_id| {
            json!({
                "itemId": item_id,
                "producedBy": produced_by.remove(&item_id).unwrap_or_default(),
                "usedIn": used_in.remove(&item_id).unwrap_or_default(),
            })
        })
        .collect::<Vec<_>>();

    let category_index = category_map
        .into_values()
        .map(|category| {
            json!({
                "categoryId": category.category_id,
                "recipeCount": category.recipe_count,
                "displayName": category.display_name,
                "sourceCategoryIds": category.source_category_ids,
                "handler": category.handler,
                "nativeLayout": category.native_layout,
                "machineIcon": category.machine_icon,
            })
        })
        .collect::<Vec<_>>();

    let rust_dir = output.join("rust");
    fs::create_dir_all(&rust_dir)?;
    write_json_value(
        &rust_dir.join("recipe-handler-metadata-report.json"),
        &build_recipe_handler_metadata_report(&public_handlers, &public_layouts, &category_index),
    )?;
    write_json_value(
        &rust_dir.join("recipe-fragmentation-report.json"),
        &build_recipe_fragmentation_report(&category_index),
    )?;
    let recipes_dir = output.join("recipes");
    fs::create_dir_all(&recipes_dir)?;
    write_json_value(
        &recipes_dir.join("handler-index.json"),
        &json!({
            "schemaVersion": "neonei/recipe-handler-index/v1",
            "handlers": public_handlers.clone(),
        }),
    )?;
    write_json_value(
        &recipes_dir.join("handler-layout-index.json"),
        &json!({
            "schemaVersion": "neonei/recipe-handler-layout-index/v1",
            "layouts": public_layouts.clone(),
        }),
    )?;
    write_json_value(
        &recipes_dir.join("recipe-category-index.json"),
        &json!({
            "schemaVersion": "neonei/recipe-category-index/v1",
            "categories": category_index.clone(),
        }),
    )?;
    write_json_value(
        &recipes_dir.join("item-index.json"),
        &json!({
            "schemaVersion": "neonei/recipe-item-index/v1",
            "items": item_index.clone(),
        }),
    )?;
    write_json_value(
        &recipes_dir.join("ui-payload-index.json"),
        &json!({
            "schemaVersion": "neonei/recipe-ui-payload-index/v1",
            "recipes": ui_payload_index.clone(),
        }),
    )?;
    ui_payload_shards.finish()?;
    let recipe_output_pack = json!({
        "schemaVersion": "neonei/rust-recipe-pack/current",
        "counts": {
            "recipes": recipe_count,
            "handlers": handler_count,
            "recipeItemIndexItems": item_index.len(),
            "uiPayloadIndexItems": ui_payload_index.len(),
            "categories": category_index.len(),
        },
        "recipes": recipe_pack,
        "handlers": handler_pack,
        "itemIndex": item_index,
        "uiPayloadIndex": ui_payload_index,
        "categoryIndex": category_index,
    });
    if debug_json {
        write_json_value(&rust_dir.join("recipe-pack.json"), &recipe_output_pack)?;
    }
    let compact_recipe_payload = build_compact_recipe_payload_from_pack(&recipe_output_pack)?;
    write_binary_pack_payload(
        &rust_dir.join("recipes.bin"),
        "neonei/recipe-pack/current",
        &compact_recipe_payload,
    )?;
    Ok(())
}

fn compile_ui_pack(input: &Path, output: &Path, strict: bool, _debug_json: bool) -> Result<()> {
    let manifest = read_manifest(input)?;
    let template_catalog = read_manifest_json(input, &manifest, "uiTemplateCatalog")?;
    let Some(template_catalog) = template_catalog else {
        if strict {
            return Err(anyhow!(
                "ui-pack compiler blocked: uiTemplateCatalog is missing"
            ));
        }
        return Ok(());
    };
    let templates = ui_template_catalog_templates(&template_catalog);
    if strict && templates.is_empty() {
        return Err(anyhow!(
            "ui-pack compiler blocked: uiTemplateCatalog has no templates"
        ));
    }

    let recipe_ui_index = match read_compiled_recipe_ui_payload_index(output)? {
        Some(entries) => entries,
        None => build_raw_recipe_ui_payload_index(input, &manifest)?,
    };
    if strict && recipe_ui_index.is_empty() {
        return Err(anyhow!(
            "ui-pack compiler blocked: no recipe UI payload index entries are available"
        ));
    }

    let bindings = build_ui_template_bindings(&recipe_ui_index, &templates);
    let bound_recipe_count = bindings
        .iter()
        .filter(|entry| value_string(entry, "templateKey").is_some_and(|value| !value.is_empty()))
        .count();
    if strict && !recipe_ui_index.is_empty() && bound_recipe_count == 0 {
        return Err(anyhow!(
            "ui-pack compiler blocked: no recipe bindings matched a captured UI template"
        ));
    }

    let ui_pack_dir = output.join("rust").join("ui-pack");
    fs::create_dir_all(&ui_pack_dir)?;

    let mut strings = vec![String::new()];
    let mut string_refs = HashMap::new();
    string_refs.insert(String::new(), 0u32);
    let template_payload =
        build_compact_ui_template_payload(&templates, &mut strings, &mut string_refs)?;
    let binding_payload =
        build_compact_ui_binding_payload(&bindings, &mut strings, &mut string_refs)?;
    let string_payload = build_compact_ui_string_payload(&strings)?;
    let assets_manifest = build_ui_assets_manifest(&templates);
    let ui_background_assets = materialize_ui_background_assets(input, output, &assets_manifest)?;
    let missing_ui_background_assets = ui_background_assets
        .get("missing")
        .and_then(Value::as_array)
        .map(|items| items.len())
        .unwrap_or(0);
    if strict && missing_ui_background_assets > 0 {
        return Err(anyhow!(
            "ui-pack compiler blocked: {missing_ui_background_assets} native UI background asset(s) are missing"
        ));
    }
    let unbound_recipes = bindings
        .iter()
        .filter(|entry| {
            value_string(entry, "templateKey")
                .unwrap_or_default()
                .is_empty()
        })
        .take(100)
        .map(|entry| {
            json!({
                "recipeId": value_string(entry, "recipeId").unwrap_or_default(),
                "familyKey": value_string(entry, "familyKey").unwrap_or_default(),
                "recipeType": value_string(entry, "recipeType").unwrap_or_default(),
            })
        })
        .collect::<Vec<_>>();
    let status = if recipe_ui_index.is_empty() {
        "empty"
    } else if bound_recipe_count == bindings.len() {
        "ready"
    } else {
        "partial"
    };

    write_binary_pack_payload(
        &ui_pack_dir.join("ui_templates.bin"),
        "neonei/ui-template-pack/current",
        &template_payload,
    )?;
    write_binary_pack_payload(
        &ui_pack_dir.join("ui_bindings.bin"),
        "neonei/ui-binding-pack/current",
        &binding_payload,
    )?;
    write_binary_pack_payload(
        &ui_pack_dir.join("ui_strings.bin"),
        "neonei/ui-string-pack/current",
        &string_payload,
    )?;
    write_json_value(
        &ui_pack_dir.join("ui_assets.manifest.json"),
        &assets_manifest,
    )?;
    write_json_value(
        &ui_pack_dir.join("ui_pack_report.json"),
        &json!({
            "schemaVersion": "neonei/ui-pack-report/current",
            "generatedAt": "deterministic-rust-compiler",
            "status": status,
            "source": {
                "uiTemplateCatalog": manifest.files.get("uiTemplateCatalog").cloned().unwrap_or_default(),
                "recipeUiPayloadIndex": "recipes/ui-payload-index.json",
            },
            "summary": {
                "templateCount": templates.len(),
                "bindingCount": bindings.len(),
                "boundRecipeCount": bound_recipe_count,
                "unboundRecipeCount": bindings.len().saturating_sub(bound_recipe_count),
                "slotCount": templates.iter().map(ui_template_slot_count).sum::<usize>(),
                "textOverlayCount": templates.iter().map(ui_template_text_count).sum::<usize>(),
                "hotspotCount": templates.iter().map(|template| ui_template_rect_count(template, "hotspots")).sum::<usize>(),
                "viewportCount": templates.iter().map(|template| ui_template_rect_count(template, "viewports")).sum::<usize>(),
                "hotspotActionCount": templates.iter().map(|template| ui_template_rect_action_count(template, "hotspots")).sum::<usize>(),
                "viewportActionCount": templates.iter().map(|template| ui_template_rect_action_count(template, "viewports")).sum::<usize>(),
                "stringCount": strings.len(),
                "assetCount": assets_manifest.get("assets").and_then(Value::as_array).map(|items| items.len()).unwrap_or(0),
            },
            "format": {
                "templatePackMagic": "NEIUIT1_NUL",
                "templatePackVersion": 3,
                "templateStride": 19,
                "slotStride": 6,
                "textStride": 5,
                "rectStride": 12,
                "hotspotActionFields": true,
                "hotspotActionFieldNames": ["action", "itemId", "payloadKey"],
            },
            "artifacts": {
                "uiTemplates": "rust/ui-pack/ui_templates.bin",
                "uiBindings": "rust/ui-pack/ui_bindings.bin",
                "uiStrings": "rust/ui-pack/ui_strings.bin",
                "uiAssetsManifest": "rust/ui-pack/ui_assets.manifest.json",
            },
            "assets": {
                "uiBackgrounds": ui_background_assets,
            },
            "unboundRecipes": unbound_recipes,
        }),
    )?;
    Ok(())
}

fn compile_texture_pack(input: &Path, output: &Path, strict: bool, debug_json: bool) -> Result<()> {
    let manifest = read_manifest(input)?;
    if manifest.files.contains_key("textureManifest") {
        return compile_dist_texture_pack(input, output, strict, debug_json);
    }
    let atlas = read_manifest_json(input, &manifest, "browserAtlasIndex")?
        .ok_or_else(|| anyhow!("texture compiler blocked: browserAtlasIndex is missing"))?;
    let animations = read_json_collection(
        input,
        &manifest,
        &["animations", "animationTable"],
        Some("animations"),
    )?;
    let native_sprites = read_json_collection(
        input,
        &manifest,
        &["nativeSprites", "nativeRenderIndex"],
        Some("sprites"),
    )?;
    let texture_rows = read_json_collection(
        input,
        &manifest,
        &["textures", "textureManifest"],
        Some("textures"),
    )?;
    let item_rows = read_json_collection(
        input,
        &manifest,
        &["items", "browserCatalog"],
        Some("items"),
    )?;

    let animation_by_asset = animations
        .iter()
        .filter_map(|row| Some((value_string(row, "assetId")?, row.clone())))
        .collect::<BTreeMap<_, _>>();
    let native_sprite_by_asset = native_sprites
        .iter()
        .filter_map(|row| Some((value_string(row, "assetId")?, row.clone())))
        .collect::<BTreeMap<_, _>>();
    let texture_by_asset = texture_rows
        .iter()
        .filter_map(|row| Some((value_string(row, "assetId")?, row.clone())))
        .collect::<BTreeMap<_, _>>();

    let atlas = repaired_browser_atlas(&atlas, &texture_rows, &item_rows);
    let atlas = promote_animation_facts_to_animated_atlas(
        &atlas,
        &animation_by_asset,
        &native_sprite_by_asset,
    );
    let atlas_items = atlas
        .get("items")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    let mut static_items = 0u64;
    let mut animated_items = 0u64;
    let mut missing_atlas_file_refs = Vec::new();
    let mut missing_atlas_asset_files = Vec::new();
    let mut invalid_atlas_bounds = Vec::new();
    let mut invalid_frame_bounds = Vec::new();
    let mut actionable_texture_issues = Vec::new();
    let mut animation_table = Vec::new();
    let mut atlas_map = BTreeMap::new();

    for item in &atlas_items {
        let item_id = value_string(item, "itemId").unwrap_or_default();
        let asset_id = value_string(item, "assetId").unwrap_or_default();
        let has_static_atlas = item
            .get("hasStaticAtlas")
            .and_then(Value::as_bool)
            .unwrap_or(false);
        let has_animated_atlas = item
            .get("hasAnimatedAtlas")
            .and_then(Value::as_bool)
            .unwrap_or(false);
        let animation = animation_by_asset.get(&asset_id);
        let native_sprite = native_sprite_by_asset.get(&asset_id);
        if !has_static_atlas && !has_animated_atlas {
            actionable_texture_issues.push(json!({
                "code": "TEXTURE_ATLAS_ENTRY_EMPTY",
                "itemId": item_id,
                "assetId": asset_id,
                "reason": "No staticAtlas or animatedAtlas was generated for this browser atlas item.",
                "recommendedFix": "Fix NESQL++ texture capture or atlas-source classification for this item; do not use frontend per-item image fallback.",
            }));
        }
        if !has_animated_atlas && expected_animated_item(animation, native_sprite) {
            actionable_texture_issues.push(json!({
                "code": "EXPECTED_ANIMATED_BUT_STATIC",
                "itemId": item_id,
                "assetId": asset_id,
                "reason": expected_animation_reason(animation, native_sprite),
                "hasStaticAtlas": has_static_atlas,
                "hasAnimationFacts": animation.is_some(),
                "hasNativeSpriteFacts": native_sprite.is_some(),
                "recommendedFix": "Repair NESQL++ animation facts or native sprite capture so compiler emits animatedAtlas/timeline rows.",
            }));
        }
        if item
            .get("hasStaticAtlas")
            .and_then(Value::as_bool)
            .unwrap_or(false)
        {
            static_items += 1;
            validate_atlas_ref(
                &item_id,
                item.get("staticAtlas"),
                &mut missing_atlas_file_refs,
            );
            validate_atlas_bounds(
                &item_id,
                "static",
                item.get("staticAtlas"),
                &mut invalid_atlas_bounds,
            );
        }
        if item
            .get("hasAnimatedAtlas")
            .and_then(Value::as_bool)
            .unwrap_or(false)
        {
            animated_items += 1;
            let animated_atlas = item.get("animatedAtlas");
            validate_atlas_ref(&item_id, animated_atlas, &mut missing_atlas_file_refs);
            validate_atlas_bounds(
                &item_id,
                "animated",
                animated_atlas,
                &mut invalid_atlas_bounds,
            );
            validate_frame_bounds(&item_id, animated_atlas, &mut invalid_frame_bounds);

            let frame_duration_ms = animated_atlas
                .and_then(|value| value_u64(value, "frameDurationMs"))
                .or_else(|| animation.and_then(|value| value_u64(value, "frameDurationMs")))
                .or_else(|| native_sprite.and_then(|value| value_u64(value, "frameDurationMs")));
            animation_table.push(json!({
                "itemId": item_id,
                "assetId": asset_id,
                "mode": native_sprite.and_then(|value| value.get("animationMode")).cloned().unwrap_or(Value::Null),
                "frameDurationSource": if native_sprite.is_some() { "native_sprite_metadata" } else { "raw_animation_index" },
                "frameCount": animated_atlas
                    .and_then(|value| value_u64(value, "frameCount"))
                    .or_else(|| animation.and_then(|value| value_u64(value, "frameCount"))),
                "frameDurationMs": frame_duration_ms,
                "atlasFile": animated_atlas
                    .and_then(|value| value.get("atlasFile"))
                    .cloned()
                    .unwrap_or(Value::Null),
                "timeline": normalize_timeline(animated_atlas, frame_duration_ms),
                "spriteMetadataFile": native_sprite
                    .and_then(|value| value.get("spriteMetadataFile"))
                    .cloned()
                    .unwrap_or(Value::Null),
            }));
        }
        atlas_map.insert(
            item_id,
            json!({
                "assetId": asset_id,
                "atlas": item,
                "texture": texture_by_asset.get(&asset_id).cloned().unwrap_or(Value::Null),
            }),
        );
    }
    copy_runtime_atlas_assets(input, output, &atlas_items, &mut missing_atlas_asset_files)?;

    if strict
        && (!missing_atlas_file_refs.is_empty()
            || !missing_atlas_asset_files.is_empty()
            || !invalid_atlas_bounds.is_empty()
            || !invalid_frame_bounds.is_empty())
    {
        return Err(anyhow!(
            "texture compiler blocked: missing atlas refs={}, missing atlas assets={}, invalid atlas bounds={}, invalid frame bounds={}",
            missing_atlas_file_refs.len(),
            missing_atlas_asset_files.len(),
            invalid_atlas_bounds.len(),
            invalid_frame_bounds.len()
        ));
    }

    let rust_dir = output.join("rust");
    fs::create_dir_all(&rust_dir)?;
    let texture_output_pack = json!({
        "schemaVersion": "neonei/rust-texture-pack/current",
        "counts": {
            "atlasItems": atlas_items.len(),
            "staticAtlasItems": static_items,
            "animatedAtlasItems": animated_items,
            "animationRows": animations.len(),
            "nativeSpriteRows": native_sprites.len(),
            "textureRows": texture_rows.len(),
            "missingAtlasFileRefs": missing_atlas_file_refs.len(),
            "missingAtlasAssetFiles": missing_atlas_asset_files.len(),
            "invalidAtlasBounds": invalid_atlas_bounds.len(),
            "invalidFrameBounds": invalid_frame_bounds.len(),
            "atlasMapItems": atlas_map.len(),
        },
        "atlas": atlas,
        "atlasMap": atlas_map,
        "animationTable": animation_table,
        "validation": {
            "missingAtlasFileRefs": missing_atlas_file_refs.clone(),
            "missingAtlasAssetFiles": missing_atlas_asset_files.clone(),
            "invalidAtlasBounds": invalid_atlas_bounds.clone(),
            "invalidFrameBounds": invalid_frame_bounds.clone(),
        },
    });
    let texture_report_status = if actionable_texture_issues.is_empty()
        && missing_atlas_file_refs.is_empty()
        && missing_atlas_asset_files.is_empty()
        && invalid_atlas_bounds.is_empty()
        && invalid_frame_bounds.is_empty()
    {
        "ok"
    } else {
        "advisory"
    };
    let actionable_issue_count = actionable_texture_issues.len() + missing_atlas_asset_files.len();
    let suspicious_texture_report = json!({
        "schemaVersion": "neonei/rust-suspicious-texture-report/current",
        "generatedAt": "deterministic-rust-compiler",
        "status": texture_report_status,
        "counts": {
            "actionableIssues": actionable_issue_count,
            "missingAtlasFileRefs": missing_atlas_file_refs.len(),
            "missingAtlasAssetFiles": missing_atlas_asset_files.len(),
            "invalidAtlasBounds": invalid_atlas_bounds.len(),
            "invalidFrameBounds": invalid_frame_bounds.len(),
        },
        "issues": actionable_texture_issues,
        "missingAtlasFileRefs": missing_atlas_file_refs,
        "missingAtlasAssetFiles": missing_atlas_asset_files,
        "invalidAtlasBounds": invalid_atlas_bounds,
        "invalidFrameBounds": invalid_frame_bounds,
    });
    write_json_value(
        &rust_dir.join("missing-texture-report.json"),
        &json!({
            "schemaVersion": "neonei/rust-missing-texture-report/current",
            "generatedAt": "deterministic-rust-compiler",
            "status": texture_report_status,
            "counts": {
                "atlasItems": atlas_items.len(),
                "staticAtlasItems": static_items,
                "animatedAtlasItems": animated_items,
                "actionableIssues": suspicious_texture_report["counts"]["actionableIssues"].clone(),
                "missingAtlasFileRefs": suspicious_texture_report["counts"]["missingAtlasFileRefs"].clone(),
                "missingAtlasAssetFiles": suspicious_texture_report["counts"]["missingAtlasAssetFiles"].clone(),
                "invalidAtlasBounds": suspicious_texture_report["counts"]["invalidAtlasBounds"].clone(),
                "invalidFrameBounds": suspicious_texture_report["counts"]["invalidFrameBounds"].clone(),
            },
            "issues": suspicious_texture_report["issues"].clone(),
            "missingAtlasFileRefs": suspicious_texture_report["missingAtlasFileRefs"].clone(),
            "missingAtlasAssetFiles": suspicious_texture_report["missingAtlasAssetFiles"].clone(),
            "invalidAtlasBounds": suspicious_texture_report["invalidAtlasBounds"].clone(),
            "invalidFrameBounds": suspicious_texture_report["invalidFrameBounds"].clone(),
        }),
    )?;
    write_json_value(
        &rust_dir.join("suspicious-texture-report.json"),
        &suspicious_texture_report,
    )?;
    if debug_json {
        write_json_value(&rust_dir.join("texture-pack.json"), &texture_output_pack)?;
    }
    let texture_payload = build_compact_texture_payload_from_atlas_items(&atlas_items)?;
    write_binary_pack_payload(
        &rust_dir.join("textures.bin"),
        "neonei/texture-pack/current",
        &texture_payload,
    )?;
    let animation_payload = build_compact_animation_payload_from_table(&animation_table)?;
    write_binary_pack_payload(
        &rust_dir.join("animations.bin"),
        "neonei/animation-pack/current",
        &animation_payload,
    )?;
    let atlas_meta_payload = build_compact_atlas_meta_payload_from_atlas_items(&atlas_items)?;
    write_binary_pack_payload(
        &rust_dir.join("atlas.meta.bin"),
        "neonei/atlas-meta-pack/current",
        &atlas_meta_payload,
    )?;
    Ok(())
}

fn purge_debug_json_artifacts(output: &Path) -> Result<()> {
    let rust_dir = output.join("rust");
    for artifact_name in [
        "browser-pack.json",
        "search-pack.json",
        "recipe-pack.json",
        "texture-pack.json",
    ] {
        let path = rust_dir.join(artifact_name);
        if path.exists() {
            fs::remove_file(&path)
                .with_context(|| format!("remove stale debug artifact {}", path.display()))?;
        }
    }
    let payload_shards = rust_dir.join("recipe-ui-payload-shards");
    if payload_shards.exists() {
        fs::remove_dir_all(&payload_shards).with_context(|| {
            format!(
                "remove stale debug shard directory {}",
                payload_shards.display()
            )
        })?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_path_uses_forward_slashes() {
        assert!(normalize_path(Path::new("a/b")).contains('/'));
    }

    #[test]
    fn empty_runtime_summary_without_output() {
        let summary = reports::summarize_runtime_output(None).unwrap();
        assert!(summary.counts.is_empty());
        assert!(summary.sizes.is_empty());
    }

    #[test]
    fn compact_group_pack_uses_native_binary_payload() {
        let groups = vec![json!({
            "groupKey": "thaumcraft:wands",
            "groupLabel": "??",
            "groupSize": 2,
            "representativeItemId": "i~thaumcraft~wand~0",
            "memberItemIds": ["i~thaumcraft~wand~0", "i~thaumcraft~wand~1"]
        })];
        let payload = build_compact_group_payload_from_groups(&groups).unwrap();
        assert_eq!(&payload[0..8], b"NEIGRP1\0");
        assert_eq!(u32::from_le_bytes(payload[8..12].try_into().unwrap()), 1);
        assert_eq!(u32::from_le_bytes(payload[12..16].try_into().unwrap()), 1);
        assert_eq!(u32::from_le_bytes(payload[20..24].try_into().unwrap()), 2);
        assert_eq!(u32::from_le_bytes(payload[24..28].try_into().unwrap()), 6);
    }

    #[test]
    fn compact_animation_pack_uses_native_binary_payload() {
        let animations = vec![json!({
            "itemId": "i~botania~manaResource~4",
            "atlasFile": "textures/atlas/animated-main.webp",
            "frameDurationMs": 50,
            "timeline": [{ "frameIndex": 0, "durationMs": 50 }, { "frameIndex": 1, "durationMs": 75 }]
        })];
        let payload = build_compact_animation_payload_from_table(&animations).unwrap();
        assert_eq!(&payload[0..8], b"NEIANM1\0");
        assert_eq!(u32::from_le_bytes(payload[8..12].try_into().unwrap()), 1);
        assert_eq!(u32::from_le_bytes(payload[12..16].try_into().unwrap()), 1);
        assert_eq!(u32::from_le_bytes(payload[20..24].try_into().unwrap()), 2);
        assert_eq!(u32::from_le_bytes(payload[24..28].try_into().unwrap()), 5);
    }

    #[test]
    fn compact_texture_pack_uses_native_binary_payload() {
        let items = vec![json!({
            "itemId": "minecraft:iron_ingot",
            "staticAtlas": { "atlasFile": "textures/atlas/static-main.webp", "x": 1, "y": 2, "width": 16, "height": 16 },
            "animatedAtlas": {
                "atlasFile": "textures/atlas/animated-main.webp",
                "frameDurationMs": 50,
                "frames": [{ "x": 3, "y": 4, "width": 16, "height": 16 }],
                "timeline": [{ "frameIndex": 0, "durationMs": 50 }]
            }
        })];
        let payload = build_compact_texture_payload_from_atlas_items(&items).unwrap();
        assert_eq!(&payload[0..8], b"NEITEX1\0");
        assert_eq!(u32::from_le_bytes(payload[8..12].try_into().unwrap()), 1);
        assert_eq!(u32::from_le_bytes(payload[12..16].try_into().unwrap()), 1);
        assert_eq!(u32::from_le_bytes(payload[20..24].try_into().unwrap()), 1);
        assert_eq!(u32::from_le_bytes(payload[24..28].try_into().unwrap()), 10);
    }

    #[test]
    fn group_representative_prefers_drawable_variant_over_tiny_native_sprite() {
        let mut atlas_by_item = BTreeMap::new();
        atlas_by_item.insert(
            "i~ae2fc~wireless_fluid_terminal~0".to_string(),
            json!({
                "itemId": "i~ae2fc~wireless_fluid_terminal~0",
                "resolutionMode": "native_sprite",
                "staticAtlas": { "atlasFile": "textures/atlas/static.png", "x": 0, "y": 0, "width": 16, "height": 16 }
            }),
        );
        atlas_by_item.insert(
            "i~ae2fc~wireless_fluid_terminal~0~charged".to_string(),
            json!({
                "itemId": "i~ae2fc~wireless_fluid_terminal~0~charged",
                "resolutionMode": "native_sprite",
                "staticAtlas": { "atlasFile": "textures/atlas/static.png", "x": 16, "y": 0, "width": 64, "height": 64 }
            }),
        );
        let selected = select_group_representative(
            Some("i~ae2fc~wireless_fluid_terminal~0".to_string()),
            &[
                "i~ae2fc~wireless_fluid_terminal~0".to_string(),
                "i~ae2fc~wireless_fluid_terminal~0~charged".to_string(),
            ],
            &atlas_by_item,
        );
        assert_eq!(
            selected.as_deref(),
            Some("i~ae2fc~wireless_fluid_terminal~0~charged")
        );
    }

    #[test]
    fn runtime_atlas_paths_are_dist_data_relative() {
        assert_eq!(
            normalize_runtime_atlas_file_path(Some(
                "assets/textures/atlas-assets/atlases/item-native-static.png".to_string()
            ))
            .as_deref(),
            Some("textures/atlas-assets/atlases/item-native-static.png")
        );
        assert_eq!(
            normalize_runtime_atlas_file_path(Some(
                "textures/atlas-assets/atlases/item-native-static.png".to_string()
            ))
            .as_deref(),
            Some("textures/atlas-assets/atlases/item-native-static.png")
        );
    }

    #[test]
    fn compact_atlas_meta_pack_summarizes_atlas_files() {
        let items = vec![
            json!({
                "itemId": "minecraft:iron_ingot",
                "staticAtlas": { "atlasFile": "textures/atlas/static-main.webp", "atlasWidth": 2048, "atlasHeight": 2048, "x": 1, "y": 2, "width": 16, "height": 16 },
            }),
            json!({
                "itemId": "i~AWWayofTime~lifeEssence~0",
                "animatedAtlas": {
                    "atlasFile": "textures/atlas/animated-main.webp",
                    "atlasWidth": { "value": "2048" },
                    "atlasHeight": { "value": "4096" },
                    "frames": [
                        { "x": { "value": "0" }, "y": { "value": "0" }, "width": { "value": "16" }, "height": { "value": "16" } },
                        { "x": { "value": "16" }, "y": { "value": "0" }, "width": { "value": "16" }, "height": { "value": "16" } }
                    ]
                }
            }),
        ];
        let payload = build_compact_atlas_meta_payload_from_atlas_items(&items).unwrap();
        assert_eq!(&payload[0..8], b"NEIATM1\0");
        assert_eq!(u32::from_le_bytes(payload[8..12].try_into().unwrap()), 1);
        assert_eq!(u32::from_le_bytes(payload[12..16].try_into().unwrap()), 2);
        assert_eq!(u32::from_le_bytes(payload[20..24].try_into().unwrap()), 6);
    }

    #[test]
    fn atlas_bounds_validation_blocks_out_of_bounds_static_rects() {
        let valid = json!({
            "atlasFile": "textures/atlas/static-main.webp",
            "atlasWidth": 64,
            "atlasHeight": 64,
            "x": 48,
            "y": 48,
            "width": 16,
            "height": 16,
        });
        let invalid = json!({
            "atlasFile": "textures/atlas/static-main.webp",
            "atlasWidth": 64,
            "atlasHeight": 64,
            "x": 60,
            "y": 48,
            "width": 16,
            "height": 16,
        });
        let zero_sized = json!({
            "atlasFile": "textures/atlas/static-main.webp",
            "atlasWidth": 64,
            "atlasHeight": 64,
            "x": 0,
            "y": 0,
            "width": 0,
            "height": 16,
        });
        let mut invalid_bounds = Vec::new();
        validate_atlas_bounds("valid-item", "static", Some(&valid), &mut invalid_bounds);
        assert!(invalid_bounds.is_empty());

        validate_atlas_bounds("bad-item", "static", Some(&invalid), &mut invalid_bounds);
        validate_atlas_bounds(
            "zero-item",
            "static",
            Some(&zero_sized),
            &mut invalid_bounds,
        );
        assert_eq!(
            invalid_bounds,
            vec![
                "bad-item:static:out-of-bounds".to_string(),
                "zero-item:static:out-of-bounds".to_string(),
            ]
        );
    }

    #[test]
    fn atlas_bounds_validation_allows_animated_frame_only_atlas() {
        let frame_only = json!({
            "atlasFile": "textures/atlas/animated-main.webp",
            "atlasWidth": 16,
            "atlasHeight": 128,
            "frameCount": 8,
            "frames": [[0, 0, 0, 16, 16], [1, 0, 16, 16, 16]],
        });
        let animated_with_bad_rect = json!({
            "atlasFile": "textures/atlas/animated-main.webp",
            "atlasWidth": 16,
            "atlasHeight": 128,
            "x": 8,
            "y": 120,
            "width": 16,
            "height": 16,
            "frames": [[0, 0, 0, 16, 16]],
        });
        let mut invalid_bounds = Vec::new();
        validate_atlas_bounds(
            "frame-only-item",
            "animated",
            Some(&frame_only),
            &mut invalid_bounds,
        );
        assert!(invalid_bounds.is_empty());

        validate_atlas_bounds(
            "bad-animated-item",
            "animated",
            Some(&animated_with_bad_rect),
            &mut invalid_bounds,
        );
        assert_eq!(
            invalid_bounds,
            vec!["bad-animated-item:animated:out-of-bounds".to_string()]
        );
    }

    #[test]
    fn missing_texture_report_classifies_expected_animated_static_items() {
        let animation = json!({
            "assetId": "avaritia-singularity",
            "frameCount": 4,
            "frameDurationMs": 50,
            "timeline": [{ "frameIndex": 0, "durationMs": 50 }]
        });
        let native_sprite = json!({
            "assetId": "avaritia-singularity",
            "spriteMetadataFile": "assets/minecraft/textures/items/singularity.png.mcmeta"
        });
        assert!(expected_animated_item(
            Some(&animation),
            Some(&native_sprite)
        ));
        assert_eq!(
            expected_animation_reason(Some(&animation), Some(&native_sprite)),
            "native sprite metadata exists"
        );
        assert!(!expected_animated_item(None, None));
    }

    #[test]
    fn native_sprite_snapshot_animation_facts_promote_static_atlas() {
        let atlas = json!({
            "items": [{
                "itemId": "i~Railcraft~cart.redstone.flux~0",
                "assetId": "nesqlpp:item/i~Railcraft~cart.redstone.flux~0",
                "hasStaticAtlas": true,
                "hasAnimatedAtlas": false,
                "staticAtlas": {
                    "atlasFile": "assets/textures/atlas-assets/atlases/item-native-static-011.png",
                    "atlasWidth": 2048,
                    "atlasHeight": 2048,
                    "x": 512,
                    "y": 128,
                    "width": 64,
                    "height": 64
                }
            }]
        });
        let animation = json!({
            "assetId": "nesqlpp:item/i~Railcraft~cart.redstone.flux~0",
            "mode": "native_sprite_snapshot",
            "animationMode": "none",
            "frameCount": 20,
            "frameDurationMs": 100,
            "timeline": [
                { "timelineIndex": 0.0, "frameIndex": 0.0, "durationMs": 100.0 },
                { "timelineIndex": 1.0, "frameIndex": 1.0, "durationMs": 100.0 }
            ]
        });
        let mut animations = BTreeMap::new();
        animations.insert(
            "nesqlpp:item/i~Railcraft~cart.redstone.flux~0".to_string(),
            animation,
        );
        let promoted =
            promote_animation_facts_to_animated_atlas(&atlas, &animations, &BTreeMap::new());
        let item = &promoted["items"][0];
        assert_eq!(item["hasAnimatedAtlas"], json!(true));
        assert_eq!(item["animatedAtlas"]["frameCount"], json!(20));
        assert_eq!(
            item["animatedAtlas"]["frames"].as_array().unwrap().len(),
            20
        );
        assert_eq!(
            item["animatedAtlas"]["timeline"][1],
            json!({ "frameIndex": 1, "durationMs": 100 })
        );
    }

    #[test]
    fn wrapped_numeric_texture_frames_compile_without_invalid_bounds() {
        let animated_atlas = json!({
            "atlasFile": "assets/textures/atlas-assets/animated-atlases/item-native-animated.png",
            "atlasWidth": { "value": "2048" },
            "atlasHeight": { "value": "4096" },
            "frameDurationMs": { "value": "50" },
            "frameCount": { "value": "2" },
            "frames": [
                {
                    "index": { "value": "0" },
                    "x": { "value": "0" },
                    "y": { "value": "0" },
                    "width": { "value": "16" },
                    "height": { "value": "16" }
                },
                {
                    "index": { "value": 1 },
                    "x": { "value": 16 },
                    "y": { "value": 0 },
                    "width": { "value": 16 },
                    "height": { "value": 16 }
                }
            ],
            "timeline": [
                {
                    "timelineIndex": { "value": "0" },
                    "frameIndex": { "value": "0" },
                    "durationMs": { "value": "50" }
                },
                {
                    "timelineIndex": { "value": "1" },
                    "frameIndex": { "value": "1" },
                    "durationMs": { "value": "75" }
                }
            ]
        });

        let mut invalid_bounds = Vec::new();
        validate_frame_bounds(
            "i~AWWayofTime~lifeEssence~0",
            Some(&animated_atlas),
            &mut invalid_bounds,
        );
        assert!(invalid_bounds.is_empty(), "{invalid_bounds:?}");

        let normalized = normalize_timeline(
            Some(&animated_atlas),
            value_u64(&animated_atlas, "frameDurationMs"),
        );
        assert_eq!(
            normalized
                .as_array()
                .and_then(|values| values.get(1))
                .and_then(|value| value_u64(value, "durationMs")),
            Some(75)
        );

        let items = vec![json!({
            "itemId": "i~AWWayofTime~lifeEssence~0",
            "animatedAtlas": animated_atlas
        })];
        let payload = build_compact_texture_payload_from_atlas_items(&items).unwrap();
        assert_eq!(&payload[0..8], b"NEITEX1\0");
        assert_eq!(u32::from_le_bytes(payload[20..24].try_into().unwrap()), 2);
    }

    #[test]
    fn timeline_frame_indices_wrap_to_available_exported_frames() {
        let animated_atlas = json!({
            "atlasFile": "textures/atlas/animated-main.webp",
            "frameCount": 16,
            "frameDurationMs": 50,
            "frames": [
                [0, 0, 0, 16, 16],
                [1, 16, 0, 16, 16],
                [2, 32, 0, 16, 16],
                [3, 48, 0, 16, 16]
            ],
            "timeline": [
                { "frameIndex": 0, "durationMs": 50 },
                { "frameIndex": 4, "durationMs": 50 },
                { "frameIndex": 5, "durationMs": 50 },
                { "frameIndex": 15, "durationMs": 50 }
            ]
        });

        let normalized = normalize_timeline(Some(&animated_atlas), Some(50));
        let values = normalized.as_array().expect("timeline");
        assert_eq!(values[0]["frameIndex"], json!(0));
        assert_eq!(values[1]["frameIndex"], json!(0));
        assert_eq!(values[2]["frameIndex"], json!(1));
        assert_eq!(values[3]["frameIndex"], json!(3));
    }

    #[test]
    fn compact_string_pack_uses_native_binary_payload() {
        let items = vec![json!({
            "itemId": "minecraft:iron_ingot",
            "localizedName": "Iron Ingot",
            "modId": "minecraft",
            "internalName": "item.ingotIron",
            "groupKey": "",
            "groupLabel": "",
        })];
        let payload = build_compact_string_payload_from_items(&items).unwrap();
        assert_eq!(&payload[0..8], b"NEISTR1\0");
        assert_eq!(u32::from_le_bytes(payload[8..12].try_into().unwrap()), 1);
        assert_eq!(u32::from_le_bytes(payload[12..16].try_into().unwrap()), 1);
        assert_eq!(u32::from_le_bytes(payload[20..24].try_into().unwrap()), 6);
    }

    #[test]
    fn compact_search_pack_uses_native_binary_payload() {
        let items = vec![json!({
            "itemId": "minecraft:iron_ingot",
            "publicItemId": "item:minecraft:iron_ingot",
            "localizedName": "Iron Ingot",
            "modId": "minecraft",
            "normalizedLocalizedName": "iron ingot",
            "normalizedInternalName": "item ingotiron",
            "normalizedItemId": "minecraft iron_ingot",
            "normalizedSearchTerms": "iron ingot minecraft item ingotiron",
            "pinyinFull": "tieding",
            "pinyinAcronym": "td",
            "popularityScore": 3,
            "searchRank": 7
        })];
        let payload = build_compact_search_payload_from_items(&items).unwrap();
        assert_eq!(&payload[0..8], b"NEISRC2\0");
        assert_eq!(u32::from_le_bytes(payload[8..12].try_into().unwrap()), 1);
        assert_eq!(u32::from_le_bytes(payload[12..16].try_into().unwrap()), 1);
        assert_eq!(u32::from_le_bytes(payload[20..24].try_into().unwrap()), 13);
    }

    #[test]
    fn compact_recipe_pack_uses_native_binary_payload() {
        let pack = json!({
            "itemIndex": [{
                "itemId": "i~minecraft~iron_ingot~0",
                "producedBy": [{ "recipeId": "r1", "categoryId": "display~furnace", "displayName": "Furnace" }],
                "usedIn": [{ "recipeId": "r2", "categoryId": "display~crafting", "displayName": "Crafting" }]
            }],
            "uiPayloadIndex": [{
                "recipeId": "r1",
                "path": "recipes/ui-payload-shards/55.json",
                "payloadKey": "r1",
                "familyKey": "furnace",
                "recipeType": "furnace",
                "machineType": "Furnace",
                "handlerKey": "codechicken.nei.recipe.furnacerecipehandler"
            }],
            "categoryIndex": [{
                "categoryId": "display~furnace",
                "displayName": "Furnace",
                "recipeCount": 1,
                "sourceCategoryIds": ["codechicken.nei.recipe.furnacerecipehandler"],
                "machineIcon": {
                    "itemId": "i~minecraft~furnace~0",
                    "renderAssetRef": "nesqlpp:item/i~minecraft~furnace~0"
                }
            }]
        });
        let payload = build_compact_recipe_payload_from_pack(&pack).unwrap();
        assert_eq!(&payload[0..8], b"NEIRCP1\0");
        assert_eq!(u32::from_le_bytes(payload[8..12].try_into().unwrap()), 1);
        assert_eq!(u32::from_le_bytes(payload[16..20].try_into().unwrap()), 1);
        assert_eq!(u32::from_le_bytes(payload[20..24].try_into().unwrap()), 2);
        assert_eq!(u32::from_le_bytes(payload[24..28].try_into().unwrap()), 1);
        assert_eq!(u32::from_le_bytes(payload[28..32].try_into().unwrap()), 1);
        assert_eq!(u32::from_le_bytes(payload[36..40].try_into().unwrap()), 5);
        assert_eq!(u32::from_le_bytes(payload[40..44].try_into().unwrap()), 3);
        assert_eq!(u32::from_le_bytes(payload[44..48].try_into().unwrap()), 7);
        assert_eq!(u32::from_le_bytes(payload[48..52].try_into().unwrap()), 7);
    }

    #[test]
    fn rust_recipe_ui_payload_paths_match_raw_export_sha1_shards() {
        assert_eq!(
            rust_recipe_ui_payload_relative_path("r1"),
            "recipes/ui-payload-shards/55.json"
        );
        assert_eq!(
            rust_recipe_ui_payload_relative_path("r~H_tVg74GOf6PmoNkwtcMLQ=="),
            "recipes/ui-payload-shards/45.json"
        );
        assert_eq!(
            rust_recipe_ui_payload_relative_path("r~prZx3D_BO22sF1-hHpwvbA=="),
            "recipes/ui-payload-shards/96.json"
        );
    }

    #[test]
    fn captured_ui_family_key_matches_nesqlpp_census_contract() {
        let handler = json!({
            "handlerKey": "gt.recipe.assemblyline",
            "canonicalMachineFamily": "GregTech-Machine",
            "imageResource": "textures/gui/legacy.png"
        });
        let layout = json!({
            "handlerKey": "gt.recipe.assemblyline",
            "layoutKind": "Machine",
            "width": 176,
            "height": 90,
            "yShift": -4,
            "maxRecipesPerPage": 2,
            "imageResource": " textures/gui/GT5UAssemblyLine.png "
        });

        assert_eq!(
            captured_ui_family_key(Some(&handler), Some(&layout)).as_deref(),
            Some("gregtech-machine|machine|176x90@-4#2|textures/gui/gt5uassemblyline.png")
        );
    }

    #[test]
    fn runtime_recipe_type_ids_resolve_to_nei_handler_keys() {
        let handlers = vec![json!({
            "handlerKey": "gt.recipe.laserengraver",
            "handlerClass": "gt.recipe.laserengraver",
            "canonicalMachineFamily": "gregtech-machine"
        })];
        let layouts = vec![json!({
            "handlerKey": "gt.recipe.laserengraver",
            "canonicalMachineFamily": "gregtech-machine",
            "layoutKind": "machine",
            "width": 166,
            "height": 135,
            "maxRecipesPerPage": 2,
            "progressBars": [{ "x": 78, "y": 24, "width": 20, "height": 18 }]
        })];
        let recipe = json!({
            "family": "gregtech",
            "sourcePlugin": "gregtech",
            "machine": {
                "machineId": "rt~gregtech~gt.recipe.laserengraver~MV",
                "displayName": "gregtech - Laser Engraver (MV)"
            }
        });
        let context = RecipeHandlerContext::new(&handlers, &layouts);

        let (handler, layout) = context.resolve(&recipe);

        assert_eq!(
            handler
                .and_then(|value| value_string(value, "handlerKey"))
                .as_deref(),
            Some("gt.recipe.laserengraver")
        );
        assert_eq!(
            captured_ui_family_key(handler, layout).as_deref(),
            Some("gregtech-machine|machine|166x135@0#2|unknown")
        );
    }

    #[test]
    fn public_recipe_layout_preserves_native_background_and_dynamic_primitives() {
        let layout = json!({
            "handlerKey": "gt.recipe.assemblyline",
            "canonicalMachineFamily": "gregtech-machine",
            "layoutKind": "machine",
            "width": 176,
            "height": 90,
            "imageResource": "textures/gui/gt5u_assembly_line.png",
            "imageRegion": { "x": 4, "y": 8, "width": 176, "height": 90 },
            "nativeBackground": {
                "status": "captured",
                "kind": "gt-modular-ui",
                "assetRef": "assets/ui-backgrounds/gregtech/nei_single_recipe.png",
                "scaling": "nine-slice"
            },
            "progressBars": [{
                "kind": "progress-bar",
                "role": "gt-progress",
                "x": 78,
                "y": 24,
                "width": 20,
                "height": 18
            }],
            "dynamicPrimitives": [{
                "kind": "progress-bar",
                "x": 78,
                "y": 24,
                "width": 20,
                "height": 18
            }],
            "hotspots": [{
                "id": "machine-info",
                "label": "Machine info",
                "x": 6,
                "y": 6,
                "width": 48,
                "height": 12
            }],
            "viewports": [{
                "id": "preview",
                "kind": "item-preview",
                "x": 120,
                "y": 8,
                "width": 32,
                "height": 32
            }]
        });

        let public_layout = public_recipe_layout(&layout);

        assert_eq!(
            public_layout["imageResource"],
            json!("textures/gui/gt5u_assembly_line.png")
        );
        assert_eq!(
            public_layout["canonicalMachineFamily"],
            json!("gregtech-machine")
        );
        assert_eq!(public_layout["imageRegion"]["x"], json!(4));
        assert_eq!(
            public_layout["nativeBackground"]["assetRef"],
            json!("assets/ui-backgrounds/gregtech/nei_single_recipe.png")
        );
        assert_eq!(
            public_layout["progressBars"].as_array().unwrap()[0]["role"],
            json!("gt-progress")
        );
        assert_eq!(
            public_layout["dynamicPrimitives"].as_array().unwrap()[0]["width"],
            json!(20)
        );
        assert_eq!(
            public_layout["hotspots"].as_array().unwrap()[0]["label"],
            json!("Machine info")
        );
        assert_eq!(
            public_layout["viewports"].as_array().unwrap()[0]["kind"],
            json!("item-preview")
        );
    }

    #[test]
    fn ui_template_bindings_use_captured_family_keys_not_simple_recipe_families() {
        let captured_family_key =
            "gregtech-machine|machine|176x90@-4#2|textures/gui/gt5uassemblyline.png";
        let templates = vec![json!({
            "templateKey": "ui-template/assembly-line",
            "templateSignature": "assemblyline123",
            "familyKey": captured_family_key,
            "canonicalMachineFamily": "gregtech-machine",
            "layoutKind": "machine"
        })];
        let recipe_index = vec![json!({
            "recipeId": "r_gt_assembly_line",
            "familyKey": captured_family_key,
            "recipeType": "gt.recipe.assemblyline",
            "machineType": "Assembly Line"
        })];

        let bindings = build_ui_template_bindings(&recipe_index, &templates);

        assert_eq!(
            bindings[0]["templateKey"],
            json!("ui-template/assembly-line")
        );
        assert_eq!(bindings[0]["familyKey"], json!(captured_family_key));
    }

    #[test]
    fn ui_assets_manifest_and_materializer_include_native_background_assets() {
        let templates = vec![json!({
            "templateKey": "gt-machine@default",
            "imageResource": "",
            "nativeBackground": {
                "status": "captured",
                "kind": "gt-modular-ui",
                "assetRef": "assets/ui-backgrounds/gregtech/nei_single_recipe.png",
                "scaling": "nine-slice"
            }
        })];
        let manifest = build_ui_assets_manifest(&templates);
        assert_eq!(manifest["assets"].as_array().unwrap().len(), 1);
        assert_eq!(
            manifest["assets"][0]["assetRef"],
            json!("assets/ui-backgrounds/gregtech/nei_single_recipe.png")
        );

        let input = tempfile::tempdir().unwrap();
        let output = tempfile::tempdir().unwrap();
        let source = input
            .path()
            .join("assets/ui-backgrounds/gregtech/nei_single_recipe.png");
        fs::create_dir_all(source.parent().unwrap()).unwrap();
        fs::write(&source, b"png").unwrap();

        let materialized =
            materialize_ui_background_assets(input.path(), output.path(), &manifest).unwrap();

        assert_eq!(
            fs::read(
                output
                    .path()
                    .join("assets/ui-backgrounds/gregtech/nei_single_recipe.png")
            )
            .unwrap(),
            b"png"
        );
        assert_eq!(materialized["copied"].as_array().unwrap().len(), 1);
        assert_eq!(materialized["missing"].as_array().unwrap().len(), 0);
    }

    #[test]
    fn compact_ui_pack_uses_shared_native_string_table() {
        let templates = vec![json!({
            "templateKey": "furnace@default",
            "templateSignature": "abc123",
            "familyKey": "furnace",
            "canonicalMachineFamily": "furnace",
            "layoutKind": "furnace",
            "width": 166,
            "height": 65,
            "yShift": -4,
            "maxRecipesPerPage": 2,
            "imageResource": "textures/gui/furnace.png",
            "handlerCount": 1,
            "slots": [
                { "role": "item-input", "startIndex": 0, "columns": 1, "rows": 1, "x": 45, "y": 24 },
                { "role": "item-output", "startIndex": 1, "columns": 1, "rows": 1, "x": 115, "y": 24 }
            ],
            "textOverlays": [{ "text": "EU/t", "x": 80, "y": 10, "width": 24, "height": 8 }]
        })];
        let recipe_index = vec![json!({
            "recipeId": "r1",
            "path": "recipes/ui-payload-shards/55.json",
            "payloadKey": "r1",
            "familyKey": "furnace",
            "recipeType": "furnace",
            "machineType": "Furnace"
        })];
        let bindings = build_ui_template_bindings(&recipe_index, &templates);
        let mut strings = vec![String::new()];
        let mut string_refs = HashMap::new();
        string_refs.insert(String::new(), 0u32);
        let template_payload =
            build_compact_ui_template_payload(&templates, &mut strings, &mut string_refs).unwrap();
        let binding_payload =
            build_compact_ui_binding_payload(&bindings, &mut strings, &mut string_refs).unwrap();
        let string_payload = build_compact_ui_string_payload(&strings).unwrap();

        assert_eq!(&template_payload[0..8], b"NEIUIT1\0");
        assert_eq!(
            u32::from_le_bytes(template_payload[8..12].try_into().unwrap()),
            3
        );
        assert_eq!(
            u32::from_le_bytes(template_payload[12..16].try_into().unwrap()),
            1
        );
        assert_eq!(
            u32::from_le_bytes(template_payload[16..20].try_into().unwrap()),
            2
        );
        assert_eq!(
            u32::from_le_bytes(template_payload[20..24].try_into().unwrap()),
            1
        );
        assert_eq!(
            u32::from_le_bytes(template_payload[24..28].try_into().unwrap()),
            0
        );
        assert_eq!(
            u32::from_le_bytes(template_payload[28..32].try_into().unwrap()),
            0
        );
        assert_eq!(
            u32::from_le_bytes(template_payload[32..36].try_into().unwrap()),
            19
        );
        assert_eq!(
            u32::from_le_bytes(template_payload[44..48].try_into().unwrap()),
            12
        );
        assert_eq!(&binding_payload[0..8], b"NEIUIB1\0");
        assert_eq!(
            u32::from_le_bytes(binding_payload[12..16].try_into().unwrap()),
            1
        );
        assert_eq!(&string_payload[0..8], b"NEIUIS1\0");
        assert!(u32::from_le_bytes(string_payload[12..16].try_into().unwrap()) > 8);
        assert_eq!(bindings[0]["templateKey"], json!("furnace@default"));
    }

    #[test]
    fn zero_recipe_diagnostics_distinguish_legal_and_suspicious_handlers() {
        let value = json!({
            "summary": {
                "status": "warning",
                "totalHandlers": 8,
                "handlersWithLoadedRecipes": 6,
                "handlersWithExportedRecipes": 4,
                "expectedEmptyHandlers": 2,
                "nativeCoveredZeroExports": 3,
                "nonRecipeInfoZeroExports": 1,
                "suspiciousZeroExports": 1,
                "partialExports": 2
            }
        });
        let diagnostics = raw_export::zero_recipe_diagnostics_from_value(&value).unwrap();
        assert_eq!(diagnostics.status.as_deref(), Some("warning"));
        assert_eq!(diagnostics.legal_zero_recipe_handlers, 6);
        assert_eq!(diagnostics.suspicious_zero_exports, 1);
        assert_eq!(diagnostics.partial_exports, 2);
    }

    #[test]
    fn native_ui_layout_report_counts_gregtech_progress_and_backgrounds() {
        let temp = tempfile::tempdir().unwrap();
        let recipes_dir = temp.path().join("recipes");
        fs::create_dir_all(&recipes_dir).unwrap();
        write_json_value(
            &recipes_dir.join("handler-layout-index.json"),
            &json!({
                "schemaVersion": "neonei/recipe-handler-layout-index/v1",
                "layouts": [{
                    "handlerKey": "gt.recipe.test",
                    "handlerClass": "gregtech.nei.GTNEIDefaultHandler",
                    "canonicalMachineFamily": "gregtech-machine",
                    "layoutKind": "machine",
                    "width": 176,
                    "height": 90,
                    "maxRecipesPerPage": 1,
                    "imageRegion": { "x": 0, "y": 0, "width": 176, "height": 90 },
                    "nativeBackground": {
                        "status": "captured",
                        "kind": "gt-modular-ui",
                        "assetRef": "assets/ui-backgrounds/gregtech/nei_single_recipe.png",
                        "resource": "gregtech:textures/gui/background/nei_single_recipe.png",
                        "scaling": "nine-slice",
                        "texture": { "width": 64, "height": 64, "borderU": 2, "borderV": 2 }
                    },
                    "progressBars": [{ "x": 78, "y": 24, "width": 20, "height": 18 }]
                }]
            }),
        )
        .unwrap();
        write_json_value(
            &recipes_dir.join("ui-payload-index.json"),
            &json!({
                "schemaVersion": "neonei/recipe-ui-payload-index/v1",
                "recipes": [{
                    "recipeId": "gt:test",
                    "familyKey": "gregtech-machine|machine|176x90@0#1|unknown",
                    "nativeLayout": {
                        "canonicalMachineFamily": "gregtech-machine",
                        "imageRegion": { "x": 0, "y": 0, "width": 176, "height": 90 },
                        "progressBars": [{ "x": 78, "y": 24, "width": 20, "height": 18 }]
                    }
                }]
            }),
        )
        .unwrap();

        let report =
            native_ui_report::compile_native_ui_layout_report(temp.path(), captured_ui_family_key)
                .unwrap()
                .unwrap();

        assert_eq!(report["status"], json!("ready"));
        assert_eq!(report["counts"]["gregtechHandlerLayouts"], json!(1));
        assert_eq!(
            report["counts"]["gregtechRecipeUiPayloadsWithProgressBars"],
            json!(1)
        );
        assert_eq!(report["backgroundStatus"], json!("captured"));
        assert_eq!(
            report["counts"]["gregtechRecipeUiPayloadsWithNativeBackgrounds"],
            json!(1)
        );
        assert!(temp
            .path()
            .join("rust")
            .join("native-ui-layout-report.json")
            .exists());
    }

    #[test]
    fn production_manifest_entries_exclude_debug_json_packs() {
        let production_entries = runtime::rust_manifest_file_entries(CompileScope::All, false)
            .into_iter()
            .map(|(_, path)| path)
            .collect::<Vec<_>>();
        assert!(production_entries.contains(&"rust/browser.bin"));
        assert!(production_entries.contains(&"rust/search.bin"));
        assert!(production_entries.contains(&"rust/recipes.bin"));
        assert!(production_entries.contains(&"rust/textures.bin"));
        assert!(production_entries.contains(&"rust/atlas.meta.bin"));
        assert!(production_entries.contains(&"rust/ui-pack/ui_templates.bin"));
        assert!(production_entries.contains(&"rust/ui-pack/ui_bindings.bin"));
        assert!(production_entries.contains(&"rust/ui-pack/ui_strings.bin"));
        assert!(production_entries.contains(&"rust/ui-pack/ui_assets.manifest.json"));
        assert!(production_entries.contains(&"rust/ui-pack/ui_pack_report.json"));
        assert!(production_entries.contains(&"rust/native-ui-layout-report.json"));
        assert!(production_entries.contains(&"rust/semantic-validation-report.json"));
        assert!(production_entries.contains(&"rust/recipe-handler-metadata-report.json"));
        assert!(production_entries.contains(&"rust/recipe-fragmentation-report.json"));
        assert!(!production_entries.contains(&"rust/browser-pack.json"));
        assert!(!production_entries.contains(&"rust/search-pack.json"));
        assert!(!production_entries.contains(&"rust/recipe-pack.json"));
        assert!(!production_entries.contains(&"rust/texture-pack.json"));

        let debug_entries = runtime::rust_manifest_file_entries(CompileScope::All, true)
            .into_iter()
            .map(|(_, path)| path)
            .collect::<Vec<_>>();
        assert!(debug_entries.contains(&"rust/browser-pack.json"));
        assert!(debug_entries.contains(&"rust/search-pack.json"));
        assert!(debug_entries.contains(&"rust/recipe-pack.json"));
        assert!(debug_entries.contains(&"rust/texture-pack.json"));
    }
}
