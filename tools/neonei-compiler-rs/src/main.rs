use anyhow::{anyhow, Context, Result};
use clap::{Parser, Subcommand, ValueEnum};
use flate2::read::GzDecoder;
use pinyin::ToPinyin;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::fs::{self, File};
use std::io::{BufRead, BufReader, Read};
use std::path::{Path, PathBuf};
use std::time::Instant;

#[derive(Parser, Debug)]
#[command(name = "neonei-compiler")]
#[command(about = "NeoNEI Rust runtime data compiler scaffold", long_about = None)]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand, Debug)]
enum Command {
    /// Read a Raw Export and emit a deterministic baseline report.
    Baseline {
        #[arg(long)]
        input: PathBuf,
        #[arg(long)]
        report: PathBuf,
        #[arg(long)]
        threads: Option<usize>,
        #[arg(long, default_value_t = false)]
        strict: bool,
    },
    /// Placeholder compile command; currently validates input and writes a scaffold report.
    Compile {
        #[arg(long)]
        input: PathBuf,
        #[arg(long)]
        output: PathBuf,
        #[arg(long)]
        report: PathBuf,
        #[arg(long, value_enum, default_value_t = CompileScope::All)]
        scope: CompileScope,
        #[arg(long)]
        threads: Option<usize>,
        #[arg(long, default_value_t = false)]
        strict: bool,
        /// Emit large JSON debug packs next to binary runtime packs.
        #[arg(long, default_value_t = false)]
        debug_json: bool,
    },
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, ValueEnum)]
enum CompileScope {
    All,
    Search,
    Browser,
    Recipes,
    Ui,
    Textures,
}

#[derive(Debug, Deserialize)]
struct RawManifest {
    #[serde(rename = "schemaVersion")]
    schema_version: Option<String>,
    #[serde(default)]
    files: BTreeMap<String, String>,
    #[serde(default)]
    capabilities: Vec<String>,
    #[serde(rename = "generatedAt")]
    generated_at: Option<Value>,
    #[serde(rename = "repositoryName")]
    repository_name: Option<String>,
}

#[derive(Debug, Serialize)]
struct CompilerReport {
    schema_version: &'static str,
    mode: String,
    input: String,
    output: Option<String>,
    elapsed_ms: u128,
    raw_export: RawExportSummary,
    runtime: RuntimeSummary,
    warnings: Vec<String>,
    blocked: Vec<String>,
}

#[derive(Debug, Serialize)]
struct RuntimeSummary {
    counts: BTreeMap<String, u64>,
    sizes: BTreeMap<String, u64>,
}

#[derive(Debug, Serialize)]
struct RawExportSummary {
    manifest_schema_version: Option<String>,
    repository_name: Option<String>,
    generated_at: Option<Value>,
    capabilities: Vec<String>,
    declared_files: usize,
    existing_declared_files: usize,
    missing_declared_files: Vec<String>,
    file_counts: BTreeMap<String, u64>,
    file_hashes: BTreeMap<String, String>,
    #[serde(rename = "zeroRecipeDiagnostics")]
    zero_recipe_diagnostics: Option<ZeroRecipeDiagnostics>,
}

#[derive(Debug, Serialize)]
struct ZeroRecipeDiagnostics {
    status: Option<String>,
    #[serde(rename = "totalHandlers")]
    total_handlers: u64,
    #[serde(rename = "handlersWithLoadedRecipes")]
    handlers_with_loaded_recipes: u64,
    #[serde(rename = "handlersWithExportedRecipes")]
    handlers_with_exported_recipes: u64,
    #[serde(rename = "legalZeroRecipeHandlers")]
    legal_zero_recipe_handlers: u64,
    #[serde(rename = "expectedEmptyHandlers")]
    expected_empty_handlers: u64,
    #[serde(rename = "nativeCoveredZeroExports")]
    native_covered_zero_exports: u64,
    #[serde(rename = "nonRecipeInfoZeroExports")]
    non_recipe_info_zero_exports: u64,
    #[serde(rename = "suspiciousZeroExports")]
    suspicious_zero_exports: u64,
    #[serde(rename = "partialExports")]
    partial_exports: u64,
}

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
                CompileScope::Search => compile_search_pack(&input, &output, strict, debug_json)?,
                CompileScope::Browser => compile_browser_pack(&input, &output, strict, debug_json)?,
                CompileScope::Recipes => compile_recipe_pack(&input, &output, strict, debug_json)?,
                CompileScope::Ui => compile_ui_pack(&input, &output, strict, debug_json)?,
                CompileScope::Textures => {
                    compile_texture_pack(&input, &output, strict, debug_json)?
                }
            }
            compile_semantic_validation_report(&input, &output)?;
            compile_runtime_reports(&output, scope, strict, debug_json)?;
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

fn read_manifest(input: &Path) -> Result<RawManifest> {
    let manifest_path = input.join("manifest.json");
    let text = fs::read_to_string(&manifest_path)
        .with_context(|| format!("read manifest {}", manifest_path.display()))?;
    serde_json::from_str(&text)
        .with_context(|| format!("parse manifest {}", manifest_path.display()))
}

fn summarize_raw_export(
    input: &Path,
    manifest: &RawManifest,
    warnings: &mut Vec<String>,
    blocked: &mut Vec<String>,
) -> Result<RawExportSummary> {
    let mut existing_declared_files = 0usize;
    let mut missing_declared_files = Vec::new();
    let mut file_counts = BTreeMap::new();
    let mut file_hashes = BTreeMap::new();

    for (logical_name, relative_path) in &manifest.files {
        let normalized = relative_path
            .replace('\\', "/")
            .trim_start_matches('/')
            .to_string();
        let path = input.join(&normalized);
        if !path.exists() {
            missing_declared_files.push(format!("{}:{}", logical_name, normalized));
            continue;
        }
        if path.is_dir() {
            warnings.push(format!(
                "manifest path is a directory and was not hashed as a file: {}:{}",
                logical_name, normalized
            ));
            existing_declared_files += 1;
            continue;
        }
        existing_declared_files += 1;
        file_hashes.insert(logical_name.clone(), sha256_file(&path)?);
        if normalized.ends_with(".jsonl") || normalized.ends_with(".jsonl.gz") {
            file_counts.insert(logical_name.clone(), count_jsonl_rows(&path)?);
        }
    }

    for required in ["items", "fluids", "recipeIndex", "browserAtlasIndex"] {
        if !manifest.files.contains_key(required) {
            blocked.push(format!("missing required manifest file key: {}", required));
        }
    }
    if missing_declared_files.is_empty() {
        warnings.push("all declared manifest files exist".to_string());
    }
    let zero_recipe_diagnostics = read_zero_recipe_diagnostics(input, manifest, warnings)?;

    Ok(RawExportSummary {
        manifest_schema_version: manifest.schema_version.clone(),
        repository_name: manifest.repository_name.clone(),
        generated_at: manifest.generated_at.clone(),
        capabilities: manifest.capabilities.clone(),
        declared_files: manifest.files.len(),
        existing_declared_files,
        missing_declared_files,
        file_counts,
        file_hashes,
        zero_recipe_diagnostics,
    })
}

fn read_zero_recipe_diagnostics(
    input: &Path,
    manifest: &RawManifest,
    warnings: &mut Vec<String>,
) -> Result<Option<ZeroRecipeDiagnostics>> {
    let path = resolve_manifest_path(input, manifest, "neiHandlerAnomalies").or_else(|| {
        let candidate = input.join("validation").join("nei_handler_anomalies.json");
        candidate.exists().then_some(candidate)
    });
    let Some(path) = path else {
        warnings.push(
            "zero-recipe diagnostics are missing: validation/nei_handler_anomalies.json"
                .to_string(),
        );
        return Ok(None);
    };
    let text = fs::read_to_string(&path).with_context(|| format!("read {}", path.display()))?;
    let value: Value =
        serde_json::from_str(&text).with_context(|| format!("parse {}", path.display()))?;
    Ok(zero_recipe_diagnostics_from_value(&value))
}

fn zero_recipe_diagnostics_from_value(value: &Value) -> Option<ZeroRecipeDiagnostics> {
    let summary = value.get("summary").and_then(Value::as_object)?;
    let expected_empty_handlers = object_u64(summary, "expectedEmptyHandlers");
    let native_covered_zero_exports = object_u64(summary, "nativeCoveredZeroExports");
    let non_recipe_info_zero_exports = object_u64(summary, "nonRecipeInfoZeroExports");
    let legal_zero_recipe_handlers = object_u64(summary, "legalZeroRecipeHandlers")
        .max(expected_empty_handlers + native_covered_zero_exports + non_recipe_info_zero_exports);
    Some(ZeroRecipeDiagnostics {
        status: summary
            .get("status")
            .and_then(Value::as_str)
            .map(str::to_string),
        total_handlers: object_u64(summary, "totalHandlers"),
        handlers_with_loaded_recipes: object_u64(summary, "handlersWithLoadedRecipes"),
        handlers_with_exported_recipes: object_u64(summary, "handlersWithExportedRecipes"),
        legal_zero_recipe_handlers,
        expected_empty_handlers,
        native_covered_zero_exports,
        non_recipe_info_zero_exports,
        suspicious_zero_exports: object_u64(summary, "suspiciousZeroExports"),
        partial_exports: object_u64(summary, "partialExports"),
    })
}

fn object_u64(map: &serde_json::Map<String, Value>, key: &str) -> u64 {
    map.get(key).and_then(Value::as_u64).unwrap_or(0)
}

fn count_jsonl_rows(path: &Path) -> Result<u64> {
    let reader: Box<dyn Read> = if path.extension().and_then(|value| value.to_str()) == Some("gz") {
        Box::new(GzDecoder::new(File::open(path)?))
    } else {
        Box::new(File::open(path)?)
    };
    let buf = BufReader::new(reader);
    let mut count = 0u64;
    for line in buf.lines() {
        if !line?.trim().is_empty() {
            count += 1;
        }
    }
    Ok(count)
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
    let atlas = read_manifest_json(input, &manifest, "browserAtlasIndex")?.unwrap_or(Value::Null);
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

fn compile_search_pack(input: &Path, output: &Path, strict: bool, debug_json: bool) -> Result<()> {
    let manifest = read_manifest(input)?;
    let items = read_json_collection(
        input,
        &manifest,
        &["items", "browserCatalog", "searchAll"],
        Some("items"),
    )?;
    let group_rows = read_json_collection(
        input,
        &manifest,
        &["groups", "browserGroups"],
        Some("groups"),
    )?;

    if strict && items.is_empty() {
        return Err(anyhow!(
            "search compiler blocked: raw items stream is empty"
        ));
    }

    let mut group_by_member = BTreeMap::new();
    for row in &group_rows {
        let group_key = value_string(row, "groupKey");
        let group_label = value_string(row, "groupLabel");
        let representative = value_string(row, "representativeItemId");
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
        for member in &members {
            group_by_member.insert(
                member.clone(),
                json!({
                    "groupKey": group_key,
                    "groupLabel": group_label,
                    "groupSize": value_u64(row, "groupSize").unwrap_or(members.len() as u64),
                    "representativeItemId": representative,
                }),
            );
        }
    }

    let mut alias_items = 0usize;
    let search_items = items
        .iter()
        .enumerate()
        .map(|(search_rank, item)| {
            let item_id = value_string(item, "itemId").unwrap_or_default();
            let localized_name = value_string(item, "localizedName");
            let mod_id = value_string(item, "modId");
            let internal_name = value_string(item, "internalName");
            let render_asset_ref = value_string(item, "renderAssetRef");
            let raw_search_terms = value_string(item, "searchTerms");
            let (pinyin_full, pinyin_acronym) =
                build_pinyin_fields(localized_name.as_deref().unwrap_or_default());
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
            alias_items += 1;
            json!({
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
            })
        })
        .collect::<Vec<_>>();

    let rust_dir = output.join("rust");
    fs::create_dir_all(&rust_dir)?;
    let browser_items = read_json_collection(
        input,
        &manifest,
        &["browserCatalog", "items"],
        Some("items"),
    )?;
    let string_pack = build_compact_string_payload_from_items(&browser_items)?;
    let search_pack = json!({
        "schemaVersion": "neonei/rust-search-pack/current",
        "counts": {
            "items": search_items.len(),
            "aliasItems": alias_items,
        },
        "items": search_items,
    });
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
    write_binary_pack_payload(
        &rust_dir.join("strings.zh_cn.bin"),
        "neonei/string-pack/current",
        &string_pack,
    )?;
    Ok(())
}

fn intern_compact_string(
    strings: &mut Vec<String>,
    refs: &mut HashMap<String, u32>,
    value: Option<String>,
) -> u32 {
    let normalized = value.unwrap_or_default();
    if let Some(existing) = refs.get(&normalized) {
        return *existing;
    }
    let next = strings.len() as u32;
    strings.push(normalized.clone());
    refs.insert(normalized, next);
    next
}

fn push_u32(bytes: &mut Vec<u8>, value: u32) {
    bytes.extend_from_slice(&value.to_le_bytes());
}

fn push_i32(bytes: &mut Vec<u8>, value: i32) {
    bytes.extend_from_slice(&value.to_le_bytes());
}

fn build_compact_browser_payload(input: &Path, manifest: &RawManifest) -> Result<Vec<u8>> {
    let items = read_json_collection(input, manifest, &["browserCatalog", "items"], Some("items"))?;
    build_compact_browser_payload_from_items(&items)
}

fn build_compact_browser_payload_from_items(items: &[Value]) -> Result<Vec<u8>> {
    let mut strings = vec![String::new()];
    let mut string_refs = HashMap::new();
    string_refs.insert(String::new(), 0u32);
    let mut rows = Vec::<[u32; 6]>::with_capacity(items.len());

    for (index, item) in items.iter().enumerate() {
        let item_id_ref =
            intern_compact_string(&mut strings, &mut string_refs, value_string(item, "itemId"));
        let localized_name_ref = intern_compact_string(
            &mut strings,
            &mut string_refs,
            value_string(item, "localizedName"),
        );
        let mod_id_ref =
            intern_compact_string(&mut strings, &mut string_refs, value_string(item, "modId"));
        let group_key_ref = intern_compact_string(
            &mut strings,
            &mut string_refs,
            value_string(item, "groupKey"),
        );
        let browser_order = value_u64(item, "browserOrder")
            .unwrap_or(index as u64)
            .min(u32::MAX as u64) as u32;
        let flags = if item
            .get("groupKey")
            .and_then(Value::as_str)
            .is_some_and(|value| !value.is_empty())
        {
            1
        } else {
            0
        };
        rows.push([
            item_id_ref,
            localized_name_ref,
            mod_id_ref,
            group_key_ref,
            browser_order,
            flags,
        ]);
    }

    let mut string_offsets = Vec::<u32>::with_capacity(strings.len());
    let mut string_bytes = Vec::<u8>::new();
    for value in &strings {
        string_offsets.push(string_bytes.len() as u32);
        string_bytes.extend_from_slice(value.as_bytes());
        string_bytes.push(0);
    }

    let row_stride_u32 = 6u32;
    let mut payload = Vec::with_capacity(
        8 + 4 * 4
            + string_offsets.len() * 4
            + rows.len() * row_stride_u32 as usize * 4
            + string_bytes.len(),
    );
    payload.extend_from_slice(b"NEIBRW1\0");
    push_u32(&mut payload, 1);
    push_u32(&mut payload, rows.len() as u32);
    push_u32(&mut payload, strings.len() as u32);
    push_u32(&mut payload, row_stride_u32);
    for offset in string_offsets {
        push_u32(&mut payload, offset);
    }
    for row in rows {
        for value in row {
            push_u32(&mut payload, value);
        }
    }
    payload.extend_from_slice(&string_bytes);
    Ok(payload)
}

fn build_compact_group_payload_from_groups(groups: &[Value]) -> Result<Vec<u8>> {
    let mut strings = vec![String::new()];
    let mut string_refs = HashMap::new();
    string_refs.insert(String::new(), 0u32);
    let mut rows = Vec::<[u32; 6]>::new();
    let mut members = Vec::<u32>::new();

    let mut sorted_groups = groups.to_vec();
    sorted_groups.sort_by(|left, right| {
        value_string(left, "groupKey").cmp(&value_string(right, "groupKey"))
    });

    for group in &sorted_groups {
        let group_key = intern_compact_string(
            &mut strings,
            &mut string_refs,
            value_string(group, "groupKey"),
        );
        let group_label = intern_compact_string(
            &mut strings,
            &mut string_refs,
            value_string(group, "groupLabel"),
        );
        let representative = intern_compact_string(
            &mut strings,
            &mut string_refs,
            value_string(group, "representativeItemId"),
        );
        let member_start = members.len() as u32;
        if let Some(values) = group.get("memberItemIds").and_then(Value::as_array) {
            for member in values {
                members.push(intern_compact_string(
                    &mut strings,
                    &mut string_refs,
                    member.as_str().map(str::to_string),
                ));
            }
        }
        let member_count = (members.len() as u32).saturating_sub(member_start);
        rows.push([
            group_key,
            group_label,
            representative,
            member_start,
            member_count,
            value_u64(group, "groupSize").unwrap_or(member_count as u64) as u32,
        ]);
    }

    let mut string_offsets = Vec::<u32>::with_capacity(strings.len());
    let mut string_bytes = Vec::<u8>::new();
    for value in &strings {
        string_offsets.push(string_bytes.len() as u32);
        string_bytes.extend_from_slice(value.as_bytes());
        string_bytes.push(0);
    }

    let row_stride_u32 = 6u32;
    let mut payload = Vec::with_capacity(
        8 + 5 * 4
            + string_offsets.len() * 4
            + rows.len() * row_stride_u32 as usize * 4
            + members.len() * 4
            + string_bytes.len(),
    );
    payload.extend_from_slice(b"NEIGRP1\0");
    push_u32(&mut payload, 1);
    push_u32(&mut payload, rows.len() as u32);
    push_u32(&mut payload, strings.len() as u32);
    push_u32(&mut payload, members.len() as u32);
    push_u32(&mut payload, row_stride_u32);
    for offset in string_offsets {
        push_u32(&mut payload, offset);
    }
    for row in rows {
        for value in row {
            push_u32(&mut payload, value);
        }
    }
    for member in members {
        push_u32(&mut payload, member);
    }
    payload.extend_from_slice(&string_bytes);
    Ok(payload)
}

fn build_compact_string_payload_from_items(items: &[Value]) -> Result<Vec<u8>> {
    let mut strings = vec![String::new()];
    let mut string_refs = HashMap::new();
    string_refs.insert(String::new(), 0u32);
    let mut rows = Vec::<[u32; 6]>::with_capacity(items.len());

    let mut sorted_items = items.to_vec();
    sorted_items
        .sort_by(|left, right| value_string(left, "itemId").cmp(&value_string(right, "itemId")));

    for item in &sorted_items {
        rows.push([
            intern_compact_string(&mut strings, &mut string_refs, value_string(item, "itemId")),
            intern_compact_string(
                &mut strings,
                &mut string_refs,
                value_string(item, "localizedName"),
            ),
            intern_compact_string(&mut strings, &mut string_refs, value_string(item, "modId")),
            intern_compact_string(
                &mut strings,
                &mut string_refs,
                value_string(item, "internalName"),
            ),
            intern_compact_string(
                &mut strings,
                &mut string_refs,
                value_string(item, "groupKey"),
            ),
            intern_compact_string(
                &mut strings,
                &mut string_refs,
                value_string(item, "groupLabel"),
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

    let row_stride_u32 = 6u32;
    let mut payload = Vec::with_capacity(
        8 + 4 * 4
            + string_offsets.len() * 4
            + rows.len() * row_stride_u32 as usize * 4
            + string_bytes.len(),
    );
    payload.extend_from_slice(b"NEISTR1\0");
    push_u32(&mut payload, 1);
    push_u32(&mut payload, rows.len() as u32);
    push_u32(&mut payload, strings.len() as u32);
    push_u32(&mut payload, row_stride_u32);
    for offset in string_offsets {
        push_u32(&mut payload, offset);
    }
    for row in rows {
        for value in row {
            push_u32(&mut payload, value);
        }
    }
    payload.extend_from_slice(&string_bytes);
    Ok(payload)
}

fn build_compact_search_payload_from_items(items: &[Value]) -> Result<Vec<u8>> {
    let mut strings = vec![String::new()];
    let mut string_refs = HashMap::new();
    string_refs.insert(String::new(), 0u32);
    let mut rows = Vec::<[u32; 13]>::with_capacity(items.len());

    let mut sorted_items = items.to_vec();
    sorted_items.sort_by(|left, right| {
        value_u64(left, "searchRank")
            .cmp(&value_u64(right, "searchRank"))
            .then_with(|| value_string(left, "itemId").cmp(&value_string(right, "itemId")))
    });
    for (fallback_rank, item) in sorted_items.iter().enumerate() {
        let popularity = value_u64(item, "popularityScore")
            .unwrap_or(1)
            .min(u32::MAX as u64) as u32;
        let search_rank = value_u64(item, "searchRank")
            .unwrap_or(fallback_rank as u64)
            .min(u32::MAX as u64) as u32;
        let browser_index = value_u64(item, "browserIndex")
            .unwrap_or(search_rank as u64)
            .min(u32::MAX as u64) as u32;
        rows.push([
            intern_compact_string(&mut strings, &mut string_refs, value_string(item, "itemId")),
            intern_compact_string(
                &mut strings,
                &mut string_refs,
                value_string(item, "publicItemId"),
            ),
            intern_compact_string(
                &mut strings,
                &mut string_refs,
                value_string(item, "localizedName"),
            ),
            intern_compact_string(&mut strings, &mut string_refs, value_string(item, "modId")),
            intern_compact_string(
                &mut strings,
                &mut string_refs,
                value_string(item, "normalizedLocalizedName"),
            ),
            intern_compact_string(
                &mut strings,
                &mut string_refs,
                value_string(item, "normalizedInternalName"),
            ),
            intern_compact_string(
                &mut strings,
                &mut string_refs,
                value_string(item, "normalizedItemId"),
            ),
            intern_compact_string(
                &mut strings,
                &mut string_refs,
                value_string(item, "normalizedSearchTerms"),
            ),
            intern_compact_string(
                &mut strings,
                &mut string_refs,
                value_string(item, "pinyinFull"),
            ),
            intern_compact_string(
                &mut strings,
                &mut string_refs,
                value_string(item, "pinyinAcronym"),
            ),
            popularity,
            search_rank,
            browser_index,
        ]);
    }

    let mut string_offsets = Vec::<u32>::with_capacity(strings.len());
    let mut string_bytes = Vec::<u8>::new();
    for value in &strings {
        string_offsets.push(string_bytes.len() as u32);
        string_bytes.extend_from_slice(value.as_bytes());
        string_bytes.push(0);
    }

    let row_stride_u32 = 13u32;
    let mut payload = Vec::with_capacity(
        8 + 4 * 4
            + string_offsets.len() * 4
            + rows.len() * row_stride_u32 as usize * 4
            + string_bytes.len(),
    );
    payload.extend_from_slice(b"NEISRC2\0");
    push_u32(&mut payload, 1);
    push_u32(&mut payload, rows.len() as u32);
    push_u32(&mut payload, strings.len() as u32);
    push_u32(&mut payload, row_stride_u32);
    for offset in string_offsets {
        push_u32(&mut payload, offset);
    }
    for row in rows {
        for value in row {
            push_u32(&mut payload, value);
        }
    }
    payload.extend_from_slice(&string_bytes);
    Ok(payload)
}

fn compile_dist_browser_pack(
    input: &Path,
    output: &Path,
    strict: bool,
    debug_json: bool,
) -> Result<()> {
    let manifest = read_manifest(input)?;
    let browser_files = runtime_file_descriptors(
        input,
        &manifest,
        &[
            ("browserCatalog", "browserCatalog"),
            ("hiddenBrowserCatalog", "hiddenBrowserCatalog"),
            ("groups", "browserGroups"),
            ("nativeNeiRules", "nativeNeiRules"),
            ("searchAll", "searchAll"),
            ("searchAliasIndex", "searchAliasIndex"),
        ],
    )?;
    if strict
        && !browser_files.iter().any(|value| {
            value
                .get("logicalName")
                .and_then(Value::as_str)
                .is_some_and(|value| value == "browserCatalog")
        })
    {
        return Err(anyhow!(
            "browser compiler blocked: browserCatalog is missing"
        ));
    }

    let browser_pack = json!({
        "schemaVersion": "neonei/rust-browser-pack/current",
        "sourceKind": "dist-data",
        "counts": { "files": browser_files.len() },
        "files": browser_files,
    });
    let compact_browser_payload = build_compact_browser_payload(input, &manifest)?;
    let group_pack = json!({
        "schemaVersion": "neonei/rust-group-pack/current",
        "sourceKind": "dist-data",
        "files": runtime_file_descriptors(input, &manifest, &[("groups", "browserGroups")])?,
    });
    let search_pack = json!({
        "schemaVersion": "neonei/rust-search-pack/current",
        "sourceKind": "dist-data",
        "files": runtime_file_descriptors(
            input,
            &manifest,
            &[("searchAll", "searchAll"), ("searchAliasIndex", "searchAliasIndex")],
        )?,
    });

    let rust_dir = output.join("rust");
    fs::create_dir_all(&rust_dir)?;
    if debug_json {
        write_json_value(&rust_dir.join("browser-pack.json"), &browser_pack)?;
    }
    if debug_json {
        write_json_value(&rust_dir.join("search-pack.json"), &search_pack)?;
    }
    write_binary_pack_payload(
        &rust_dir.join("browser.bin"),
        "neonei/browser-pack/current",
        &compact_browser_payload,
    )?;
    write_binary_pack(
        &rust_dir.join("groups.bin"),
        "neonei/group-pack/current",
        &group_pack,
    )?;
    let browser_items = read_json_collection(
        input,
        &manifest,
        &["browserCatalog", "items"],
        Some("items"),
    )?;
    let browser_index_by_item = browser_items
        .iter()
        .enumerate()
        .filter_map(|(index, item)| Some((value_string(item, "itemId")?, index as u64)))
        .collect::<BTreeMap<_, _>>();
    let mut search_rows = read_json_collection(
        input,
        &manifest,
        &["searchAll", "browserCatalog", "items"],
        Some("items"),
    )?;
    for item in &mut search_rows {
        if let Some(item_object) = item.as_object_mut() {
            if let Some(item_id) = item_object.get("itemId").and_then(Value::as_str) {
                if let Some(browser_index) = browser_index_by_item.get(item_id) {
                    item_object.insert("browserIndex".to_string(), json!(browser_index));
                }
            }
        }
    }
    let compact_search_payload = build_compact_search_payload_from_items(&search_rows)?;
    write_binary_pack_payload(
        &rust_dir.join("search.bin"),
        "neonei/search-pack/current",
        &compact_search_payload,
    )?;
    let string_pack = build_compact_string_payload_from_items(&browser_items)?;
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
    let mut ui_payload_shards: BTreeMap<String, BTreeMap<String, Value>> = BTreeMap::new();
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
        let mut payload_entry = payload_meta.clone();
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
        ui_payload_shards
            .entry(rust_recipe_ui_payload_relative_path(&recipe_id))
            .or_default()
            .insert(recipe_id.clone(), payload_entry);
        ui_payload_index.push(payload_meta);

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
    for (shard_path, payloads) in &ui_payload_shards {
        let absolute_shard_path = output.join(shard_path);
        if let Some(parent) = absolute_shard_path.parent() {
            fs::create_dir_all(parent)?;
        }
        write_json_value(
            &absolute_shard_path,
            &json!({
                "schemaVersion": "neonei/recipe-ui-payload-shard/v1",
                "payloads": payloads,
            }),
        )?;
    }
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

fn compile_dist_recipe_pack(
    input: &Path,
    output: &Path,
    strict: bool,
    debug_json: bool,
) -> Result<()> {
    let manifest = read_manifest(input)?;
    let recipe_files = runtime_file_descriptors(
        input,
        &manifest,
        &[
            ("itemIndex", "recipeItemIndex"),
            ("handlers", "recipeHandlers"),
            ("handlerLayouts", "recipeHandlerLayouts"),
            ("categoryIndex", "recipeCategories"),
            ("uiPayloadIndex", "recipeUiPayloadIndex"),
        ],
    )?;
    if strict
        && !recipe_files.iter().any(|value| {
            value
                .get("logicalName")
                .and_then(Value::as_str)
                .is_some_and(|value| value == "itemIndex")
        })
    {
        return Err(anyhow!(
            "recipe compiler blocked: recipeItemIndex is missing"
        ));
    }

    let recipe_output_pack = json!({
        "schemaVersion": "neonei/rust-recipe-pack/current",
        "sourceKind": "dist-data",
        "counts": {
            "files": recipe_files.len(),
        },
        "files": recipe_files,
    });

    let rust_dir = output.join("rust");
    fs::create_dir_all(&rust_dir)?;
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
                "templatePackMagic": "NEIUIT1\\u0000",
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
            "unboundRecipes": unbound_recipes,
        }),
    )?;
    Ok(())
}

fn read_compiled_recipe_ui_payload_index(output: &Path) -> Result<Option<Vec<Value>>> {
    let path = output.join("recipes").join("ui-payload-index.json");
    if !path.exists() {
        return Ok(None);
    }
    let text = fs::read_to_string(&path).with_context(|| format!("read {}", path.display()))?;
    let value: Value =
        serde_json::from_str(&text).with_context(|| format!("parse {}", path.display()))?;
    Ok(Some(
        value
            .get("recipes")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default(),
    ))
}

fn build_raw_recipe_ui_payload_index(input: &Path, manifest: &RawManifest) -> Result<Vec<Value>> {
    let recipe_index = read_manifest_json(input, manifest, "recipeIndex")?
        .ok_or_else(|| anyhow!("ui-pack compiler blocked: recipeIndex is missing"))?;
    let handlers = read_jsonl_values(input, manifest, "neiHandlers")?;
    let layouts = read_json_collection(
        input,
        manifest,
        &["neiHandlerLayouts", "recipeLayouts"],
        Some("handler-layouts"),
    )?;
    let handler_context = RecipeHandlerContext::new(&handlers, &layouts);
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

    let mut entries = Vec::with_capacity(recipes.len());
    for recipe in &recipes {
        let recipe_id = recipe_id(recipe);
        let (handler, layout) = handler_context.resolve(recipe);
        let public_handler = handler.map(public_recipe_handler);
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
        entries.push(json!({
            "recipeId": recipe_id,
            "path": rust_recipe_ui_payload_relative_path(&recipe_id),
            "payloadKey": recipe_id,
            "familyKey": family_key,
            "recipeType": recipe_type,
            "machineType": machine_type,
            "handlerKey": handler_key,
        }));
    }
    Ok(entries)
}

fn ui_template_catalog_templates(catalog: &Value) -> Vec<Value> {
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

fn build_ui_template_bindings(recipe_index: &[Value], templates: &[Value]) -> Vec<Value> {
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

fn build_ui_assets_manifest(templates: &[Value]) -> Value {
    let mut assets_by_ref: BTreeMap<String, Vec<String>> = BTreeMap::new();
    for template in templates {
        let asset = value_string(template, "imageResource").unwrap_or_default();
        if asset.trim().is_empty() {
            continue;
        }
        let template_key = value_string(template, "templateKey").unwrap_or_default();
        assets_by_ref.entry(asset).or_default().push(template_key);
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

fn ui_template_slot_count(template: &Value) -> usize {
    template
        .get("slots")
        .and_then(Value::as_array)
        .map(|values| values.len())
        .unwrap_or(0)
}

fn ui_template_text_count(template: &Value) -> usize {
    template
        .get("textOverlays")
        .and_then(Value::as_array)
        .map(|values| values.len())
        .unwrap_or(0)
}

fn ui_template_rect_count(template: &Value, key: &str) -> usize {
    template
        .get(key)
        .and_then(Value::as_array)
        .map(|values| values.len())
        .unwrap_or(0)
}

fn ui_template_rect_action_count(template: &Value, key: &str) -> usize {
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

fn build_compact_ui_template_payload(
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

fn build_compact_ui_binding_payload(
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

fn build_compact_ui_string_payload(strings: &[String]) -> Result<Vec<u8>> {
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

fn build_compact_recipe_payload_from_pack(pack: &Value) -> Result<Vec<u8>> {
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

#[derive(Clone)]
struct RecipeCategoryAccumulator {
    category_id: String,
    recipe_count: usize,
    display_name: String,
    source_category_ids: Vec<String>,
    handler: Option<Value>,
    native_layout: Option<Value>,
    machine_icon: Option<Value>,
}

struct RecipeHandlerContext<'a> {
    by_key: HashMap<String, &'a Value>,
    by_class: HashMap<String, &'a Value>,
    by_loose: HashMap<String, &'a Value>,
    layout_by_key: HashMap<String, &'a Value>,
    layout_by_class: HashMap<String, &'a Value>,
}

impl<'a> RecipeHandlerContext<'a> {
    fn new(handlers: &'a [Value], layouts: &'a [Value]) -> Self {
        let mut by_key = HashMap::new();
        let mut by_class = HashMap::new();
        let mut by_loose = HashMap::new();
        for handler in handlers {
            let key = value_string(handler, "handlerKey")
                .unwrap_or_default()
                .trim()
                .to_string();
            let handler_class = value_string(handler, "handlerClass")
                .unwrap_or_default()
                .trim()
                .to_string();
            if !key.is_empty() {
                by_key.insert(key.clone(), handler);
            }
            if !handler_class.is_empty() {
                by_class.insert(handler_class.clone(), handler);
            }
            for value in [
                Some(key),
                Some(handler_class),
                value_string(handler, "displayName"),
                value_string(handler, "localizedName"),
                value_string(handler, "catalystItemName"),
                value_string(handler, "preferredMachineItemName"),
            ]
            .into_iter()
            .flatten()
            {
                let normalized = normalize_handler_lookup_key(&value);
                if !normalized.is_empty() {
                    by_loose.entry(normalized).or_insert(handler);
                }
            }
        }
        let mut layout_by_key = HashMap::new();
        let mut layout_by_class = HashMap::new();
        for layout in layouts {
            if let Some(key) = value_string(layout, "handlerKey") {
                if !key.trim().is_empty() {
                    layout_by_key.insert(key.trim().to_string(), layout);
                }
            }
            if let Some(handler_class) = value_string(layout, "handlerClass") {
                if !handler_class.trim().is_empty() {
                    layout_by_class.insert(handler_class.trim().to_string(), layout);
                }
            }
        }
        Self {
            by_key,
            by_class,
            by_loose,
            layout_by_key,
            layout_by_class,
        }
    }

    fn resolve(&self, recipe: &Value) -> (Option<&'a Value>, Option<&'a Value>) {
        let candidates = [
            nested_value_string(recipe, &["metadata", "handlerKey"]),
            nested_value_string(recipe, &["metadata", "handlerClass"]),
            nested_value_string(recipe, &["metadata", "handler"]),
            nested_value_string(recipe, &["metadata", "handlerId"]),
            nested_value_string(recipe, &["metadata", "handlerName"]),
            nested_value_string(recipe, &["additionalData", "handlerKey"]),
            nested_value_string(recipe, &["additionalData", "handlerClass"]),
            nested_value_string(recipe, &["additionalData", "handler"]),
            nested_value_string(recipe, &["additionalData", "handlerId"]),
            nested_value_string(recipe, &["additionalData", "handlerName"]),
            nested_value_string(recipe, &["machine", "machineId"]),
            nested_value_string(recipe, &["machine", "displayName"]),
            value_string(recipe, "family"),
            value_string(recipe, "sourcePlugin"),
            value_string(recipe, "recipeType"),
        ];
        for candidate in candidates.into_iter().flatten() {
            let candidate = candidate.trim();
            if candidate.is_empty() {
                continue;
            }
            let handler = self
                .by_key
                .get(candidate)
                .or_else(|| self.by_class.get(candidate))
                .or_else(|| self.by_loose.get(&normalize_handler_lookup_key(candidate)))
                .copied();
            if let Some(handler) = handler {
                let key = value_string(handler, "handlerKey").unwrap_or_default();
                let handler_class = value_string(handler, "handlerClass").unwrap_or_default();
                let layout = self
                    .layout_by_key
                    .get(key.trim())
                    .or_else(|| self.layout_by_class.get(handler_class.trim()))
                    .copied();
                return (Some(handler), layout);
            }
        }
        (None, None)
    }
}

fn public_recipe_handler(handler: &Value) -> Value {
    json!({
        "handlerKey": value_string(handler, "handlerKey"),
        "handlerClass": value_string(handler, "handlerClass"),
        "displayName": first_non_empty(&[value_string(handler, "localizedName"), value_string(handler, "displayName"), value_string(handler, "handlerKey")]),
        "localizedName": first_non_empty(&[value_string(handler, "localizedName"), value_string(handler, "displayName")]),
        "canonicalMachineFamily": value_string(handler, "canonicalMachineFamily"),
        "modId": value_string(handler, "modId"),
        "modName": value_string(handler, "modName"),
        "catalystItemName": value_string(handler, "catalystItemName"),
        "preferredMachineItemName": first_non_empty(&[value_string(handler, "preferredMachineItemName"), value_string(handler, "catalystItemName")]),
        "gtMultiblockPreferred": handler.get("gtMultiblockPreferred").and_then(Value::as_bool).unwrap_or(false),
        "maxRecipesPerPage": value_u64(handler, "maxRecipesPerPage").unwrap_or(1),
        "handlerWidth": value_u64(handler, "handlerWidth").unwrap_or(166),
        "handlerHeight": value_u64(handler, "handlerHeight").unwrap_or(65),
        "yShift": value_i64(handler, "yShift").unwrap_or(0),
        "imageResource": value_string(handler, "imageResource"),
    })
}

fn public_recipe_layout(layout: &Value) -> Value {
    json!({
        "handlerKey": value_string(layout, "handlerKey"),
        "handlerClass": value_string(layout, "handlerClass"),
        "canonicalMachineFamily": value_string(layout, "canonicalMachineFamily"),
        "layoutKind": value_string(layout, "layoutKind").unwrap_or_else(|| "native-nei".to_string()),
        "width": value_u64(layout, "width").unwrap_or(166),
        "height": value_u64(layout, "height").unwrap_or(65),
        "yShift": value_i64(layout, "yShift").unwrap_or(0),
        "maxRecipesPerPage": value_u64(layout, "maxRecipesPerPage").unwrap_or(1),
        "imageResource": value_string(layout, "imageResource"),
        "imageRegion": layout.get("imageRegion").cloned().unwrap_or(Value::Null),
        "slots": layout.get("slots").and_then(Value::as_array).cloned().unwrap_or_default(),
        "textOverlays": layout.get("textOverlays").and_then(Value::as_array).cloned().unwrap_or_default(),
        "dynamicPrimitives": layout.get("dynamicPrimitives").and_then(Value::as_array).cloned().unwrap_or_default(),
        "progressBars": layout.get("progressBars").and_then(Value::as_array).cloned().unwrap_or_default(),
        "fluidBars": layout.get("fluidBars").and_then(Value::as_array).cloned().unwrap_or_default(),
        "energyBars": layout.get("energyBars").and_then(Value::as_array).cloned().unwrap_or_default(),
        "hotspots": layout.get("hotspots").and_then(Value::as_array).cloned().unwrap_or_default(),
        "viewports": layout.get("viewports").and_then(Value::as_array).cloned().unwrap_or_default(),
    })
}

fn has_value_text(value: &Value, key: &str) -> bool {
    value_string(value, key).is_some_and(|value| !value.trim().is_empty())
}

fn build_recipe_handler_metadata_report(
    handlers: &[Value],
    layouts: &[Value],
    categories: &[Value],
) -> Value {
    let layout_keys = layouts
        .iter()
        .filter_map(|layout| value_string(layout, "handlerKey"))
        .filter(|value| !value.trim().is_empty())
        .collect::<BTreeSet<_>>();
    let missing_handler_key = handlers
        .iter()
        .filter(|handler| !has_value_text(handler, "handlerKey"))
        .count();
    let missing_display_name = handlers
        .iter()
        .filter(|handler| {
            !has_value_text(handler, "displayName") && !has_value_text(handler, "localizedName")
        })
        .count();
    let missing_family = handlers
        .iter()
        .filter(|handler| !has_value_text(handler, "canonicalMachineFamily"))
        .count();
    let missing_layout = handlers
        .iter()
        .filter(|handler| {
            value_string(handler, "handlerKey")
                .filter(|value| !value.trim().is_empty())
                .is_some_and(|key| !layout_keys.contains(&key))
        })
        .count();
    let layout_without_slots = layouts
        .iter()
        .filter(|layout| {
            !layout
                .get("slots")
                .and_then(Value::as_array)
                .is_some_and(|slots| !slots.is_empty())
        })
        .count();
    let missing_machine_refs = handlers
        .iter()
        .filter(|handler| {
            !has_value_text(handler, "catalystItemName")
                && !has_value_text(handler, "preferredMachineItemName")
        })
        .count();
    let gt_multiblock_without_preferred = handlers
        .iter()
        .filter(|handler| {
            handler
                .get("gtMultiblockPreferred")
                .and_then(Value::as_bool)
                .unwrap_or(false)
                && !has_value_text(handler, "preferredMachineItemName")
        })
        .count();
    let expected_gt_machine_icons = BTreeMap::from([
        ("gt.recipe.alloysmelter", "gregtech:gt.blockmachines:31023"),
        ("gt.recipe.arcfurnace", "gregtech:gt.blockmachines:862"),
        (
            "gt.recipe.fluidsolidifier",
            "gregtech:gt.blockmachines:10890",
        ),
        ("gt.recipe.macerator", "gregtech:gt.blockmachines:797"),
    ]);
    let gt_machine_icon_mismatches = handlers
        .iter()
        .filter(|handler| {
            let handler_key = value_string(handler, "handlerKey").unwrap_or_default();
            let handler_class = value_string(handler, "handlerClass").unwrap_or_default();
            let expected = expected_gt_machine_icons
                .get(handler_key.as_str())
                .or_else(|| expected_gt_machine_icons.get(handler_class.as_str()));
            expected.is_some_and(|expected| {
                value_string(handler, "preferredMachineItemName")
                    .unwrap_or_default()
                    .trim()
                    != *expected
            })
        })
        .count();
    let categories_with_handler = categories
        .iter()
        .filter(|category| {
            category
                .get("handler")
                .is_some_and(|value| !value.is_null())
        })
        .count();
    let categories_with_native_layout = categories
        .iter()
        .filter(|category| {
            category
                .get("nativeLayout")
                .is_some_and(|value| !value.is_null())
        })
        .count();
    let missing_machine_ref_ratio = if handlers.is_empty() {
        1.0
    } else {
        missing_machine_refs as f64 / handlers.len() as f64
    };
    json!({
        "schemaVersion": "neonei/rust-recipe-handler-metadata-report/current",
        "generatedAt": "deterministic-rust-compiler",
        "counts": {
            "handlers": handlers.len(),
            "layouts": layouts.len(),
            "categories": categories.len(),
            "categoriesWithHandler": categories_with_handler,
            "categoriesWithNativeLayout": categories_with_native_layout,
            "missingHandlerKey": missing_handler_key,
            "missingDisplayName": missing_display_name,
            "missingFamily": missing_family,
            "missingLayout": missing_layout,
            "layoutWithoutSlots": layout_without_slots,
            "missingMachineRefs": missing_machine_refs,
            "gtMultiblockWithoutPreferred": gt_multiblock_without_preferred,
            "gtMachineIconMismatches": gt_machine_icon_mismatches,
            "missingMachineRefRatio": missing_machine_ref_ratio,
        }
    })
}

fn build_recipe_fragmentation_report(categories: &[Value]) -> Value {
    json!({
        "schemaVersion": "neonei/rust-recipe-fragmentation-report/current",
        "generatedAt": "deterministic-rust-compiler",
        "status": "ok",
        "counts": {
            "reportedDisplaySplits": 0,
            "reportedHandlerSplits": 0,
            "trueDisplaySplits": 0,
            "trueHandlerSplits": 0,
            "coreDisplaySplits": 0,
            "coreHandlerSplits": 0,
            "categories": categories.len(),
        },
        "samples": {
            "trueDisplaySplits": [],
            "trueHandlerSplits": [],
            "coreDisplaySplits": [],
            "coreHandlerSplits": [],
        }
    })
}

fn recipe_id(recipe: &Value) -> String {
    first_non_empty(&[
        value_string(recipe, "recipeId"),
        value_string(recipe, "id"),
        value_string(recipe, "key"),
    ])
    .unwrap_or_default()
}

fn recipe_category_display_name(recipe: &Value, handler: Option<&Value>) -> String {
    first_non_empty(&[
        handler.and_then(|handler| value_string(handler, "localizedName")),
        handler.and_then(|handler| value_string(handler, "displayName")),
        nested_value_string(recipe, &["machine", "displayName"]),
        value_string(recipe, "displayName"),
        nested_value_string(recipe, &["machine", "machineType"]),
        value_string(recipe, "recipeType"),
        value_string(recipe, "family"),
        value_string(recipe, "sourcePlugin"),
        Some("unknown".to_string()),
    ])
    .unwrap_or_else(|| "unknown".to_string())
}

fn recipe_category_raw_id(recipe: &Value, handler: Option<&Value>) -> String {
    first_non_empty(&[
        handler.and_then(|handler| value_string(handler, "handlerKey")),
        nested_value_string(recipe, &["machine", "machineId"]),
        value_string(recipe, "family"),
        value_string(recipe, "sourcePlugin"),
        value_string(recipe, "recipeType"),
        Some("unknown".to_string()),
    ])
    .unwrap_or_else(|| "unknown".to_string())
}

fn recipe_category_id_from_display_name(display_name: &str, raw_id: &str) -> String {
    let normalized = normalize_recipe_category_name(display_name);
    if normalized.is_empty() || normalized == "unknown" {
        return raw_id.to_string();
    }
    format!("display~{}", encode_recipe_file_name(&normalized))
}

fn normalize_machine_icon_item_id(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }
    if let Some(stripped) = trimmed.strip_prefix("nesqlpp:item/") {
        return normalize_machine_icon_item_id(stripped);
    }
    if let Some(stripped) = trimmed.strip_prefix("item:") {
        return normalize_machine_icon_item_id(stripped);
    }
    if trimmed.starts_with("i~") {
        return Some(trimmed.to_string());
    }
    let parts = trimmed.split(':').collect::<Vec<_>>();
    if parts.len() >= 2 && !parts[0].is_empty() && !parts[1].is_empty() {
        let damage = parts.get(2).copied().unwrap_or("0");
        return Some(format!("i~{}~{}~{}", parts[0], parts[1], damage));
    }
    None
}

fn recipe_machine_icon(recipe: &Value, public_handler: Option<&Value>) -> Option<Value> {
    let render_asset_ref = first_non_empty(&[
        nested_value_string(recipe, &["machine", "iconRef"]),
        nested_value_string(recipe, &["renderHints", "machineIconAssetRef"]),
        nested_value_string(recipe, &["machine", "machineIcon", "renderAssetRef"]),
        nested_value_string(
            recipe,
            &["metadata", "machineInfo", "machineIcon", "renderAssetRef"],
        ),
        public_handler
            .and_then(|handler| nested_value_string(handler, &["machineIcon", "renderAssetRef"])),
    ]);
    let item_id = first_non_empty(&[
        render_asset_ref
            .as_deref()
            .and_then(normalize_machine_icon_item_id),
        nested_value_string(recipe, &["machine", "machineIcon", "itemId"])
            .as_deref()
            .and_then(normalize_machine_icon_item_id),
        nested_value_string(
            recipe,
            &["metadata", "machineInfo", "machineIcon", "itemId"],
        )
        .as_deref()
        .and_then(normalize_machine_icon_item_id),
        public_handler
            .and_then(|handler| value_string(handler, "preferredMachineItemName"))
            .as_deref()
            .and_then(normalize_machine_icon_item_id),
        public_handler
            .and_then(|handler| value_string(handler, "catalystItemName"))
            .as_deref()
            .and_then(normalize_machine_icon_item_id),
    ]);
    let image_file_name = first_non_empty(&[
        nested_value_string(recipe, &["machine", "machineIcon", "imageFileName"]),
        nested_value_string(
            recipe,
            &["metadata", "machineInfo", "machineIcon", "imageFileName"],
        ),
        public_handler
            .and_then(|handler| nested_value_string(handler, &["machineIcon", "imageFileName"])),
    ]);

    if item_id.is_none() && render_asset_ref.is_none() && image_file_name.is_none() {
        return None;
    }

    let mut object = serde_json::Map::new();
    if let Some(value) = item_id {
        object.insert("itemId".to_string(), Value::String(value));
    }
    if let Some(value) = render_asset_ref {
        object.insert("renderAssetRef".to_string(), Value::String(value));
    }
    if let Some(value) = image_file_name {
        object.insert("imageFileName".to_string(), Value::String(value));
    }
    Some(Value::Object(object))
}

fn normalize_recipe_category_name(value: &str) -> String {
    let mut stripped = String::new();
    let mut skip_format = false;
    for character in value.trim().chars() {
        if skip_format {
            skip_format = false;
            continue;
        }
        if character == '\u{00A7}' || character == '&' {
            skip_format = true;
            continue;
        }
        stripped.push(character);
    }
    normalize_text(&stripped)
}

fn encode_recipe_file_name(value: &str) -> String {
    value
        .chars()
        .map(|character| match character {
            'a'..='z' | 'A'..='Z' | '0'..='9' | '-' | '_' | '.' | '~' => character,
            _ => '_',
        })
        .collect()
}

fn rust_recipe_ui_payload_relative_path(recipe_id: &str) -> String {
    let shard = sha1_hex_prefix(recipe_id.as_bytes(), 2);
    format!("recipes/ui-payload-shards/{shard}.json")
}

fn sha1_hex_prefix(bytes: &[u8], hex_len: usize) -> String {
    let mut h0: u32 = 0x6745_2301;
    let mut h1: u32 = 0xefcd_ab89;
    let mut h2: u32 = 0x98ba_dcfe;
    let mut h3: u32 = 0x1032_5476;
    let mut h4: u32 = 0xc3d2_e1f0;

    let bit_len = (bytes.len() as u64).wrapping_mul(8);
    let mut message = bytes.to_vec();
    message.push(0x80);
    while message.len() % 64 != 56 {
        message.push(0);
    }
    message.extend_from_slice(&bit_len.to_be_bytes());

    for chunk in message.chunks_exact(64) {
        let mut w = [0u32; 80];
        for (index, word) in w.iter_mut().take(16).enumerate() {
            let offset = index * 4;
            *word = u32::from_be_bytes([
                chunk[offset],
                chunk[offset + 1],
                chunk[offset + 2],
                chunk[offset + 3],
            ]);
        }
        for index in 16..80 {
            w[index] = (w[index - 3] ^ w[index - 8] ^ w[index - 14] ^ w[index - 16]).rotate_left(1);
        }

        let mut a = h0;
        let mut b = h1;
        let mut c = h2;
        let mut d = h3;
        let mut e = h4;
        for (index, word) in w.iter().enumerate() {
            let (f, k) = match index {
                0..=19 => ((b & c) | ((!b) & d), 0x5a82_7999),
                20..=39 => (b ^ c ^ d, 0x6ed9_eba1),
                40..=59 => ((b & c) | (b & d) | (c & d), 0x8f1b_bcdc),
                _ => (b ^ c ^ d, 0xca62_c1d6),
            };
            let temp = a
                .rotate_left(5)
                .wrapping_add(f)
                .wrapping_add(e)
                .wrapping_add(k)
                .wrapping_add(*word);
            e = d;
            d = c;
            c = b.rotate_left(30);
            b = a;
            a = temp;
        }
        h0 = h0.wrapping_add(a);
        h1 = h1.wrapping_add(b);
        h2 = h2.wrapping_add(c);
        h3 = h3.wrapping_add(d);
        h4 = h4.wrapping_add(e);
    }

    let hex = format!("{h0:08x}{h1:08x}{h2:08x}{h3:08x}{h4:08x}");
    hex.chars().take(hex_len).collect()
}

fn classify_recipe_family_key(recipe: &Value, fallback: &str, handler: Option<&Value>) -> String {
    let descriptor = [
        value_string(recipe, "family"),
        value_string(recipe, "sourcePlugin"),
        value_string(recipe, "recipeType"),
        value_string(recipe, "displayName"),
        nested_value_string(recipe, &["machine", "machineId"]),
        nested_value_string(recipe, &["machine", "displayName"]),
        nested_value_string(recipe, &["metadata", "handlerId"]),
        nested_value_string(recipe, &["metadata", "handlerName"]),
        nested_value_string(recipe, &["additionalData", "handlerId"]),
        nested_value_string(recipe, &["additionalData", "handlerName"]),
    ]
    .into_iter()
    .flatten()
    .collect::<Vec<_>>()
    .join(" ")
    .to_lowercase();
    if (descriptor.contains("industrial") && descriptor.contains("slaughter"))
        || includes_any(
            &descriptor,
            &[
                "extreme entity crusher",
                "infernal drops",
                "mobsinfo",
                "kubatech",
            ],
        )
    {
        return "industrial_slaughterhouse".to_string();
    }
    if includes_any(&descriptor, &["terra plate", "terraplate"]) {
        return "botania_terra_plate".to_string();
    }
    if includes_any(&descriptor, &["rune altar", "runic altar"]) {
        return "botania_rune_altar".to_string();
    }
    if includes_any(&descriptor, &["mana pool"]) {
        return "botania_mana_pool".to_string();
    }
    if includes_any(&descriptor, &["pure daisy"]) {
        return "botania_pure_daisy".to_string();
    }
    if includes_any(&descriptor, &["elven trade", "alfheim"]) {
        return "botania_elven_trade".to_string();
    }
    if (descriptor.contains("thaumcraft") && descriptor.contains("infusion"))
        || includes_any(&descriptor, &["arcane infusion"])
    {
        return "thaumcraft_infusion".to_string();
    }
    if (descriptor.contains("thaumcraft") && descriptor.contains("crucible"))
        || includes_any(&descriptor, &["crucible"])
    {
        return "thaumcraft_crucible".to_string();
    }
    if includes_any(&descriptor, &["arcane work", "arcane crafting"]) {
        return "thaumcraft_arcane".to_string();
    }
    if includes_any(&descriptor, &["aspect combination", "aspects from items"]) {
        return "thaumcraft_aspect".to_string();
    }
    if includes_any(&descriptor, &["research station"]) {
        return "gt_research_station".to_string();
    }
    if includes_any(&descriptor, &["assembly line"]) {
        return "gt_assembly_line".to_string();
    }
    if includes_any(&descriptor, &["chemical reactor", "large chemical reactor"]) {
        return "gt_chemical_reactor".to_string();
    }
    if includes_any(&descriptor, &["blood altar"]) {
        return "blood_magic_altar".to_string();
    }
    if includes_any(&descriptor, &["alchemy array", "alchemy table"]) {
        return "blood_alchemy_table".to_string();
    }
    if includes_any(&descriptor, &["binding ritual"]) {
        return "blood_binding_ritual".to_string();
    }
    if let Some(family) = handler
        .and_then(|handler| value_string(handler, "canonicalMachineFamily"))
        .filter(|family| family != "native-nei")
    {
        return family;
    }
    fallback.to_string()
}

fn captured_ui_family_key(handler: Option<&Value>, layout: Option<&Value>) -> Option<String> {
    let handler = handler?;
    let layout = layout?;
    let family = value_string(handler, "canonicalMachineFamily")?;
    if family.trim().is_empty() {
        return None;
    }
    let layout_kind =
        value_string(layout, "layoutKind").unwrap_or_else(|| "native-nei".to_string());
    let width = value_u64(layout, "width").unwrap_or(166);
    let height = value_u64(layout, "height").unwrap_or(65);
    let y_shift = value_i64(layout, "yShift").unwrap_or(0);
    let max_recipes_per_page = value_u64(layout, "maxRecipesPerPage").unwrap_or(1);
    let image_resource = first_non_empty(&[
        value_string(layout, "imageResource"),
        value_string(handler, "imageResource"),
    ])
    .unwrap_or_default();
    Some(format!(
        "{}|{}|{}x{}@{}#{}|{}",
        normalize_ui_family_key_part(&family),
        normalize_ui_family_key_part(&layout_kind),
        width,
        height,
        y_shift,
        max_recipes_per_page,
        normalize_ui_family_key_part(&image_resource)
    ))
}

fn normalize_ui_family_key_part(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        "unknown".to_string()
    } else {
        trimmed.to_lowercase()
    }
}

fn collect_recipe_item_ids(recipe: &Value, keys: &[&str]) -> Vec<String> {
    let mut ids = Vec::new();
    for key in keys {
        collect_recipe_item_ids_from_value(recipe.get(*key), &mut ids);
    }
    ids.sort();
    ids.dedup();
    ids
}

fn collect_recipe_item_ids_from_value(value: Option<&Value>, ids: &mut Vec<String>) {
    match value {
        Some(Value::Array(values)) => {
            for value in values {
                collect_recipe_item_ids_from_value(Some(value), ids);
            }
        }
        Some(Value::Object(map)) => {
            if let Some(item_id) = map.get("itemId").and_then(Value::as_str) {
                ids.push(item_id.to_string());
            }
            for key in ["items", "item", "input", "output", "ingredients", "results"] {
                collect_recipe_item_ids_from_value(map.get(key), ids);
            }
        }
        _ => {}
    }
}

fn normalize_handler_lookup_key(value: &str) -> String {
    normalize_text(value)
        .replace("recipehandler", "")
        .replace("nei", "")
        .replace(|character: char| !character.is_ascii_alphanumeric(), "")
}
fn includes_any(value: &str, needles: &[&str]) -> bool {
    needles.iter().any(|needle| value.contains(needle))
}

fn first_non_empty(values: &[Option<String>]) -> Option<String> {
    values
        .iter()
        .flatten()
        .map(|value| value.trim().to_string())
        .find(|value| !value.is_empty())
}

fn nested_value_string(value: &Value, path: &[&str]) -> Option<String> {
    let mut current = value;
    for key in path {
        current = current.get(*key)?;
    }
    current.as_str().map(str::to_string)
}

fn compact_fact_object(value: Option<&Value>) -> Option<Value> {
    match compact_fact_value(value?, 0) {
        Some(Value::Object(map)) if !map.is_empty() => Some(Value::Object(map)),
        _ => None,
    }
}

fn compact_fact_value(value: &Value, depth: usize) -> Option<Value> {
    if depth > 5 {
        return None;
    }
    match value {
        Value::Null => None,
        Value::Bool(_) | Value::Number(_) => Some(value.clone()),
        Value::String(text) => {
            let trimmed = text.trim();
            if trimmed.is_empty() || trimmed.len() > 512 {
                None
            } else {
                Some(Value::String(trimmed.to_string()))
            }
        }
        Value::Array(entries) => {
            let compacted = entries
                .iter()
                .take(64)
                .filter_map(|entry| compact_fact_value(entry, depth + 1))
                .collect::<Vec<_>>();
            if compacted.is_empty() {
                None
            } else {
                Some(Value::Array(compacted))
            }
        }
        Value::Object(entries) => {
            let mut compacted = serde_json::Map::new();
            for (key, entry) in entries {
                if let Some(value) = compact_fact_value(entry, depth + 1) {
                    compacted.insert(key.clone(), value);
                }
            }
            if compacted.is_empty() {
                None
            } else {
                Some(Value::Object(compacted))
            }
        }
    }
}
fn value_i64(value: &Value, key: &str) -> Option<i64> {
    value.get(key)?.as_i64()
}

fn item_id_from_asset_id(asset_id: &str) -> Option<String> {
    asset_id.strip_prefix("nesqlpp:item/").map(str::to_string)
}

fn normalize_block_lookup_key(mod_id: &str, internal_name: &str, damage: u64) -> Option<String> {
    let normalized_mod = mod_id
        .trim()
        .to_ascii_lowercase()
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric() || *ch == '_')
        .collect::<String>();
    let normalized_name = internal_name.trim().to_ascii_lowercase();
    if normalized_mod.is_empty() || normalized_name.is_empty() {
        None
    } else {
        Some(format!("{}:{}:{}", normalized_mod, normalized_name, damage))
    }
}

fn decode_item_block_key(item_id: &str) -> Option<String> {
    let parts = item_id.split('~').collect::<Vec<_>>();
    if parts.len() < 4 {
        return None;
    }
    let damage = parts[3].parse::<u64>().unwrap_or(0);
    normalize_block_lookup_key(parts[1], parts[2], damage)
}

fn parse_buildcraft_facade_target(item: &Value) -> Option<(String, String, u64)> {
    let family = value_string(item, "semanticFamily")
        .or_else(|| value_string(item, "family"))
        .unwrap_or_default()
        .to_ascii_lowercase();
    let item_mod_id = value_string(item, "modId")
        .unwrap_or_default()
        .to_ascii_lowercase()
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric() || *ch == '_')
        .collect::<String>();
    let item_internal_name = value_string(item, "internalName")
        .unwrap_or_default()
        .to_ascii_lowercase();
    let is_facade = family == "facade.buildcraft"
        || (item_mod_id == "buildcrafttransport" && item_internal_name == "pipefacade");
    if !is_facade {
        return None;
    }
    let descriptor = value_string(item, "nbtDescriptor")?;
    let block_marker = "block:";
    let block_start = descriptor.find(block_marker)? + block_marker.len();
    let block_tail = descriptor[block_start..].trim_start();
    let block_tail = block_tail.strip_prefix('"').unwrap_or(block_tail);
    let block_end = block_tail
        .find(|ch| ch == '"' || ch == ',' || ch == '}')
        .unwrap_or(block_tail.len());
    let block = &block_tail[..block_end];
    let (mod_id, internal_name) = block.split_once(':')?;
    let damage = descriptor
        .find("metadata:")
        .and_then(|index| {
            let tail = descriptor[index + "metadata:".len()..].trim_start();
            let digits = tail
                .chars()
                .take_while(|ch| ch.is_ascii_digit() || *ch == '-')
                .collect::<String>();
            digits.parse::<i64>().ok()
        })
        .unwrap_or(0)
        .max(0) as u64;
    Some((mod_id.to_string(), internal_name.to_string(), damage))
}

fn repaired_browser_atlas(atlas: &Value, texture_rows: &[Value], item_rows: &[Value]) -> Value {
    let mut items = atlas
        .get("items")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let mut existing = items
        .iter()
        .filter_map(|entry| value_string(entry, "itemId").map(|item_id| (item_id, true)))
        .collect::<BTreeMap<_, bool>>();

    for texture in texture_rows {
        let Some(asset_id) = value_string(texture, "assetId") else {
            continue;
        };
        let Some(item_id) = item_id_from_asset_id(&asset_id) else {
            continue;
        };
        if existing.contains_key(&item_id) {
            continue;
        }
        let Some(atlas_file) = value_string(texture, "atlasFile") else {
            continue;
        };
        let rect = texture.get("rect").cloned().unwrap_or_else(|| {
            json!({
                "x": 0,
                "y": 0,
                "width": 16,
                "height": 16,
            })
        });
        let x = rect.get("x").and_then(Value::as_u64).unwrap_or(0);
        let y = rect.get("y").and_then(Value::as_u64).unwrap_or(0);
        let width = rect.get("width").and_then(Value::as_u64).unwrap_or(16);
        let height = rect.get("height").and_then(Value::as_u64).unwrap_or(16);
        items.push(json!({
            "itemId": item_id,
            "assetId": asset_id,
            "hasStaticAtlas": true,
            "resolutionMode": "rust_texture_row_repair",
            "staticAtlas": {
                "atlasFile": atlas_file,
                "atlasWidth": x + width,
                "atlasHeight": y + height,
                "x": x,
                "y": y,
                "width": width,
                "height": height,
            },
        }));
        existing.insert(item_id, true);
    }

    let atlas_by_block = items
        .iter()
        .filter_map(|entry| {
            let item_id = value_string(entry, "itemId")?;
            let key = decode_item_block_key(&item_id)?;
            Some((key, entry.clone()))
        })
        .collect::<BTreeMap<_, _>>();
    let mut repaired_facades = 0u64;
    for item in item_rows {
        let Some(item_id) = value_string(item, "itemId") else {
            continue;
        };
        if existing.contains_key(&item_id) {
            continue;
        }
        let Some((mod_id, internal_name, damage)) = parse_buildcraft_facade_target(item) else {
            continue;
        };
        let Some(key) = normalize_block_lookup_key(&mod_id, &internal_name, damage) else {
            continue;
        };
        let Some(source_atlas) = atlas_by_block.get(&key) else {
            continue;
        };
        let mut alias = source_atlas.clone();
        if let Some(object) = alias.as_object_mut() {
            object.insert("itemId".to_string(), json!(item_id));
            object.insert(
                "assetId".to_string(),
                json!(value_string(item, "renderAssetRef").unwrap_or_else(|| {
                    format!(
                        "nesqlpp:item/{}",
                        value_string(item, "itemId").unwrap_or_default()
                    )
                })),
            );
            object.insert(
                "sourceItemId".to_string(),
                source_atlas
                    .get("itemId")
                    .cloned()
                    .unwrap_or_else(|| Value::Null),
            );
            object.insert(
                "semanticAtlasAlias".to_string(),
                json!("buildcraft-facade-block-state"),
            );
            object.insert("generatedByCompiler".to_string(), json!(true));
            object.insert(
                "resolutionMode".to_string(),
                json!("rust_buildcraft_facade_alias"),
            );
        }
        items.push(alias);
        existing.insert(item_id, true);
        repaired_facades += 1;
    }

    let mut repaired = atlas.clone();
    if !repaired.is_object() {
        repaired = json!({ "schemaVersion": "browser-atlas-index-repaired" });
    }
    if let Some(object) = repaired.as_object_mut() {
        object.insert("items".to_string(), Value::Array(items));
        let item_count = object
            .get("items")
            .and_then(Value::as_array)
            .map(|values| values.len() as u64)
            .unwrap_or(0);
        object.insert("itemCount".to_string(), json!(item_count));
        object.insert(
            "rustRepairedBuildCraftFacades".to_string(),
            json!(repaired_facades),
        );
    }
    repaired
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

fn atlas_drawable_score(atlas_entry: Option<&Value>) -> i64 {
    let Some(entry) = atlas_entry else {
        return 0;
    };
    let animated = entry.get("animatedAtlas");
    let static_atlas = entry.get("staticAtlas");
    let animated_file = optional_value_string(animated, "atlasFile");
    let static_file = optional_value_string(static_atlas, "atlasFile");
    let animated_frames = optional_value_u64(animated, "frameCount").unwrap_or(0) as i64;
    let static_width = optional_value_u64(static_atlas, "width").unwrap_or(0) as i64;
    let static_height = optional_value_u64(static_atlas, "height").unwrap_or(0) as i64;
    let mut score = 0i64;
    if animated_file
        .as_deref()
        .unwrap_or_default()
        .trim()
        .is_empty()
        && static_file.as_deref().unwrap_or_default().trim().is_empty()
    {
        return 0;
    }
    if animated_file
        .as_deref()
        .map(|value| !value.trim().is_empty())
        .unwrap_or(false)
        && animated_frames > 0
    {
        score += 10_000 + animated_frames.min(128);
    }
    if static_file
        .as_deref()
        .map(|value| !value.trim().is_empty())
        .unwrap_or(false)
        && static_width > 0
        && static_height > 0
    {
        let area = static_width.saturating_mul(static_height);
        score += 1_000 + area.min(16_384);
        if static_width >= 32 && static_height >= 32 {
            score += 500;
        }
        if static_width >= 64 && static_height >= 64 {
            score += 500;
        }
    }
    if value_string(entry, "resolutionMode")
        .or_else(|| value_string(entry, "renderMode"))
        .map(|mode| mode.contains("captured_final_atlas") || mode.contains("framebuffer"))
        .unwrap_or(false)
    {
        score += 750;
    }
    if value_string(entry, "resolutionMode")
        .or_else(|| value_string(entry, "renderMode"))
        .map(|mode| mode.contains("native_sprite"))
        .unwrap_or(false)
        && static_width <= 16
        && static_height <= 16
    {
        score -= 600;
    }
    score.max(0)
}

fn select_group_representative(
    exported_representative: Option<String>,
    members: &[String],
    atlas_by_item: &BTreeMap<String, Value>,
) -> Option<String> {
    let mut candidates = Vec::new();
    if let Some(representative) = exported_representative.clone() {
        if !representative.trim().is_empty() {
            candidates.push(representative);
        }
    }
    for member in members {
        if !member.trim().is_empty() && !candidates.iter().any(|candidate| candidate == member) {
            candidates.push(member.clone());
        }
    }
    candidates
        .into_iter()
        .enumerate()
        .max_by(|(left_index, left), (right_index, right)| {
            let left_score = atlas_drawable_score(atlas_by_item.get(left));
            let right_score = atlas_drawable_score(atlas_by_item.get(right));
            left_score
                .cmp(&right_score)
                .then_with(|| left_index.cmp(right_index))
        })
        .map(|(_, item_id)| item_id)
        .or(exported_representative)
}

#[derive(Clone, Debug, Default)]
struct AtlasMetaRow {
    atlas_file: String,
    width: u64,
    height: u64,
    kind_flags: u32,
    item_count: u32,
    frame_count: u32,
}

fn build_compact_atlas_meta_payload_from_atlas_items(atlas_items: &[Value]) -> Result<Vec<u8>> {
    let mut atlas_rows = BTreeMap::<String, AtlasMetaRow>::new();
    for item in atlas_items {
        if let Some(static_atlas) = item.get("staticAtlas").filter(|value| value.is_object()) {
            note_atlas_meta(&mut atlas_rows, static_atlas, 1, 0);
        }
        if let Some(animated_atlas) = item.get("animatedAtlas").filter(|value| value.is_object()) {
            let frame_count = animated_atlas
                .get("frames")
                .and_then(Value::as_array)
                .map(|values| values.len() as u32)
                .or_else(|| value_u64(animated_atlas, "frameCount").map(|value| value as u32))
                .unwrap_or(0);
            note_atlas_meta(&mut atlas_rows, animated_atlas, 2, frame_count);
        }
    }

    let mut strings = vec![String::new()];
    let mut string_refs = HashMap::new();
    string_refs.insert(String::new(), 0u32);
    let mut rows = Vec::<[u32; 6]>::new();
    for row in atlas_rows.values() {
        let atlas_file =
            intern_compact_string(&mut strings, &mut string_refs, Some(row.atlas_file.clone()));
        rows.push([
            atlas_file,
            row.width.min(u32::MAX as u64) as u32,
            row.height.min(u32::MAX as u64) as u32,
            row.kind_flags,
            row.item_count,
            row.frame_count,
        ]);
    }

    let mut string_offsets = Vec::<u32>::with_capacity(strings.len());
    let mut string_bytes = Vec::<u8>::new();
    for value in &strings {
        string_offsets.push(string_bytes.len() as u32);
        string_bytes.extend_from_slice(value.as_bytes());
        string_bytes.push(0);
    }

    let row_stride_u32 = 6u32;
    let mut payload = Vec::with_capacity(
        8 + 4 * 4
            + string_offsets.len() * 4
            + rows.len() * row_stride_u32 as usize * 4
            + string_bytes.len(),
    );
    payload.extend_from_slice(b"NEIATM1\0");
    push_u32(&mut payload, 1);
    push_u32(&mut payload, rows.len() as u32);
    push_u32(&mut payload, strings.len() as u32);
    push_u32(&mut payload, row_stride_u32);
    for offset in string_offsets {
        push_u32(&mut payload, offset);
    }
    for row in rows {
        for value in row {
            push_u32(&mut payload, value);
        }
    }
    payload.extend_from_slice(&string_bytes);
    Ok(payload)
}

fn normalize_runtime_atlas_file_path(value: Option<String>) -> Option<String> {
    let normalized = value?
        .replace('\\', "/")
        .trim_start_matches('/')
        .to_string();
    if normalized.is_empty() {
        return None;
    }
    if let Some(stripped) = normalized.strip_prefix("assets/textures/") {
        return Some(format!("textures/{stripped}"));
    }
    Some(normalized)
}

fn copy_runtime_atlas_assets(
    input: &Path,
    output: &Path,
    atlas_items: &[Value],
    missing_atlas_asset_files: &mut Vec<String>,
) -> Result<()> {
    let mut atlas_paths = BTreeMap::<String, String>::new();
    for item in atlas_items {
        for key in ["staticAtlas", "animatedAtlas"] {
            let Some(atlas) = item.get(key).filter(|value| value.is_object()) else {
                continue;
            };
            let Some(raw_atlas_file) = optional_value_string(Some(atlas), "atlasFile") else {
                continue;
            };
            let Some(runtime_atlas_file) =
                normalize_runtime_atlas_file_path(Some(raw_atlas_file.clone()))
            else {
                continue;
            };
            atlas_paths
                .entry(runtime_atlas_file)
                .or_insert(raw_atlas_file);
        }
    }

    for (runtime_atlas_file, raw_atlas_file) in atlas_paths {
        let raw_relative = raw_atlas_file
            .replace('\\', "/")
            .trim_start_matches('/')
            .to_string();
        let source_path = input.join(&raw_relative);
        if !source_path.is_file() {
            missing_atlas_asset_files.push(format!(
                "{runtime_atlas_file}:missing-source:{raw_relative}"
            ));
            continue;
        }
        let runtime_relative = runtime_atlas_file
            .replace('\\', "/")
            .trim_start_matches('/')
            .to_string();
        let destination_path = output.join(&runtime_relative);
        if let Some(parent) = destination_path.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::copy(&source_path, &destination_path).with_context(|| {
            format!(
                "copy runtime atlas asset {} -> {}",
                source_path.display(),
                destination_path.display()
            )
        })?;
    }
    Ok(())
}

fn note_atlas_meta(
    atlas_rows: &mut BTreeMap<String, AtlasMetaRow>,
    atlas: &Value,
    kind_flag: u32,
    frame_count: u32,
) {
    let Some(atlas_file) =
        normalize_runtime_atlas_file_path(optional_value_string(Some(atlas), "atlasFile"))
    else {
        return;
    };
    let width = value_u64(atlas, "atlasWidth")
        .or_else(|| {
            let x = value_u64(atlas, "x")?;
            let width = value_u64(atlas, "width")?;
            Some(x.saturating_add(width))
        })
        .unwrap_or(0);
    let height = value_u64(atlas, "atlasHeight")
        .or_else(|| {
            let y = value_u64(atlas, "y")?;
            let height = value_u64(atlas, "height")?;
            Some(y.saturating_add(height))
        })
        .unwrap_or(0);
    let row = atlas_rows
        .entry(atlas_file.clone())
        .or_insert_with(|| AtlasMetaRow {
            atlas_file,
            ..AtlasMetaRow::default()
        });
    row.width = row.width.max(width);
    row.height = row.height.max(height);
    row.kind_flags |= kind_flag;
    row.item_count = row.item_count.saturating_add(1);
    row.frame_count = row.frame_count.saturating_add(frame_count);
}

fn expected_animated_item(animation: Option<&Value>, native_sprite: Option<&Value>) -> bool {
    animation.is_some_and(|value| {
        value_u64(value, "frameCount").unwrap_or(0) > 1
            || value_u64(value, "frameDurationMs").unwrap_or(0) > 0
            || value
                .get("timeline")
                .and_then(Value::as_array)
                .is_some_and(|values| !values.is_empty())
    }) || native_sprite.is_some_and(|value| {
        value_u64(value, "frameCount").unwrap_or(0) > 1
            || value_u64(value, "frameDurationMs").unwrap_or(0) > 0
            || value
                .get("frames")
                .and_then(Value::as_array)
                .is_some_and(|values| values.len() > 1)
            || optional_value_string(Some(value), "animationMode").is_some()
            || optional_value_string(Some(value), "spriteMetadataFile").is_some()
    })
}

fn promote_animation_facts_to_animated_atlas(
    atlas: &Value,
    animation_by_asset: &BTreeMap<String, Value>,
    native_sprite_by_asset: &BTreeMap<String, Value>,
) -> Value {
    let mut promoted = atlas.clone();
    let Some(items) = promoted.get_mut("items").and_then(Value::as_array_mut) else {
        return promoted;
    };

    for item in items {
        let asset_id = value_string(item, "assetId").unwrap_or_default();
        let has_animated_atlas = item
            .get("hasAnimatedAtlas")
            .and_then(Value::as_bool)
            .unwrap_or(false);
        if has_animated_atlas {
            continue;
        }
        let animation = animation_by_asset.get(&asset_id);
        let native_sprite = native_sprite_by_asset.get(&asset_id);
        if !expected_animated_item(animation, native_sprite) {
            continue;
        }
        let Some(static_atlas) = item.get("staticAtlas").filter(|value| value.is_object()) else {
            continue;
        };
        let fact = animation.or(native_sprite);
        let frame_count = fact
            .and_then(|value| value_u64(value, "frameCount"))
            .unwrap_or(0);
        if frame_count <= 1 {
            continue;
        }
        let frame_duration_ms = fact
            .and_then(|value| value_u64(value, "frameDurationMs"))
            .unwrap_or(100);
        let x = value_u64(static_atlas, "x").unwrap_or(0);
        let y = value_u64(static_atlas, "y").unwrap_or(0);
        let width = value_u64(static_atlas, "width").unwrap_or(16);
        let height = value_u64(static_atlas, "height").unwrap_or(16);
        let frames = (0..frame_count)
            .map(|index| {
                json!({
                    "index": index,
                    "x": x,
                    "y": y,
                    "width": width,
                    "height": height,
                })
            })
            .collect::<Vec<_>>();
        let timeline = normalize_animation_fact_timeline(fact, frame_count, frame_duration_ms);
        let mut animated_atlas = static_atlas.clone();
        if let Some(object) = animated_atlas.as_object_mut() {
            object.insert("frameCount".to_string(), json!(frame_count));
            object.insert("frameDurationMs".to_string(), json!(frame_duration_ms));
            object.insert("frames".to_string(), Value::Array(frames));
            object.insert("timeline".to_string(), Value::Array(timeline));
            object.insert(
                "animationSource".to_string(),
                json!("native_sprite_fact_promotion"),
            );
        }
        if let Some(object) = item.as_object_mut() {
            object.insert("hasAnimatedAtlas".to_string(), json!(true));
            object.insert("animatedAtlas".to_string(), animated_atlas);
            object.insert(
                "animationPromotion".to_string(),
                json!("native_sprite_fact_promotion"),
            );
        }
    }
    promoted
}

fn normalize_animation_fact_timeline(
    fact: Option<&Value>,
    frame_count: u64,
    fallback_duration_ms: u64,
) -> Vec<Value> {
    if let Some(timeline) = fact
        .and_then(|value| value.get("timeline"))
        .and_then(Value::as_array)
        .filter(|values| !values.is_empty())
    {
        return timeline
            .iter()
            .enumerate()
            .map(|(index, value)| {
                if let Some(pair) = value.as_array() {
                    let frame_index = pair
                        .first()
                        .and_then(numeric_value_u64_lossy)
                        .unwrap_or(index as u64);
                    json!({
                        "frameIndex": normalize_timeline_frame_index(frame_index, frame_count),
                        "durationMs": pair
                            .get(1)
                            .and_then(numeric_value_u64_lossy)
                            .unwrap_or(fallback_duration_ms),
                    })
                } else if let Some(object) = value.as_object() {
                    let frame_index = object
                        .get("frameIndex")
                        .and_then(numeric_value_u64_lossy)
                        .unwrap_or(index as u64);
                    json!({
                        "frameIndex": normalize_timeline_frame_index(frame_index, frame_count),
                        "durationMs": object
                            .get("durationMs")
                            .and_then(numeric_value_u64_lossy)
                            .unwrap_or(fallback_duration_ms),
                    })
                } else {
                    json!({
                        "frameIndex": index as u64,
                        "durationMs": fallback_duration_ms,
                    })
                }
            })
            .collect();
    }
    (0..frame_count)
        .map(|frame_index| {
            json!({
                "frameIndex": frame_index,
                "durationMs": fallback_duration_ms,
            })
        })
        .collect()
}

fn expected_animation_reason(
    animation: Option<&Value>,
    native_sprite: Option<&Value>,
) -> &'static str {
    if native_sprite
        .and_then(|value| optional_value_string(Some(value), "spriteMetadataFile"))
        .is_some()
    {
        return "native sprite metadata exists";
    }
    if native_sprite
        .and_then(|value| optional_value_string(Some(value), "animationMode"))
        .is_some()
    {
        return "native sprite animation mode exists";
    }
    if animation
        .and_then(|value| value.get("timeline").and_then(Value::as_array))
        .is_some_and(|values| !values.is_empty())
    {
        return "raw animation timeline exists";
    }
    if animation
        .and_then(|value| value_u64(value, "frameCount"))
        .unwrap_or(0)
        > 1
        || native_sprite
            .and_then(|value| value_u64(value, "frameCount"))
            .unwrap_or(0)
            > 1
    {
        return "frameCount indicates multiple frames";
    }
    "animation timing facts exist"
}

fn build_compact_animation_payload_from_table(animation_table: &[Value]) -> Result<Vec<u8>> {
    let mut strings = vec![String::new()];
    let mut string_refs = HashMap::new();
    string_refs.insert(String::new(), 0u32);
    let mut rows = Vec::<[u32; 5]>::new();
    let mut frames = Vec::<[u32; 2]>::new();

    let mut sorted_animations = animation_table.to_vec();
    sorted_animations
        .sort_by(|left, right| value_string(left, "itemId").cmp(&value_string(right, "itemId")));

    for animation in &sorted_animations {
        let item_id = intern_compact_string(
            &mut strings,
            &mut string_refs,
            value_string(animation, "itemId"),
        );
        let atlas_file = intern_compact_string(
            &mut strings,
            &mut string_refs,
            normalize_runtime_atlas_file_path(value_string(animation, "atlasFile")),
        );
        let frame_start = frames.len() as u32;
        let frame_duration_ms = value_u64(animation, "frameDurationMs").unwrap_or(0) as u32;
        let timeline = animation
            .get("timeline")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        for (index, frame) in timeline.iter().enumerate() {
            frames.push([
                value_u64(frame, "frameIndex").unwrap_or(index as u64) as u32,
                value_u64(frame, "durationMs")
                    .unwrap_or(frame_duration_ms as u64)
                    .max(16) as u32,
            ]);
        }
        rows.push([
            item_id,
            atlas_file,
            frame_start,
            (frames.len() as u32).saturating_sub(frame_start),
            frame_duration_ms,
        ]);
    }

    let mut string_offsets = Vec::<u32>::with_capacity(strings.len());
    let mut string_bytes = Vec::<u8>::new();
    for value in &strings {
        string_offsets.push(string_bytes.len() as u32);
        string_bytes.extend_from_slice(value.as_bytes());
        string_bytes.push(0);
    }

    let row_stride_u32 = 5u32;
    let frame_stride_u32 = 2u32;
    let mut payload = Vec::with_capacity(
        8 + 6 * 4
            + string_offsets.len() * 4
            + rows.len() * row_stride_u32 as usize * 4
            + frames.len() * frame_stride_u32 as usize * 4
            + string_bytes.len(),
    );
    payload.extend_from_slice(b"NEIANM1\0");
    push_u32(&mut payload, 1);
    push_u32(&mut payload, rows.len() as u32);
    push_u32(&mut payload, strings.len() as u32);
    push_u32(&mut payload, frames.len() as u32);
    push_u32(&mut payload, row_stride_u32);
    push_u32(&mut payload, frame_stride_u32);
    for offset in string_offsets {
        push_u32(&mut payload, offset);
    }
    for row in rows {
        for value in row {
            push_u32(&mut payload, value);
        }
    }
    for frame in frames {
        for value in frame {
            push_u32(&mut payload, value);
        }
    }
    payload.extend_from_slice(&string_bytes);
    Ok(payload)
}

fn build_compact_texture_payload_from_atlas_items(atlas_items: &[Value]) -> Result<Vec<u8>> {
    let mut strings = vec![String::new()];
    let mut string_refs = HashMap::new();
    string_refs.insert(String::new(), 0u32);
    let mut rows = Vec::<[u32; 10]>::new();
    let mut frames = Vec::<[u32; 5]>::new();

    let mut sorted_items = atlas_items.to_vec();
    sorted_items
        .sort_by(|left, right| value_string(left, "itemId").cmp(&value_string(right, "itemId")));

    for item in &sorted_items {
        let item_id =
            intern_compact_string(&mut strings, &mut string_refs, value_string(item, "itemId"));
        let static_atlas = item.get("staticAtlas").filter(|value| value.is_object());
        let animated_atlas = item.get("animatedAtlas").filter(|value| value.is_object());
        let static_file = intern_compact_string(
            &mut strings,
            &mut string_refs,
            normalize_runtime_atlas_file_path(optional_value_string(static_atlas, "atlasFile")),
        );
        let animated_file = intern_compact_string(
            &mut strings,
            &mut string_refs,
            normalize_runtime_atlas_file_path(optional_value_string(animated_atlas, "atlasFile")),
        );
        let frame_start = frames.len() as u32;
        let frame_duration_ms =
            optional_value_u64(animated_atlas, "frameDurationMs").unwrap_or(0) as u32;

        if let Some(animated_atlas) = animated_atlas {
            let frame_values = animated_atlas
                .get("frames")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default();
            let timeline = normalize_timeline(
                Some(animated_atlas),
                optional_value_u64(Some(animated_atlas), "frameDurationMs"),
            );
            let timeline_values = timeline.as_array().cloned().unwrap_or_default();
            for (index, frame) in frame_values.iter().enumerate() {
                let duration_ms = timeline_values
                    .get(index)
                    .and_then(|value| value_u64(value, "durationMs"))
                    .unwrap_or(frame_duration_ms as u64)
                    .max(16) as u32;
                frames.push([
                    value_u64(frame, "x").unwrap_or(0) as u32,
                    value_u64(frame, "y").unwrap_or(0) as u32,
                    value_u64(frame, "width").unwrap_or(0) as u32,
                    value_u64(frame, "height").unwrap_or(0) as u32,
                    duration_ms,
                ]);
            }
        }

        rows.push([
            item_id,
            static_file,
            optional_value_u64(static_atlas, "x").unwrap_or(0) as u32,
            optional_value_u64(static_atlas, "y").unwrap_or(0) as u32,
            optional_value_u64(static_atlas, "width").unwrap_or(0) as u32,
            optional_value_u64(static_atlas, "height").unwrap_or(0) as u32,
            animated_file,
            frame_start,
            (frames.len() as u32).saturating_sub(frame_start),
            frame_duration_ms,
        ]);
    }

    let mut string_offsets = Vec::<u32>::with_capacity(strings.len());
    let mut string_bytes = Vec::<u8>::new();
    for value in &strings {
        string_offsets.push(string_bytes.len() as u32);
        string_bytes.extend_from_slice(value.as_bytes());
        string_bytes.push(0);
    }

    let row_stride_u32 = 10u32;
    let frame_stride_u32 = 5u32;
    let mut payload = Vec::with_capacity(
        8 + 6 * 4
            + string_offsets.len() * 4
            + rows.len() * row_stride_u32 as usize * 4
            + frames.len() * frame_stride_u32 as usize * 4
            + string_bytes.len(),
    );
    payload.extend_from_slice(b"NEITEX1\0");
    push_u32(&mut payload, 1);
    push_u32(&mut payload, rows.len() as u32);
    push_u32(&mut payload, strings.len() as u32);
    push_u32(&mut payload, frames.len() as u32);
    push_u32(&mut payload, row_stride_u32);
    push_u32(&mut payload, frame_stride_u32);
    for offset in string_offsets {
        push_u32(&mut payload, offset);
    }
    for row in rows {
        for value in row {
            push_u32(&mut payload, value);
        }
    }
    for frame in frames {
        for value in frame {
            push_u32(&mut payload, value);
        }
    }
    payload.extend_from_slice(&string_bytes);
    Ok(payload)
}

fn compile_dist_texture_pack(
    input: &Path,
    output: &Path,
    strict: bool,
    debug_json: bool,
) -> Result<()> {
    let manifest = read_manifest(input)?;
    let texture_files = runtime_file_descriptors(
        input,
        &manifest,
        &[
            ("textureManifest", "textureManifest"),
            ("browserAtlasIndex", "browserAtlasIndex"),
            ("nativeRenderIndex", "nativeRenderIndex"),
            ("animationTable", "animationTable"),
            ("animationExpectationReport", "animationExpectationReport"),
        ],
    )?;
    if strict
        && !texture_files.iter().any(|value| {
            value
                .get("logicalName")
                .and_then(Value::as_str)
                .is_some_and(|value| value == "textureManifest")
        })
    {
        return Err(anyhow!(
            "texture compiler blocked: textureManifest is missing"
        ));
    }
    let texture_pack = json!({
        "schemaVersion": "neonei/rust-texture-pack/current",
        "sourceKind": "dist-data",
        "counts": { "files": texture_files.len() },
        "files": texture_files,
    });
    let animation_pack = json!({
        "schemaVersion": "neonei/rust-animation-pack/current",
        "sourceKind": "dist-data",
        "files": runtime_file_descriptors(
            input,
            &manifest,
            &[("animationTable", "animationTable"), ("animationExpectationReport", "animationExpectationReport")],
        )?,
    });

    let rust_dir = output.join("rust");
    fs::create_dir_all(&rust_dir)?;
    if debug_json {
        write_json_value(&rust_dir.join("texture-pack.json"), &texture_pack)?;
    }
    write_binary_pack(
        &rust_dir.join("textures.bin"),
        "neonei/texture-pack/current",
        &texture_pack,
    )?;
    write_binary_pack(
        &rust_dir.join("animations.bin"),
        "neonei/animation-pack/current",
        &animation_pack,
    )?;
    let atlas_meta_payload = build_compact_atlas_meta_payload_from_atlas_items(&[])?;
    write_binary_pack_payload(
        &rust_dir.join("atlas.meta.bin"),
        "neonei/atlas-meta-pack/current",
        &atlas_meta_payload,
    )?;
    Ok(())
}

fn compile_semantic_validation_report(input: &Path, output: &Path) -> Result<()> {
    let manifest = read_manifest(input)?;
    let export_report =
        read_manifest_json(input, &manifest, "exportReport")?.unwrap_or(Value::Null);
    let browser_contract =
        read_manifest_json(input, &manifest, "neiBrowserContract")?.unwrap_or(Value::Null);
    let family_audit =
        read_manifest_json(input, &manifest, "semanticFamilyAudit")?.unwrap_or(Value::Null);
    let nbt_distribution =
        read_manifest_json(input, &manifest, "semanticNbtKeyDistribution")?.unwrap_or(Value::Null);
    let identity_report =
        read_manifest_json(input, &manifest, "semanticIdentityNormalizationReport")?
            .unwrap_or(Value::Null);

    let export_counts = export_report
        .get("counts")
        .cloned()
        .unwrap_or_else(|| json!({}));
    let browser_status = browser_contract
        .get("status")
        .and_then(Value::as_str)
        .unwrap_or("missing");
    let representative_mismatches =
        value_u64(&browser_contract, "representativeMismatchCount").unwrap_or(0);
    let missing_representatives =
        value_u64(&browser_contract, "missingRepresentativeCount").unwrap_or(0);
    let fallback_groups = value_u64(&browser_contract, "fallbackGroupCount").unwrap_or(0);
    let native_groups = value_u64(&browser_contract, "nativeGroupCount").unwrap_or(0);
    let semantic_unclassified =
        value_u64(&export_counts, "semanticUnclassifiedTaggedItems").unwrap_or(0);
    let render_shader_missing =
        value_u64(&export_counts, "renderShaderItemsMissingCapture").unwrap_or(0);
    let render_texture_missing_timing =
        value_u64(&export_counts, "renderTextureSpritesMissingTiming").unwrap_or(0);

    let mut warnings = Vec::new();
    if browser_status != "ok" {
        warnings.push(json!({
            "code": "NEI_BROWSER_CONTRACT_NOT_OK",
            "status": browser_status,
        }));
    }
    if fallback_groups > 0 && native_groups == 0 {
        warnings.push(json!({
            "code": "NEI_GROUPS_FALLBACK_ONLY",
            "fallbackGroups": fallback_groups,
            "nativeGroups": native_groups,
            "message": "Raw export has collapsible group data, but no native group rows were identified.",
        }));
    }
    if semantic_unclassified > 0 {
        warnings.push(json!({
            "code": "SEMANTIC_TAGGED_ITEMS_UNCLASSIFIED",
            "count": semantic_unclassified,
        }));
    }
    if render_shader_missing > 0 {
        warnings.push(json!({
            "code": "RENDER_SHADER_CAPTURE_MISSING",
            "count": render_shader_missing,
            "samples": export_counts
                .get("renderShaderItemsMissingCaptureSamples")
                .cloned()
                .unwrap_or(Value::Null),
        }));
    }
    if render_texture_missing_timing > 0 {
        warnings.push(json!({
            "code": "RENDER_TEXTURE_TIMING_MISSING",
            "count": render_texture_missing_timing,
        }));
    }
    let blocking_count = representative_mismatches + missing_representatives;
    let status = if blocking_count > 0 {
        "blocked"
    } else if warnings.is_empty() {
        "ok"
    } else {
        "advisory"
    };

    let rust_dir = output.join("rust");
    fs::create_dir_all(&rust_dir)?;
    write_json_value(
        &rust_dir.join("semantic-validation-report.json"),
        &json!({
            "schemaVersion": "neonei/rust-semantic-validation-report/current",
            "generatedAt": "deterministic-rust-compiler",
            "status": status,
            "source": {
                "exportReport": manifest.files.get("exportReport").cloned().unwrap_or_default(),
                "neiBrowserContract": manifest.files.get("neiBrowserContract").cloned().unwrap_or_default(),
                "semanticFamilyAudit": manifest.files.get("semanticFamilyAudit").cloned().unwrap_or_default(),
                "semanticNbtKeyDistribution": manifest.files.get("semanticNbtKeyDistribution").cloned().unwrap_or_default(),
                "semanticIdentityNormalizationReport": manifest.files.get("semanticIdentityNormalizationReport").cloned().unwrap_or_default(),
            },
            "counts": {
                "items": value_u64(&export_counts, "items").unwrap_or(0),
                "recipes": value_u64(&export_counts, "recipes").unwrap_or(0),
                "semanticTotalItems": value_u64(&export_counts, "semanticTotalItems").unwrap_or(0),
                "semanticTaggedItems": value_u64(&export_counts, "semanticTaggedItems").unwrap_or(0),
                "semanticClassifiedTaggedItems": value_u64(&export_counts, "semanticClassifiedTaggedItems").unwrap_or(0),
                "semanticUnclassifiedTaggedItems": semantic_unclassified,
                "semanticEstimatedPublicItems": value_u64(&export_counts, "semanticEstimatedPublicItems").unwrap_or(0),
                "semanticFamilyCount": value_u64(&export_counts, "semanticFamilyCount").unwrap_or(0),
                "browserItemCount": value_u64(&browser_contract, "browserItemCount").unwrap_or(0),
                "defaultEntryCount": value_u64(&browser_contract, "defaultEntryCount").unwrap_or(0),
                "groupCount": value_u64(&browser_contract, "groupCount").unwrap_or(0),
                "nativeGroupCount": native_groups,
                "fallbackGroupCount": fallback_groups,
                "hiddenItemCount": value_u64(&browser_contract, "hiddenItemCount").unwrap_or(0),
                "representativeMismatchCount": representative_mismatches,
                "missingRepresentativeCount": missing_representatives,
                "renderShaderItemsMissingCapture": render_shader_missing,
                "renderTextureSpritesMissingTiming": render_texture_missing_timing,
            },
            "semanticReports": {
                "familyAuditStatus": family_audit.get("status").cloned().unwrap_or(Value::Null),
                "nbtKeyDistributionStatus": nbt_distribution.get("status").cloned().unwrap_or(Value::Null),
                "identityNormalizationStatus": identity_report.get("status").cloned().unwrap_or(Value::Null),
            },
            "warnings": warnings,
            "blocking": {
                "representativeMismatchCount": representative_mismatches,
                "missingRepresentativeCount": missing_representatives,
            },
        }),
    )
}

fn compile_runtime_reports(
    output: &Path,
    scope: CompileScope,
    strict: bool,
    debug_json: bool,
) -> Result<()> {
    let rust_dir = output.join("rust");
    fs::create_dir_all(&rust_dir)?;
    compile_native_ui_layout_report(output)?;

    let mut artifact_names = match scope {
        CompileScope::All => vec![
            "browser.bin",
            "groups.bin",
            "search.bin",
            "recipes.bin",
            "textures.bin",
            "atlas.meta.bin",
            "animations.bin",
            "strings.zh_cn.bin",
            "missing-texture-report.json",
            "suspicious-texture-report.json",
            "semantic-validation-report.json",
            "recipe-handler-metadata-report.json",
            "recipe-fragmentation-report.json",
            "native-ui-layout-report.json",
            "ui-pack/ui_templates.bin",
            "ui-pack/ui_bindings.bin",
            "ui-pack/ui_strings.bin",
            "ui-pack/ui_assets.manifest.json",
            "ui-pack/ui_pack_report.json",
        ],
        CompileScope::Search => vec![
            "search.bin",
            "strings.zh_cn.bin",
            "semantic-validation-report.json",
        ],
        CompileScope::Browser => vec![
            "browser.bin",
            "groups.bin",
            "search.bin",
            "strings.zh_cn.bin",
            "semantic-validation-report.json",
        ],
        CompileScope::Recipes => vec![
            "recipes.bin",
            "semantic-validation-report.json",
            "recipe-handler-metadata-report.json",
            "recipe-fragmentation-report.json",
            "native-ui-layout-report.json",
        ],
        CompileScope::Ui => vec![
            "semantic-validation-report.json",
            "ui-pack/ui_templates.bin",
            "ui-pack/ui_bindings.bin",
            "ui-pack/ui_strings.bin",
            "ui-pack/ui_assets.manifest.json",
            "ui-pack/ui_pack_report.json",
        ],
        CompileScope::Textures => vec![
            "textures.bin",
            "atlas.meta.bin",
            "animations.bin",
            "missing-texture-report.json",
            "suspicious-texture-report.json",
            "semantic-validation-report.json",
        ],
    };
    if debug_json {
        match scope {
            CompileScope::All => artifact_names.extend([
                "browser-pack.json",
                "search-pack.json",
                "recipe-pack.json",
                "texture-pack.json",
            ]),
            CompileScope::Search => artifact_names.push("search-pack.json"),
            CompileScope::Browser => {
                artifact_names.extend(["browser-pack.json", "search-pack.json"])
            }
            CompileScope::Recipes => artifact_names.push("recipe-pack.json"),
            CompileScope::Ui => {}
            CompileScope::Textures => artifact_names.push("texture-pack.json"),
        }
    }
    if !matches!(scope, CompileScope::All) {
        for artifact_name in [
            "browser.bin",
            "groups.bin",
            "search.bin",
            "recipes.bin",
            "textures.bin",
            "atlas.meta.bin",
            "animations.bin",
            "strings.zh_cn.bin",
            "ui-pack/ui_templates.bin",
            "ui-pack/ui_bindings.bin",
            "ui-pack/ui_strings.bin",
            "native-ui-layout-report.json",
        ] {
            if !artifact_names.contains(&artifact_name) && rust_dir.join(artifact_name).exists() {
                artifact_names.push(artifact_name);
            }
        }
    }
    let mut files = Vec::new();
    let mut integrity = BTreeMap::new();
    let mut sizes = BTreeMap::new();
    let mut missing = Vec::new();
    let mut path_violations = Vec::new();

    for artifact_name in artifact_names {
        let path = rust_dir.join(artifact_name);
        let relative = format!("rust/{artifact_name}");
        if !path.exists() {
            missing.push(relative.clone());
            continue;
        }
        let hash = sha256_file(&path)?;
        let size = path.metadata()?.len();
        integrity.insert(relative.clone(), hash);
        sizes.insert(relative.clone(), size);
        files.push(json!({
            "path": relative,
            "bytes": size,
        }));
    }

    let should_hash_texture_assets = matches!(scope, CompileScope::All | CompileScope::Textures);
    let texture_asset_dir = output.join("textures");
    if should_hash_texture_assets && texture_asset_dir.exists() {
        for entry in walkdir::WalkDir::new(&texture_asset_dir)
            .into_iter()
            .filter_map(Result::ok)
            .filter(|entry| entry.file_type().is_file())
        {
            let path = entry.path();
            let relative_path = path
                .strip_prefix(output)
                .unwrap_or(path)
                .to_string_lossy()
                .replace('\\', "/");
            let hash = sha256_file(path)?;
            let size = path.metadata()?.len();
            integrity.insert(relative_path.clone(), hash);
            sizes.insert(relative_path.clone(), size);
            files.push(json!({
                "path": relative_path,
                "bytes": size,
            }));
        }
    }

    for entry in walkdir::WalkDir::new(&rust_dir)
        .into_iter()
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().is_file())
        .filter(|entry| is_text_runtime_artifact(entry.path()))
    {
        let path = entry.path();
        let text = fs::read_to_string(path).unwrap_or_default();
        for needle in ["E:\\", "C:\\", "\\\\", "file://"] {
            if text.contains(needle) {
                path_violations.push(format!("{} contains {}", normalize_path(path), needle));
            }
        }
    }

    if strict && (!missing.is_empty() || !path_violations.is_empty()) {
        return Err(anyhow!(
            "runtime report blocked: missing={}, path violations={}",
            missing.len(),
            path_violations.len()
        ));
    }

    let total_bytes = sizes.values().sum::<u64>();
    let runtime_id = runtime_id_from_integrity(&integrity);
    let generated_at = "deterministic-rust-compiler";
    let capabilities = rust_capabilities(scope);
    write_json_value(
        &rust_dir.join("runtime-manifest.json"),
        &json!({
            "schema": "neonei/runtime/current",
            "schemaVersion": "neonei/rust-runtime-manifest/current",
            "schemaRevision": 1,
            "runtimeId": runtime_id,
            "generatedAt": generated_at,
            "capabilities": capabilities,
            "files": files,
            "compileScope": scope.as_str(),
            "entrypoints": rust_entrypoints_from_integrity(&integrity),
            "pathPolicy": {
                "portableRelativePathsOnly": true,
                "absolutePathsAllowed": false,
                "windowsPathsAllowed": false,
            },
        }),
    )?;
    write_json_value(
        &rust_dir.join("integrity.json"),
        &json!({
            "schemaVersion": "neonei/rust-integrity/current",
            "algorithm": "sha256",
            "files": integrity,
        }),
    )?;
    write_json_value(
        &rust_dir.join("size-report.json"),
        &json!({
            "schemaVersion": "neonei/rust-size-report/current",
            "totalBytes": total_bytes,
            "files": sizes,
        }),
    )?;
    write_json_value(
        &rust_dir.join("missing-data-report.json"),
        &json!({
            "schemaVersion": "neonei/rust-missing-data-report/current",
            "missingFiles": missing,
        }),
    )?;
    write_json_value(
        &rust_dir.join("migration-readiness.json"),
        &json!({
            "schemaVersion": "neonei/rust-migration-readiness/current",
            "ready": missing.is_empty() && path_violations.is_empty(),
            "checks": {
                "requiredArtifactsPresent": missing.is_empty(),
                "pathPortable": path_violations.is_empty(),
                "integrityHashesGenerated": true,
                "sizeReportGenerated": true,
            },
            "pathViolations": path_violations,
        }),
    )?;
    write_json_value(
        &rust_dir.join("deployment-report.json"),
        &json!({
            "schemaVersion": "neonei/rust-deployment-report/current",
            "runtimeId": runtime_id,
            "generatedAt": generated_at,
            "compileScope": scope.as_str(),
            "runtimeSize": {
                "totalBytes": total_bytes,
                "files": sizes,
            },
            "cache": {
                "immutableRuntimeFiles": integrity.len(),
                "estimatedRuntimeCacheBytes": total_bytes,
                "cacheKeyInputs": {
                    "runtimeId": runtime_id,
                    "integrityAlgorithm": "sha256",
                },
            },
            "missingData": {
                "missingFiles": missing,
                "missingFileCount": missing.len(),
            },
            "schema": {
                "runtime": "neonei/runtime/current",
                "schemaRevision": 1,
                "capabilities": capabilities,
            },
            "deploymentChecks": {
                "requiredArtifactsPresent": missing.is_empty(),
                "pathPortable": path_violations.is_empty(),
                "integrityHashesGenerated": true,
                "sizeReportGenerated": true,
                "capabilitiesGenerated": true,
            },
            "pathViolations": path_violations,
        }),
    )?;
    update_dist_manifest_with_rust_runtime(
        output,
        scope,
        debug_json,
        &integrity,
        &sizes,
        &runtime_id,
        total_bytes,
    )?;
    Ok(())
}

fn compile_native_ui_layout_report(output: &Path) -> Result<Option<Value>> {
    let handler_layout_path = output.join("recipes").join("handler-layout-index.json");
    if !handler_layout_path.exists() {
        return Ok(None);
    }
    let ui_payload_path = output.join("recipes").join("ui-payload-index.json");
    let handler_layout_index = read_json_file(&handler_layout_path)?;
    let ui_payload_index = if ui_payload_path.exists() {
        read_json_file(&ui_payload_path)?
    } else {
        json!({ "recipes": [] })
    };
    let layouts = json_array(&handler_layout_index, "layouts");
    let recipes = json_array(&ui_payload_index, "recipes");
    let gt_layouts = layouts
        .iter()
        .filter(|layout| is_gregtech_native_layout(layout))
        .collect::<Vec<_>>();
    let gt_recipe_entries = recipes
        .iter()
        .filter(|entry| is_gregtech_recipe_ui_entry(entry))
        .collect::<Vec<_>>();

    let mut failures = Vec::new();
    if layouts.is_empty() {
        failures.push("handler layout index is empty".to_string());
    }
    if !gt_layouts.is_empty()
        && gt_layouts
            .iter()
            .filter(|layout| primitive_count(layout, "progressBars") > 0)
            .count()
            == 0
    {
        failures.push("gregtech-machine handler layouts have no drawable progressBars".to_string());
    }
    if !gt_recipe_entries.is_empty()
        && gt_recipe_entries
            .iter()
            .filter(|entry| {
                primitive_count(
                    entry.get("nativeLayout").unwrap_or(&Value::Null),
                    "progressBars",
                ) > 0
            })
            .count()
            == 0
    {
        failures
            .push("gregtech-machine recipe UI payloads have no drawable progressBars".to_string());
    }
    if !gt_recipe_entries.is_empty()
        && gt_recipe_entries
            .iter()
            .filter(|entry| has_image_region(entry.get("nativeLayout").unwrap_or(&Value::Null)))
            .count()
            == 0
    {
        failures.push(
            "gregtech-machine recipe UI payloads have no captured background imageRegion"
                .to_string(),
        );
    }

    let report = json!({
        "schemaVersion": "neonei/native-ui-layout-report/current",
        "generatedAt": "deterministic-rust-compiler",
        "status": if failures.is_empty() { "ready" } else { "blocked" },
        "source": {
            "handlerLayoutIndex": "recipes/handler-layout-index.json",
            "recipeUiPayloadIndex": if ui_payload_path.exists() { "recipes/ui-payload-index.json" } else { "" },
        },
        "counts": {
            "handlerLayouts": layouts.len(),
            "handlerLayoutsWithBackgroundRegions": layouts.iter().filter(|layout| has_image_region(layout)).count(),
            "handlerLayoutsWithProgressBars": layouts.iter().filter(|layout| primitive_count(layout, "progressBars") > 0).count(),
            "handlerLayoutsWithFluidBars": layouts.iter().filter(|layout| primitive_count(layout, "fluidBars") > 0).count(),
            "handlerLayoutsWithEnergyBars": layouts.iter().filter(|layout| primitive_count(layout, "energyBars") > 0).count(),
            "handlerLayoutsWithHotspots": layouts.iter().filter(|layout| primitive_count(layout, "hotspots") > 0).count(),
            "handlerLayoutsWithViewports": layouts.iter().filter(|layout| primitive_count(layout, "viewports") > 0).count(),
            "gregtechHandlerLayouts": gt_layouts.len(),
            "gregtechHandlerLayoutsWithBackgroundRegions": gt_layouts.iter().filter(|layout| has_image_region(layout)).count(),
            "gregtechHandlerLayoutsWithProgressBars": gt_layouts.iter().filter(|layout| primitive_count(layout, "progressBars") > 0).count(),
            "recipeUiPayloads": recipes.len(),
            "gregtechRecipeUiPayloads": gt_recipe_entries.len(),
            "gregtechRecipeUiPayloadsWithBackgroundRegions": gt_recipe_entries.iter().filter(|entry| has_image_region(entry.get("nativeLayout").unwrap_or(&Value::Null))).count(),
            "gregtechRecipeUiPayloadsWithProgressBars": gt_recipe_entries.iter().filter(|entry| primitive_count(entry.get("nativeLayout").unwrap_or(&Value::Null), "progressBars") > 0).count(),
            "gregtechRecipeUiPayloadsWithHotspots": gt_recipe_entries.iter().filter(|entry| primitive_count(entry.get("nativeLayout").unwrap_or(&Value::Null), "hotspots") > 0).count(),
            "gregtechRecipeUiPayloadsWithViewports": gt_recipe_entries.iter().filter(|entry| primitive_count(entry.get("nativeLayout").unwrap_or(&Value::Null), "viewports") > 0).count(),
        },
        "samples": {
            "gregtechHandlerLayoutsMissingProgressBars": gt_layouts.iter()
                .filter(|layout| primitive_count(layout, "progressBars") == 0)
                .take(25)
                .map(|layout| json!({
                    "handlerKey": value_string(layout, "handlerKey"),
                    "handlerClass": value_string(layout, "handlerClass"),
                    "layoutKind": value_string(layout, "layoutKind"),
                }))
                .collect::<Vec<_>>(),
            "gregtechRecipePayloadsMissingProgressBars": gt_recipe_entries.iter()
                .filter(|entry| primitive_count(entry.get("nativeLayout").unwrap_or(&Value::Null), "progressBars") == 0)
                .take(25)
                .map(|entry| json!({
                    "recipeId": value_string(entry, "recipeId"),
                    "familyKey": value_string(entry, "familyKey"),
                    "handlerKey": value_string(entry, "handlerKey"),
                }))
                .collect::<Vec<_>>(),
        },
        "failures": failures,
    });
    let rust_dir = output.join("rust");
    fs::create_dir_all(&rust_dir)?;
    write_json_value(&rust_dir.join("native-ui-layout-report.json"), &report)?;
    Ok(Some(report))
}

fn read_json_file(path: &Path) -> Result<Value> {
    let text = fs::read_to_string(path).with_context(|| format!("read {}", path.display()))?;
    serde_json::from_str(&text).with_context(|| format!("parse {}", path.display()))
}

fn json_array(value: &Value, key: &str) -> Vec<Value> {
    value
        .get(key)
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
}

fn is_gregtech_native_layout(layout: &Value) -> bool {
    value_string(layout, "canonicalMachineFamily")
        .map(|value| value.trim().eq_ignore_ascii_case("gregtech-machine"))
        .unwrap_or(false)
}

fn is_gregtech_recipe_ui_entry(entry: &Value) -> bool {
    entry
        .get("nativeLayout")
        .is_some_and(is_gregtech_native_layout)
        || value_string(entry, "familyKey")
            .map(|value| value.starts_with("gregtech-machine|"))
            .unwrap_or(false)
}

fn primitive_count(layout: &Value, key: &str) -> usize {
    layout
        .get(key)
        .and_then(Value::as_array)
        .map(|items| items.iter().filter(|item| has_drawable_rect(item)).count())
        .unwrap_or(0)
}

fn has_drawable_rect(value: &Value) -> bool {
    let width = value_u64(value, "width").unwrap_or(0);
    let height = value_u64(value, "height").unwrap_or(0);
    width > 0 && height > 0
}

fn has_image_region(value: &Value) -> bool {
    value.get("imageRegion").is_some_and(has_drawable_rect)
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

fn is_text_runtime_artifact(path: &Path) -> bool {
    path.extension()
        .and_then(|value| value.to_str())
        .is_some_and(|extension| matches!(extension, "json" | "txt" | "log"))
}

fn update_dist_manifest_with_rust_runtime(
    output: &Path,
    scope: CompileScope,
    debug_json: bool,
    integrity: &BTreeMap<String, String>,
    sizes: &BTreeMap<String, u64>,
    runtime_id: &str,
    total_bytes: u64,
) -> Result<()> {
    let manifest_path = output.join("manifest.json");
    let mut manifest = if manifest_path.exists() {
        let text = fs::read_to_string(&manifest_path)
            .with_context(|| format!("read dist manifest {}", manifest_path.display()))?;
        serde_json::from_str::<Value>(&text)
            .with_context(|| format!("parse dist manifest {}", manifest_path.display()))?
    } else {
        json!({
            "schemaVersion": "neonei/dist-data/current",
            "source": "rust-compiler",
            "files": {},
        })
    };

    if !manifest.is_object() {
        return Err(anyhow!(
            "dist manifest must be a JSON object: {}",
            manifest_path.display()
        ));
    }
    if manifest.get("files").and_then(Value::as_object).is_none() {
        manifest["files"] = json!({});
    }
    let files = manifest["files"]
        .as_object_mut()
        .ok_or_else(|| anyhow!("dist manifest files must be a JSON object"))?;

    if !debug_json {
        for key in [
            "rustBrowserPack",
            "rustSearchPack",
            "rustRecipePack",
            "rustTexturePack",
        ] {
            files.remove(key);
        }
    }

    for (key, relative_path) in rust_manifest_file_entries(scope, debug_json) {
        if integrity.contains_key(relative_path) || relative_path.ends_with("runtime-manifest.json")
        {
            files.insert(key.to_string(), Value::String(relative_path.to_string()));
        }
    }

    manifest["nativeRuntime"] = json!({
        "schemaVersion": "neonei/native-runtime-dist/current",
        "runtimeId": runtime_id,
        "compileScope": scope.as_str(),
        "status": "ready",
        "authority": "rust",
        "runtimeManifest": "rust/runtime-manifest.json",
        "totalBytes": total_bytes,
        "files": sizes,
        "hashes": integrity,
        "pathPolicy": {
            "portableRelativePathsOnly": true,
            "absolutePathsAllowed": false,
        },
    });

    write_json_value(&manifest_path, &manifest)
}

fn rust_manifest_file_entries(
    scope: CompileScope,
    debug_json: bool,
) -> Vec<(&'static str, &'static str)> {
    let mut entries = vec![
        ("rustRuntimeManifest", "rust/runtime-manifest.json"),
        ("rustIntegrity", "rust/integrity.json"),
        ("rustSizeReport", "rust/size-report.json"),
        ("rustMissingDataReport", "rust/missing-data-report.json"),
        (
            "rustSemanticValidationReport",
            "rust/semantic-validation-report.json",
        ),
        (
            "rustMissingTextureReport",
            "rust/missing-texture-report.json",
        ),
        (
            "rustSuspiciousTextureReport",
            "rust/suspicious-texture-report.json",
        ),
        (
            "rustRecipeHandlerMetadataReport",
            "rust/recipe-handler-metadata-report.json",
        ),
        (
            "rustRecipeFragmentationReport",
            "rust/recipe-fragmentation-report.json",
        ),
        (
            "rustNativeUiLayoutReport",
            "rust/native-ui-layout-report.json",
        ),
        ("rustMigrationReadiness", "rust/migration-readiness.json"),
        ("rustDeploymentReport", "rust/deployment-report.json"),
    ];
    match scope {
        CompileScope::All => entries.extend([
            ("rustBrowserBin", "rust/browser.bin"),
            ("rustGroupsBin", "rust/groups.bin"),
            ("rustSearchBin", "rust/search.bin"),
            ("rustRecipeBin", "rust/recipes.bin"),
            ("rustTextureBin", "rust/textures.bin"),
            ("rustAtlasMetaBin", "rust/atlas.meta.bin"),
            ("rustAnimationBin", "rust/animations.bin"),
            ("rustStringsZhCnBin", "rust/strings.zh_cn.bin"),
            ("rustUiTemplatesBin", "rust/ui-pack/ui_templates.bin"),
            ("rustUiBindingsBin", "rust/ui-pack/ui_bindings.bin"),
            ("rustUiStringsBin", "rust/ui-pack/ui_strings.bin"),
            (
                "rustUiAssetsManifest",
                "rust/ui-pack/ui_assets.manifest.json",
            ),
            ("rustUiPackReport", "rust/ui-pack/ui_pack_report.json"),
        ]),
        CompileScope::Search => entries.extend([
            ("rustSearchBin", "rust/search.bin"),
            ("rustStringsZhCnBin", "rust/strings.zh_cn.bin"),
        ]),
        CompileScope::Browser => entries.extend([
            ("rustBrowserBin", "rust/browser.bin"),
            ("rustGroupsBin", "rust/groups.bin"),
            ("rustSearchBin", "rust/search.bin"),
            ("rustStringsZhCnBin", "rust/strings.zh_cn.bin"),
        ]),
        CompileScope::Recipes => entries.extend([("rustRecipeBin", "rust/recipes.bin")]),
        CompileScope::Ui => entries.extend([
            ("rustUiTemplatesBin", "rust/ui-pack/ui_templates.bin"),
            ("rustUiBindingsBin", "rust/ui-pack/ui_bindings.bin"),
            ("rustUiStringsBin", "rust/ui-pack/ui_strings.bin"),
            (
                "rustUiAssetsManifest",
                "rust/ui-pack/ui_assets.manifest.json",
            ),
            ("rustUiPackReport", "rust/ui-pack/ui_pack_report.json"),
        ]),
        CompileScope::Textures => entries.extend([
            ("rustTextureBin", "rust/textures.bin"),
            ("rustAtlasMetaBin", "rust/atlas.meta.bin"),
            ("rustAnimationBin", "rust/animations.bin"),
        ]),
    }
    if debug_json {
        match scope {
            CompileScope::All => entries.extend([
                ("rustBrowserPack", "rust/browser-pack.json"),
                ("rustSearchPack", "rust/search-pack.json"),
                ("rustRecipePack", "rust/recipe-pack.json"),
                ("rustTexturePack", "rust/texture-pack.json"),
            ]),
            CompileScope::Search => entries.push(("rustSearchPack", "rust/search-pack.json")),
            CompileScope::Browser => entries.extend([
                ("rustBrowserPack", "rust/browser-pack.json"),
                ("rustSearchPack", "rust/search-pack.json"),
            ]),
            CompileScope::Recipes => entries.push(("rustRecipePack", "rust/recipe-pack.json")),
            CompileScope::Ui => {
                entries.push(("rustUiPackReport", "rust/ui-pack/ui_pack_report.json"))
            }
            CompileScope::Textures => entries.push(("rustTexturePack", "rust/texture-pack.json")),
        }
    }
    entries
}

fn runtime_id_from_integrity(integrity: &BTreeMap<String, String>) -> String {
    let mut hasher = Sha256::new();
    for (path, hash) in integrity {
        hasher.update(path.as_bytes());
        hasher.update(b"\0");
        hasher.update(hash.as_bytes());
        hasher.update(b"\n");
    }
    let digest = format!("{:x}", hasher.finalize());
    format!("rust-{}", &digest[..16])
}

impl CompileScope {
    fn as_str(self) -> &'static str {
        match self {
            CompileScope::All => "all",
            CompileScope::Search => "search",
            CompileScope::Browser => "browser",
            CompileScope::Recipes => "recipes",
            CompileScope::Ui => "ui",
            CompileScope::Textures => "textures",
        }
    }
}

fn rust_entrypoints_from_integrity(integrity: &BTreeMap<String, String>) -> Value {
    let mut entrypoints = serde_json::Map::new();
    for (key, path) in [
        ("browser", "rust/browser.bin"),
        ("groups", "rust/groups.bin"),
        ("search", "rust/search.bin"),
        ("recipes", "rust/recipes.bin"),
        ("textures", "rust/textures.bin"),
        ("atlasMeta", "rust/atlas.meta.bin"),
        ("animations", "rust/animations.bin"),
        ("stringsZhCn", "rust/strings.zh_cn.bin"),
        ("uiTemplates", "rust/ui-pack/ui_templates.bin"),
        ("uiBindings", "rust/ui-pack/ui_bindings.bin"),
        ("uiStrings", "rust/ui-pack/ui_strings.bin"),
    ] {
        if integrity.contains_key(path) {
            entrypoints.insert(key.to_string(), Value::String(path.to_string()));
        }
    }
    Value::Object(entrypoints)
}

fn validate_atlas_ref(item_id: &str, atlas: Option<&Value>, missing_refs: &mut Vec<String>) {
    let Some(atlas) = atlas else {
        missing_refs.push(format!("{item_id}:missing-atlas-object"));
        return;
    };
    if atlas
        .get("atlasFile")
        .and_then(Value::as_str)
        .map(str::trim)
        .unwrap_or_default()
        .is_empty()
    {
        missing_refs.push(format!("{item_id}:missing-atlas-file"));
    }
}

fn validate_atlas_bounds(
    item_id: &str,
    atlas_kind: &str,
    atlas: Option<&Value>,
    invalid_bounds: &mut Vec<String>,
) {
    let Some(atlas) = atlas else {
        return;
    };
    let has_rect = ["x", "y", "width", "height"]
        .iter()
        .any(|key| atlas.get(*key).is_some());
    if !has_rect && atlas_kind == "animated" {
        return;
    }
    let atlas_width = value_u64(atlas, "atlasWidth").unwrap_or(0);
    let atlas_height = value_u64(atlas, "atlasHeight").unwrap_or(0);
    let x = value_u64(atlas, "x").unwrap_or(0);
    let y = value_u64(atlas, "y").unwrap_or(0);
    let width = value_u64(atlas, "width").unwrap_or(0);
    let height = value_u64(atlas, "height").unwrap_or(0);
    if width == 0
        || height == 0
        || (atlas_width > 0 && x.saturating_add(width) > atlas_width)
        || (atlas_height > 0 && y.saturating_add(height) > atlas_height)
    {
        invalid_bounds.push(format!("{item_id}:{atlas_kind}:out-of-bounds"));
    }
}

fn validate_frame_bounds(item_id: &str, atlas: Option<&Value>, invalid_bounds: &mut Vec<String>) {
    let Some(atlas) = atlas else {
        return;
    };
    let atlas_width = value_u64(atlas, "atlasWidth").unwrap_or(0);
    let atlas_height = value_u64(atlas, "atlasHeight").unwrap_or(0);
    let Some(frames) = atlas.get("frames").and_then(Value::as_array) else {
        return;
    };
    for (index, frame) in frames.iter().enumerate() {
        let bounds = if let Some(values) = frame.as_array() {
            if values.len() < 5 {
                invalid_bounds.push(format!("{item_id}:frame-{index}:short"));
                continue;
            }
            Some((
                values.get(1).and_then(numeric_value_u64).unwrap_or(0),
                values.get(2).and_then(numeric_value_u64).unwrap_or(0),
                values.get(3).and_then(numeric_value_u64).unwrap_or(0),
                values.get(4).and_then(numeric_value_u64).unwrap_or(0),
            ))
        } else if frame.is_object() {
            Some((
                value_u64(frame, "x").unwrap_or(0),
                value_u64(frame, "y").unwrap_or(0),
                value_u64(frame, "width").unwrap_or(0),
                value_u64(frame, "height").unwrap_or(0),
            ))
        } else {
            invalid_bounds.push(format!("{item_id}:frame-{index}:unsupported-shape"));
            None
        };
        let Some((x, y, width, height)) = bounds else {
            continue;
        };
        if width == 0
            || height == 0
            || (atlas_width > 0 && x + width > atlas_width)
            || (atlas_height > 0 && y + height > atlas_height)
        {
            invalid_bounds.push(format!("{item_id}:frame-{index}:out-of-bounds"));
        }
    }
}

fn normalize_timeline_frame_index(frame_index: u64, frame_count: u64) -> u64 {
    if frame_count > 0 && frame_index >= frame_count {
        return frame_index % frame_count;
    }
    frame_index
}

fn normalize_timeline(animated_atlas: Option<&Value>, fallback_duration_ms: Option<u64>) -> Value {
    let Some(animated_atlas) = animated_atlas else {
        return Value::Array(Vec::new());
    };
    let normalized_frame_count = animated_atlas
        .get("frames")
        .and_then(Value::as_array)
        .map(|frames| frames.len() as u64)
        .filter(|count| *count > 0)
        .or_else(|| animated_atlas.get("frameCount").and_then(numeric_value_u64))
        .unwrap_or(0);
    if let Some(timeline) = animated_atlas.get("timeline").and_then(Value::as_array) {
        return Value::Array(
            timeline
                .iter()
                .enumerate()
                .map(|(index, value)| {
                    if let Some(pair) = value.as_array() {
                        let frame_index = pair
                            .first()
                            .and_then(numeric_value_u64)
                            .unwrap_or(index as u64);
                        json!({
                            "frameIndex": normalize_timeline_frame_index(frame_index, normalized_frame_count),
                            "durationMs": pair.get(1).and_then(numeric_value_u64).or(fallback_duration_ms),
                        })
                    } else {
                        let frame_index = value
                            .get("frameIndex")
                            .or_else(|| value.get("index"))
                            .and_then(numeric_value_u64)
                            .unwrap_or(index as u64);
                        let duration_ms = value
                            .get("durationMs")
                            .and_then(numeric_value_u64)
                            .or(fallback_duration_ms);
                        json!({
                            "frameIndex": normalize_timeline_frame_index(frame_index, normalized_frame_count),
                            "durationMs": duration_ms,
                        })
                    }
                })
                .collect(),
        );
    }
    let frame_count = normalized_frame_count;
    Value::Array(
        (0..frame_count)
            .map(|frame_index| {
                json!({
                    "frameIndex": frame_index,
                    "durationMs": fallback_duration_ms,
                })
            })
            .collect(),
    )
}

fn read_manifest_json(
    input: &Path,
    manifest: &RawManifest,
    logical_name: &str,
) -> Result<Option<Value>> {
    let Some(path) = resolve_manifest_path(input, manifest, logical_name) else {
        return Ok(None);
    };
    let text = fs::read_to_string(&path).with_context(|| format!("read {}", path.display()))?;
    let value = serde_json::from_str(&text).with_context(|| format!("parse {}", path.display()))?;
    Ok(Some(value))
}

fn read_jsonl_values(
    input: &Path,
    manifest: &RawManifest,
    logical_name: &str,
) -> Result<Vec<Value>> {
    let Some(path) = resolve_manifest_path(input, manifest, logical_name) else {
        return Ok(Vec::new());
    };
    read_jsonl_file_values(&path)
}

fn rust_capabilities(scope: CompileScope) -> Value {
    match scope {
        CompileScope::All => json!([
            "atlas.static",
            "atlas.animated",
            "atlas.meta",
            "groups.collapse",
            "groups.semantic-nbt",
            "recipes.lookup",
            "recipes.native-ui-layout",
            "search.zh-cn",
            "strings.zh-cn",
            "native-render.webgl2",
            "recipes.ui-pack",
        ]),
        CompileScope::Search => json!(["search.zh-cn", "strings.zh-cn"]),
        CompileScope::Browser => json!([
            "groups.collapse",
            "groups.semantic-nbt",
            "search.zh-cn",
            "strings.zh-cn",
            "native-render.webgl2"
        ]),
        CompileScope::Recipes => json!(["recipes.lookup", "recipes.native-ui-layout"]),
        CompileScope::Ui => json!(["recipes.ui-pack", "native-render.webgl2"]),
        CompileScope::Textures => json!(["atlas.static", "atlas.animated", "atlas.meta"]),
    }
}

fn read_json_collection(
    input: &Path,
    manifest: &RawManifest,
    logical_names: &[&str],
    array_field: Option<&str>,
) -> Result<Vec<Value>> {
    for logical_name in logical_names {
        let Some(path) = resolve_manifest_path(input, manifest, logical_name) else {
            continue;
        };
        if path.extension().and_then(|value| value.to_str()) == Some("jsonl")
            || path.extension().and_then(|value| value.to_str()) == Some("gz")
        {
            return read_jsonl_file_values(&path);
        }
        let text = fs::read_to_string(&path).with_context(|| format!("read {}", path.display()))?;
        let value: Value =
            serde_json::from_str(&text).with_context(|| format!("parse {}", path.display()))?;
        if let Some(rows) = value.as_array() {
            return Ok(rows.clone());
        }
        if let Some(field) = array_field {
            if let Some(rows) = value.get(field).and_then(Value::as_array) {
                return Ok(rows.clone());
            }
        }
        if let Some(rows) = value.get("items").and_then(Value::as_array) {
            return Ok(rows.clone());
        }
        if let Some(rows) = value.get("groups").and_then(Value::as_array) {
            return Ok(rows.clone());
        }
        if let Some(rows) = value.get("animations").and_then(Value::as_array) {
            return Ok(rows.clone());
        }
        return Ok(vec![value]);
    }
    Ok(Vec::new())
}

fn runtime_file_descriptors(
    input: &Path,
    manifest: &RawManifest,
    logical_pairs: &[(&str, &str)],
) -> Result<Vec<Value>> {
    let mut files = Vec::new();
    for (public_name, manifest_key) in logical_pairs {
        let Some(path) = resolve_manifest_path(input, manifest, manifest_key) else {
            continue;
        };
        if !path.exists() {
            continue;
        }
        files.push(json!({
            "logicalName": public_name,
            "manifestKey": manifest_key,
            "path": normalize_path(path.strip_prefix(input).unwrap_or(path.as_path())),
            "bytes": path.metadata()?.len(),
            "sha256": sha256_file(&path)?,
        }));
    }
    Ok(files)
}

fn read_jsonl_file_values(path: &Path) -> Result<Vec<Value>> {
    let reader: Box<dyn Read> = if path.extension().and_then(|value| value.to_str()) == Some("gz") {
        Box::new(GzDecoder::new(File::open(&path)?))
    } else {
        Box::new(File::open(&path)?)
    };
    let buf = BufReader::new(reader);
    let mut rows = Vec::new();
    for (index, line) in buf.lines().enumerate() {
        let line = line?;
        if line.trim().is_empty() {
            continue;
        }
        rows.push(
            serde_json::from_str(&line)
                .with_context(|| format!("parse {} line {}", path.display(), index + 1))?,
        );
    }
    Ok(rows)
}

fn resolve_manifest_path(
    input: &Path,
    manifest: &RawManifest,
    logical_name: &str,
) -> Option<PathBuf> {
    let relative_path = manifest.files.get(logical_name)?;
    let normalized = relative_path
        .replace('\\', "/")
        .trim_start_matches('/')
        .to_string();
    Some(input.join(normalized))
}

fn value_string(value: &Value, key: &str) -> Option<String> {
    value.get(key)?.as_str().map(str::to_string)
}

fn value_u64(value: &Value, key: &str) -> Option<u64> {
    numeric_value_u64(value.get(key)?)
}

fn optional_value_string(value: Option<&Value>, key: &str) -> Option<String> {
    value?.get(key)?.as_str().map(str::to_string)
}

fn optional_value_u64(value: Option<&Value>, key: &str) -> Option<u64> {
    value_u64(value?, key)
}

fn numeric_value_u64(value: &Value) -> Option<u64> {
    match value {
        Value::Number(number) => number.as_u64(),
        Value::String(text) => text.trim().parse::<u64>().ok(),
        Value::Object(object) => object.get("value").and_then(numeric_value_u64),
        _ => None,
    }
}

fn numeric_value_u64_lossy(value: &Value) -> Option<u64> {
    match value {
        Value::Number(number) => number
            .as_u64()
            .or_else(|| number.as_f64().map(|value| value as u64)),
        Value::String(text) => text.trim().parse::<u64>().ok(),
        Value::Object(object) => object.get("value").and_then(numeric_value_u64_lossy),
        _ => None,
    }
}

fn normalize_text(value: &str) -> String {
    value
        .to_lowercase()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn normalize_search_terms<'a>(values: impl Iterator<Item = &'a str>) -> String {
    let mut terms = values
        .flat_map(|value| {
            normalize_text(value)
                .split(' ')
                .map(str::to_string)
                .collect::<Vec<_>>()
        })
        .filter(|value| !value.trim().is_empty())
        .collect::<Vec<_>>();
    terms.sort();
    terms.dedup();
    terms.join(" ")
}

fn build_pinyin_fields(localized_name: &str) -> (String, String) {
    let syllables = localized_name
        .chars()
        .filter_map(|character| {
            character
                .to_pinyin()
                .map(|pinyin| pinyin.plain().to_string())
        })
        .filter(|value| !value.trim().is_empty())
        .collect::<Vec<_>>();
    let full = syllables.join("");
    let acronym = syllables
        .iter()
        .filter_map(|part| part.chars().next())
        .collect::<String>();
    (full, acronym)
}

fn sha256_file(path: &Path) -> Result<String> {
    let mut file = File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 1024 * 128];
    loop {
        let read = file.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

fn summarize_runtime_output(output: Option<&Path>) -> Result<RuntimeSummary> {
    let mut counts = BTreeMap::new();
    let mut sizes = BTreeMap::new();
    let Some(output) = output else {
        return Ok(RuntimeSummary { counts, sizes });
    };

    let validation_report = output.join("validation").join("report.json");
    if validation_report.exists() {
        let text = fs::read_to_string(&validation_report).with_context(|| {
            format!(
                "read runtime validation report {}",
                validation_report.display()
            )
        })?;
        let value: Value = serde_json::from_str(&text).with_context(|| {
            format!(
                "parse runtime validation report {}",
                validation_report.display()
            )
        })?;
        if let Some(report_counts) = value.get("counts").and_then(Value::as_object) {
            for (key, value) in report_counts {
                if let Some(count) = value.as_u64() {
                    counts.insert(key.clone(), count);
                }
            }
        }
    }

    for (logical_name, relative_path) in [
        ("manifest", "manifest.json"),
        ("browserItemCatalog", "browser/item-catalog.json"),
        ("browserGroupIndex", "browser/group-index.json"),
        ("searchPack", "search/all.json"),
        ("recipeItemIndex", "recipes/item-index.json"),
        ("recipeHandlerIndex", "recipes/handler-index.json"),
        ("browserAtlasIndex", "textures/browser-atlas-index.json"),
        ("animationTable", "textures/animation-table.json"),
        ("uiTemplatesBin", "rust/ui-pack/ui_templates.bin"),
        ("uiBindingsBin", "rust/ui-pack/ui_bindings.bin"),
        ("uiStringsBin", "rust/ui-pack/ui_strings.bin"),
        ("uiAssetsManifest", "rust/ui-pack/ui_assets.manifest.json"),
        ("uiPackReport", "rust/ui-pack/ui_pack_report.json"),
        ("nativeUiLayoutReport", "rust/native-ui-layout-report.json"),
        ("runtimeValidationReport", "validation/report.json"),
    ] {
        let path = output.join(relative_path);
        if path.exists() {
            sizes.insert(logical_name.to_string(), path.metadata()?.len());
        }
    }

    Ok(RuntimeSummary { counts, sizes })
}

fn write_report(path: &Path, report: &CompilerReport) -> Result<()> {
    let text = serde_json::to_string_pretty(report)?;
    fs::write(path, text).with_context(|| format!("write report {}", path.display()))
}

fn write_binary_pack(path: &Path, schema: &str, value: &Value) -> Result<()> {
    let payload = serde_json::to_vec(value)?;
    write_binary_pack_payload(path, schema, &payload)
}

fn write_binary_pack_payload(path: &Path, schema: &str, payload: &[u8]) -> Result<()> {
    let schema_bytes = schema.as_bytes();
    let mut bytes = Vec::with_capacity(24 + schema_bytes.len() + payload.len());
    bytes.extend_from_slice(b"NNEIBIN\0");
    bytes.extend_from_slice(&1u32.to_le_bytes());
    bytes.extend_from_slice(&(schema_bytes.len() as u32).to_le_bytes());
    bytes.extend_from_slice(&(payload.len() as u64).to_le_bytes());
    bytes.extend_from_slice(schema_bytes);
    bytes.extend_from_slice(payload);
    fs::write(path, bytes).with_context(|| format!("write {}", path.display()))
}
fn write_json_value(path: &Path, value: &Value) -> Result<()> {
    let text = serde_json::to_string_pretty(value)?;
    fs::write(path, format!("{text}\n")).with_context(|| format!("write {}", path.display()))
}

fn normalize_path(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
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
        let summary = summarize_runtime_output(None).unwrap();
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
            "localizedName": "閾侀敪",
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
            "localizedName": "閾侀敪",
            "modId": "minecraft",
            "normalizedLocalizedName": "閾侀敪",
            "normalizedInternalName": "item ingotiron",
            "normalizedItemId": "minecraft iron_ingot",
            "normalizedSearchTerms": "iron ingot minecraft 閾侀敪",
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
    fn public_recipe_layout_preserves_native_background_and_dynamic_primitives() {
        let layout = json!({
            "handlerKey": "gt.recipe.assemblyline",
            "canonicalMachineFamily": "gregtech-machine",
            "layoutKind": "machine",
            "width": 176,
            "height": 90,
            "imageResource": "textures/gui/gt5u_assembly_line.png",
            "imageRegion": { "x": 4, "y": 8, "width": 176, "height": 90 },
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
        let diagnostics = zero_recipe_diagnostics_from_value(&value).unwrap();
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
                    "imageRegion": { "x": 0, "y": 0, "width": 176, "height": 90 },
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
                    "familyKey": "gregtech-machine|machine|176x90@0#1|textures/gui/test.png",
                    "nativeLayout": {
                        "canonicalMachineFamily": "gregtech-machine",
                        "imageRegion": { "x": 0, "y": 0, "width": 176, "height": 90 },
                        "progressBars": [{ "x": 78, "y": 24, "width": 20, "height": 18 }]
                    }
                }]
            }),
        )
        .unwrap();

        let report = compile_native_ui_layout_report(temp.path())
            .unwrap()
            .unwrap();

        assert_eq!(report["status"], json!("ready"));
        assert_eq!(report["counts"]["gregtechHandlerLayouts"], json!(1));
        assert_eq!(
            report["counts"]["gregtechRecipeUiPayloadsWithProgressBars"],
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
        let production_entries = rust_manifest_file_entries(CompileScope::All, false)
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

        let debug_entries = rust_manifest_file_entries(CompileScope::All, true)
            .into_iter()
            .map(|(_, path)| path)
            .collect::<Vec<_>>();
        assert!(debug_entries.contains(&"rust/browser-pack.json"));
        assert!(debug_entries.contains(&"rust/search-pack.json"));
        assert!(debug_entries.contains(&"rust/recipe-pack.json"));
        assert!(debug_entries.contains(&"rust/texture-pack.json"));
    }
}
