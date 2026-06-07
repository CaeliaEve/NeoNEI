use anyhow::{anyhow, Context, Result};
use clap::{Parser, Subcommand, ValueEnum};
use flate2::read::GzDecoder;
use pinyin::ToPinyin;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, HashMap};
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
    },
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, ValueEnum)]
enum CompileScope {
    All,
    Search,
    Browser,
    Recipes,
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
        } => {
            configure_threads(threads);
            fs::create_dir_all(&output)
                .with_context(|| format!("create output directory {}", output.display()))?;
            match scope {
                CompileScope::All => {
                    compile_browser_pack(&input, &output, strict)?;
                    compile_recipe_pack(&input, &output, strict)?;
                    compile_texture_pack(&input, &output, strict)?;
                }
                CompileScope::Search => compile_search_pack(&input, &output, strict)?,
                CompileScope::Browser => compile_browser_pack(&input, &output, strict)?,
                CompileScope::Recipes => compile_recipe_pack(&input, &output, strict)?,
                CompileScope::Textures => compile_texture_pack(&input, &output, strict)?,
            }
            compile_runtime_reports(&output, scope, strict)?;
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
    })
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

fn compile_browser_pack(input: &Path, output: &Path, strict: bool) -> Result<()> {
    let manifest = read_manifest(input)?;
    if manifest.files.contains_key("browserCatalog") {
        return compile_dist_browser_pack(input, output, strict);
    }
    let items = read_json_collection(input, &manifest, &["items", "browserCatalog"], Some("items"))?;
    let order_rows = read_json_collection(input, &manifest, &["neiOrder"], None)?;
    let group_rows = read_json_collection(input, &manifest, &["groups", "browserGroups"], Some("groups"))?;
    let texture_rows = read_json_collection(input, &manifest, &["textures"], Some("textures"))?;
    let atlas = read_manifest_json(input, &manifest, "browserAtlasIndex")?.unwrap_or(Value::Null);
    let atlas = repaired_browser_atlas(&atlas, &texture_rows);

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

    let mut group_by_member = BTreeMap::new();
    let groups = group_rows
        .iter()
        .map(|row| {
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

    let atlas_by_item = atlas
        .get("items")
        .and_then(Value::as_array)
        .map(|rows| {
            rows.iter()
                .filter_map(|row| Some((value_string(row, "itemId")?, row.clone())))
                .collect::<BTreeMap<_, _>>()
        })
        .unwrap_or_default();

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
    write_json_value(&rust_dir.join("browser-pack.json"), &pack)?;
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
    let group_pack = json!({
        "schemaVersion": "neonei/rust-group-pack/current",
        "counts": {
            "groups": groups.len(),
        },
        "groups": groups,
    });
    let string_pack = build_string_pack_from_items(&browser_items);
    write_json_value(&rust_dir.join("search-pack.json"), &search_pack)?;
    write_binary_pack(&rust_dir.join("search.bin"), "neonei/search-pack/current", &search_pack)?;
    write_binary_pack(&rust_dir.join("groups.bin"), "neonei/group-pack/current", &group_pack)?;
    write_binary_pack(&rust_dir.join("strings.zh_cn.bin"), "neonei/string-pack/current", &string_pack)?;
    Ok(())
}

fn compile_search_pack(input: &Path, output: &Path, strict: bool) -> Result<()> {
    let manifest = read_manifest(input)?;
    let items = read_json_collection(input, &manifest, &["items", "browserCatalog", "searchAll"], Some("items"))?;
    let group_rows = read_json_collection(input, &manifest, &["groups", "browserGroups"], Some("groups"))?;

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
    let browser_items = read_json_collection(input, &manifest, &["browserCatalog", "items"], Some("items"))?;
    let string_pack = build_string_pack_from_items(&browser_items);
    let search_pack = json!({
        "schemaVersion": "neonei/rust-search-pack/current",
        "counts": {
            "items": search_items.len(),
            "aliasItems": alias_items,
        },
        "items": search_items,
    });
    write_json_value(&rust_dir.join("search-pack.json"), &search_pack)?;
    write_binary_pack(&rust_dir.join("search.bin"), "neonei/search-pack/current", &search_pack)?;
    write_binary_pack(&rust_dir.join("strings.zh_cn.bin"), "neonei/string-pack/current", &string_pack)?;
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
        let item_id_ref = intern_compact_string(&mut strings, &mut string_refs, value_string(item, "itemId"));
        let localized_name_ref =
            intern_compact_string(&mut strings, &mut string_refs, value_string(item, "localizedName"));
        let mod_id_ref = intern_compact_string(&mut strings, &mut string_refs, value_string(item, "modId"));
        let group_key_ref = intern_compact_string(&mut strings, &mut string_refs, value_string(item, "groupKey"));
        let browser_order = value_u64(item, "browserOrder")
            .unwrap_or(index as u64)
            .min(u32::MAX as u64) as u32;
        let flags = if item.get("groupKey").and_then(Value::as_str).is_some_and(|value| !value.is_empty()) {
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
        8 + 4 * 4 + string_offsets.len() * 4 + rows.len() * row_stride_u32 as usize * 4 + string_bytes.len(),
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

fn build_string_pack_from_items(items: &[Value]) -> Value {
    let mut rows = items
        .iter()
        .map(|item| {
            json!({
                "itemId": value_string(item, "itemId").unwrap_or_default(),
                "localizedName": value_string(item, "localizedName").unwrap_or_default(),
                "modId": value_string(item, "modId").unwrap_or_default(),
                "internalName": value_string(item, "internalName").unwrap_or_default(),
                "groupKey": value_string(item, "groupKey").unwrap_or_default(),
                "groupLabel": value_string(item, "groupLabel").unwrap_or_default(),
            })
        })
        .collect::<Vec<_>>();
    rows.sort_by(|left, right| value_string(left, "itemId").cmp(&value_string(right, "itemId")));
    json!({
        "schemaVersion": "neonei/rust-string-pack/current",
        "locale": "zh_cn",
        "counts": {
            "items": rows.len(),
        },
        "items": rows,
    })
}

fn compile_dist_browser_pack(input: &Path, output: &Path, strict: bool) -> Result<()> {
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
    if strict && !browser_files.iter().any(|value| {
        value
            .get("logicalName")
            .and_then(Value::as_str)
            .is_some_and(|value| value == "browserCatalog")
    }) {
        return Err(anyhow!("browser compiler blocked: browserCatalog is missing"));
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
    write_json_value(&rust_dir.join("browser-pack.json"), &browser_pack)?;
    write_json_value(&rust_dir.join("search-pack.json"), &search_pack)?;
    write_binary_pack_payload(
        &rust_dir.join("browser.bin"),
        "neonei/browser-pack/current",
        &compact_browser_payload,
    )?;
    write_binary_pack(&rust_dir.join("groups.bin"), "neonei/group-pack/current", &group_pack)?;
    write_binary_pack(&rust_dir.join("search.bin"), "neonei/search-pack/current", &search_pack)?;
    let browser_items = read_json_collection(input, &manifest, &["browserCatalog", "items"], Some("items"))?;
    let string_pack = build_string_pack_from_items(&browser_items);
    write_binary_pack(&rust_dir.join("strings.zh_cn.bin"), "neonei/string-pack/current", &string_pack)?;
    Ok(())
}

fn compile_recipe_pack(input: &Path, output: &Path, strict: bool) -> Result<()> {
    let manifest = read_manifest(input)?;
    if !manifest.files.contains_key("recipeIndex") {
        return compile_dist_recipe_pack(input, output, strict);
    }
    let recipe_index = read_manifest_json(input, &manifest, "recipeIndex")?
        .ok_or_else(|| anyhow!("recipe compiler blocked: recipeIndex is missing"))?;
    let handlers = read_jsonl_values(input, &manifest, "neiHandlers")?;
    let layouts = read_jsonl_values(input, &manifest, "recipeLayouts").unwrap_or_default();
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
    let handler_pack = handlers
        .iter()
        .map(public_recipe_handler)
        .collect::<Vec<_>>();

    let mut produced_by: BTreeMap<String, Vec<Value>> = BTreeMap::new();
    let mut used_in: BTreeMap<String, Vec<Value>> = BTreeMap::new();
    let mut recipe_pack = Vec::new();
    let mut ui_payload_index = Vec::new();
    let mut ui_payload_shards: BTreeMap<String, BTreeMap<String, Value>> = BTreeMap::new();
    let mut category_map: BTreeMap<String, RecipeCategoryAccumulator> = BTreeMap::new();

    for recipe in &recipes {
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
        let family_key = classify_recipe_family_key(recipe, &raw_family_key, handler);
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
        let payload_meta = json!({
            "recipeId": recipe_id,
            "path": rust_recipe_ui_payload_relative_path(&recipe_id),
            "payloadKey": recipe_id,
            "familyKey": family_key,
            "recipeType": recipe_type,
            "machineType": machine_type,
            "handlerKey": handler_key,
            "handler": public_handler,
            "machineInfo": public_handler.as_ref().map(|handler| json!({
                "machineType": machine_type,
                "canonicalMachineFamily": handler.get("canonicalMachineFamily").cloned().unwrap_or(Value::Null),
                "catalystItemName": handler.get("catalystItemName").cloned().unwrap_or(Value::Null),
                "preferredMachineItemName": handler.get("preferredMachineItemName").cloned().unwrap_or(Value::Null),
                "gtMultiblockPreferred": handler.get("gtMultiblockPreferred").and_then(Value::as_bool).unwrap_or(false),
            })),
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
                });
        category.recipe_count += 1;
        if !category.source_category_ids.contains(&raw_category_id) {
            category.source_category_ids.push(raw_category_id.clone());
        }

        let ref_value = json!({
            "recipeId": recipe_id,
            "categoryId": recipe_category_id_from_display_name(&category_display_name, &raw_category_id),
            "displayName": category_display_name,
        });

        for input in recipe
            .get("inputs")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default()
        {
            if let Some(item_id) = value_string(&input, "itemId") {
                used_in.entry(item_id).or_default().push(ref_value.clone());
            }
        }
        for output in recipe
            .get("outputs")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default()
        {
            if let Some(item_id) = value_string(&output, "itemId") {
                produced_by
                    .entry(item_id)
                    .or_default()
                    .push(ref_value.clone());
            }
        }
        recipe_pack.push(recipe.clone());
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
            })
        })
        .collect::<Vec<_>>();

    let rust_dir = output.join("rust");
    fs::create_dir_all(&rust_dir)?;
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
            "recipes": recipe_pack.len(),
            "handlers": handler_pack.len(),
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
    write_json_value(&rust_dir.join("recipe-pack.json"), &recipe_output_pack)?;
    write_binary_pack(&rust_dir.join("recipes.bin"), "neonei/recipe-pack/current", &recipe_output_pack)?;
    Ok(())
}

fn compile_dist_recipe_pack(input: &Path, output: &Path, strict: bool) -> Result<()> {
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
    if strict && !recipe_files.iter().any(|value| {
        value
            .get("logicalName")
            .and_then(Value::as_str)
            .is_some_and(|value| value == "itemIndex")
    }) {
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
    write_json_value(&rust_dir.join("recipe-pack.json"), &recipe_output_pack)?;
    write_binary_pack(
        &rust_dir.join("recipes.bin"),
        "neonei/recipe-pack/current",
        &recipe_output_pack,
    )?;
    Ok(())
}

#[derive(Clone)]
struct RecipeCategoryAccumulator {
    category_id: String,
    recipe_count: usize,
    display_name: String,
    source_category_ids: Vec<String>,
    handler: Option<Value>,
    native_layout: Option<Value>,
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
    })
}

fn public_recipe_layout(layout: &Value) -> Value {
    json!({
        "handlerKey": value_string(layout, "handlerKey"),
        "handlerClass": value_string(layout, "handlerClass"),
        "layoutKind": value_string(layout, "layoutKind").unwrap_or_else(|| "native-nei".to_string()),
        "width": value_u64(layout, "width").unwrap_or(166),
        "height": value_u64(layout, "height").unwrap_or(65),
        "yShift": value_i64(layout, "yShift").unwrap_or(0),
        "maxRecipesPerPage": value_u64(layout, "maxRecipesPerPage").unwrap_or(1),
        "slots": layout.get("slots").and_then(Value::as_array).cloned().unwrap_or_default(),
        "textOverlays": layout.get("textOverlays").and_then(Value::as_array).cloned().unwrap_or_default(),
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

fn normalize_recipe_category_name(value: &str) -> String {
    let mut stripped = String::new();
    let mut skip_format = false;
    for character in value.trim().chars() {
        if skip_format {
            skip_format = false;
            continue;
        }
        if character == '搂' || character == '&' {
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
    let shard = stable_shard(recipe_id, 128);
    format!("rust/recipe-ui-payload-shards/{shard}.json")
}

fn stable_shard(value: &str, bucket_count: u64) -> String {
    let mut hash: u64 = 0xcbf29ce484222325;
    for byte in value.as_bytes() {
        hash ^= *byte as u64;
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("{:03}", hash % bucket_count)
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

fn repaired_browser_atlas(atlas: &Value, texture_rows: &[Value]) -> Value {
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
        let Some(asset_id) = value_string(texture, "assetId") else { continue; };
        let Some(item_id) = item_id_from_asset_id(&asset_id) else { continue; };
        if existing.contains_key(&item_id) { continue; }
        let Some(atlas_file) = value_string(texture, "atlasFile") else { continue; };
        let rect = texture.get("rect").cloned().unwrap_or_else(|| json!({
            "x": 0,
            "y": 0,
            "width": 16,
            "height": 16,
        }));
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
    }
    repaired
}

fn compile_texture_pack(input: &Path, output: &Path, strict: bool) -> Result<()> {
    let manifest = read_manifest(input)?;
    if manifest.files.contains_key("textureManifest") {
        return compile_dist_texture_pack(input, output, strict);
    }
    let atlas = read_manifest_json(input, &manifest, "browserAtlasIndex")?
        .ok_or_else(|| anyhow!("texture compiler blocked: browserAtlasIndex is missing"))?;
    let animations = read_json_collection(input, &manifest, &["animations", "animationTable"], Some("animations"))?;
    let native_sprites = read_json_collection(input, &manifest, &["nativeSprites", "nativeRenderIndex"], Some("sprites"))?;
    let texture_rows = read_json_collection(input, &manifest, &["textures", "textureManifest"], Some("textures"))?;

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

    let atlas = repaired_browser_atlas(&atlas, &texture_rows);
    let atlas_items = atlas
        .get("items")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    let mut static_items = 0u64;
    let mut animated_items = 0u64;
    let mut missing_atlas_file_refs = Vec::new();
    let mut invalid_frame_bounds = Vec::new();
    let mut animation_table = Vec::new();
    let mut atlas_map = BTreeMap::new();

    for item in &atlas_items {
        let item_id = value_string(item, "itemId").unwrap_or_default();
        let asset_id = value_string(item, "assetId").unwrap_or_default();
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
        }
        if item
            .get("hasAnimatedAtlas")
            .and_then(Value::as_bool)
            .unwrap_or(false)
        {
            animated_items += 1;
            let animated_atlas = item.get("animatedAtlas");
            validate_atlas_ref(&item_id, animated_atlas, &mut missing_atlas_file_refs);
            validate_frame_bounds(&item_id, animated_atlas, &mut invalid_frame_bounds);

            let animation = animation_by_asset.get(&asset_id);
            let native_sprite = native_sprite_by_asset.get(&asset_id);
            let frame_duration_ms = animated_atlas
                .and_then(|value| value.get("frameDurationMs"))
                .and_then(Value::as_u64)
                .or_else(|| animation.and_then(|value| value_u64(value, "frameDurationMs")))
                .or_else(|| native_sprite.and_then(|value| value_u64(value, "frameDurationMs")));
            animation_table.push(json!({
                "itemId": item_id,
                "assetId": asset_id,
                "mode": native_sprite.and_then(|value| value.get("animationMode")).cloned().unwrap_or(Value::Null),
                "frameDurationSource": if native_sprite.is_some() { "native_sprite_metadata" } else { "raw_animation_index" },
                "frameCount": animated_atlas
                    .and_then(|value| value.get("frameCount"))
                    .and_then(Value::as_u64)
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

    if strict && (!missing_atlas_file_refs.is_empty() || !invalid_frame_bounds.is_empty()) {
        return Err(anyhow!(
            "texture compiler blocked: missing atlas refs={}, invalid frame bounds={}",
            missing_atlas_file_refs.len(),
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
            "invalidFrameBounds": invalid_frame_bounds.len(),
            "atlasMapItems": atlas_map.len(),
        },
        "atlas": atlas,
        "atlasMap": atlas_map,
        "animationTable": animation_table,
        "validation": {
            "missingAtlasFileRefs": missing_atlas_file_refs,
            "invalidFrameBounds": invalid_frame_bounds,
        },
    });
    let animation_output_pack = json!({
        "schemaVersion": "neonei/rust-animation-pack/current",
        "counts": {
            "animations": animation_table.len(),
        },
        "animations": animation_table,
    });
    write_json_value(&rust_dir.join("texture-pack.json"), &texture_output_pack)?;
    write_binary_pack(&rust_dir.join("textures.bin"), "neonei/texture-pack/current", &texture_output_pack)?;
    write_binary_pack(&rust_dir.join("animations.bin"), "neonei/animation-pack/current", &animation_output_pack)?;
    Ok(())
}

fn compile_dist_texture_pack(input: &Path, output: &Path, strict: bool) -> Result<()> {
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
    if strict && !texture_files.iter().any(|value| {
        value
            .get("logicalName")
            .and_then(Value::as_str)
            .is_some_and(|value| value == "textureManifest")
    }) {
        return Err(anyhow!("texture compiler blocked: textureManifest is missing"));
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
    write_json_value(&rust_dir.join("texture-pack.json"), &texture_pack)?;
    write_binary_pack(&rust_dir.join("textures.bin"), "neonei/texture-pack/current", &texture_pack)?;
    write_binary_pack(&rust_dir.join("animations.bin"), "neonei/animation-pack/current", &animation_pack)?;
    Ok(())
}

fn compile_runtime_reports(output: &Path, scope: CompileScope, strict: bool) -> Result<()> {
    let rust_dir = output.join("rust");
    fs::create_dir_all(&rust_dir)?;

    let artifact_names: &[&str] = match scope {
        CompileScope::All => &[
            "browser.bin",
            "groups.bin",
            "search.bin",
            "recipes.bin",
            "textures.bin",
            "animations.bin",
            "strings.zh_cn.bin",
            "browser-pack.json",
            "search-pack.json",
            "recipe-pack.json",
            "texture-pack.json",
        ],
        CompileScope::Search => &["search.bin", "strings.zh_cn.bin", "search-pack.json"],
        CompileScope::Browser => &["browser.bin", "groups.bin", "search.bin", "strings.zh_cn.bin", "browser-pack.json", "search-pack.json"],
        CompileScope::Recipes => &["recipes.bin", "recipe-pack.json"],
        CompileScope::Textures => &["textures.bin", "animations.bin", "texture-pack.json"],
    };
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

    for entry in walkdir::WalkDir::new(&rust_dir)
        .into_iter()
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().is_file())
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
            "entrypoints": rust_entrypoints(scope),
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
    Ok(())
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
            CompileScope::Textures => "textures",
        }
    }
}

fn rust_entrypoints(scope: CompileScope) -> Value {
    match scope {
        CompileScope::All => json!({
            "browser": "rust/browser.bin",
            "groups": "rust/groups.bin",
            "search": "rust/search.bin",
            "recipes": "rust/recipes.bin",
            "textures": "rust/textures.bin",
            "animations": "rust/animations.bin",
            "stringsZhCn": "rust/strings.zh_cn.bin",
        }),
        CompileScope::Search => json!({
            "search": "rust/search.bin",
            "stringsZhCn": "rust/strings.zh_cn.bin",
        }),
        CompileScope::Browser => json!({
            "browser": "rust/browser.bin",
            "groups": "rust/groups.bin",
            "search": "rust/search.bin",
            "stringsZhCn": "rust/strings.zh_cn.bin",
        }),
        CompileScope::Recipes => json!({
            "recipes": "rust/recipes.bin",
        }),
        CompileScope::Textures => json!({
            "textures": "rust/textures.bin",
            "animations": "rust/animations.bin",
        }),
    }
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

fn validate_frame_bounds(item_id: &str, atlas: Option<&Value>, invalid_bounds: &mut Vec<String>) {
    let Some(atlas) = atlas else {
        return;
    };
    let atlas_width = atlas.get("atlasWidth").and_then(Value::as_u64).unwrap_or(0);
    let atlas_height = atlas
        .get("atlasHeight")
        .and_then(Value::as_u64)
        .unwrap_or(0);
    let Some(frames) = atlas.get("frames").and_then(Value::as_array) else {
        return;
    };
    for (index, frame) in frames.iter().enumerate() {
        let Some(values) = frame.as_array() else {
            invalid_bounds.push(format!("{item_id}:frame-{index}:not-array"));
            continue;
        };
        if values.len() < 5 {
            invalid_bounds.push(format!("{item_id}:frame-{index}:short"));
            continue;
        }
        let x = values.get(1).and_then(Value::as_u64).unwrap_or(0);
        let y = values.get(2).and_then(Value::as_u64).unwrap_or(0);
        let width = values.get(3).and_then(Value::as_u64).unwrap_or(0);
        let height = values.get(4).and_then(Value::as_u64).unwrap_or(0);
        if width == 0
            || height == 0
            || (atlas_width > 0 && x + width > atlas_width)
            || (atlas_height > 0 && y + height > atlas_height)
        {
            invalid_bounds.push(format!("{item_id}:frame-{index}:out-of-bounds"));
        }
    }
}

fn normalize_timeline(animated_atlas: Option<&Value>, fallback_duration_ms: Option<u64>) -> Value {
    let Some(animated_atlas) = animated_atlas else {
        return Value::Array(Vec::new());
    };
    if let Some(timeline) = animated_atlas.get("timeline").and_then(Value::as_array) {
        return Value::Array(
            timeline
                .iter()
                .enumerate()
                .map(|(index, value)| {
                    if let Some(pair) = value.as_array() {
                        json!({
                            "frameIndex": pair.first().and_then(Value::as_u64).unwrap_or(index as u64),
                            "durationMs": pair.get(1).and_then(Value::as_u64).or(fallback_duration_ms),
                        })
                    } else {
                        value.clone()
                    }
                })
                .collect(),
        );
    }
    let frame_count = animated_atlas
        .get("frameCount")
        .and_then(Value::as_u64)
        .unwrap_or(0);
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
            "groups.collapse",
            "groups.semantic-nbt",
            "recipes.lookup",
            "search.zh-cn",
            "strings.zh-cn",
            "native-render.webgl2",
        ]),
        CompileScope::Search => json!(["search.zh-cn", "strings.zh-cn"]),
        CompileScope::Browser => json!(["groups.collapse", "groups.semantic-nbt", "search.zh-cn", "strings.zh-cn", "native-render.webgl2"]),
        CompileScope::Recipes => json!(["recipes.lookup"]),
        CompileScope::Textures => json!(["atlas.static", "atlas.animated"]),
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
    value.get(key)?.as_u64()
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
}





