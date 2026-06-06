use anyhow::{anyhow, Context, Result};
use clap::{Parser, Subcommand};
use flate2::read::GzDecoder;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
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
        #[arg(long)]
        threads: Option<usize>,
        #[arg(long, default_value_t = false)]
        strict: bool,
    },
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
            threads,
            strict,
        } => {
            configure_threads(threads);
            fs::create_dir_all(&output)
                .with_context(|| format!("create output directory {}", output.display()))?;
            compile_browser_pack(&input, &output, strict)?;
            compile_recipe_pack(&input, &output, strict)?;
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
    let items = read_jsonl_values(input, &manifest, "items")?;
    let order_rows = read_jsonl_values(input, &manifest, "neiOrder")?;
    let group_rows = read_jsonl_values(input, &manifest, "groups")?;
    let atlas = read_manifest_json(input, &manifest, "browserAtlasIndex")?.unwrap_or(Value::Null);

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
                "aliases": raw_search_terms.unwrap_or_default(),
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
    write_json_value(
        &rust_dir.join("search-pack.json"),
        &json!({
            "schemaVersion": "neonei/rust-search-pack/current",
            "counts": {
                "items": search_items.len(),
                "aliasItems": alias_map.len(),
            },
            "items": search_items,
        }),
    )?;
    Ok(())
}

fn compile_recipe_pack(input: &Path, output: &Path, strict: bool) -> Result<()> {
    let manifest = read_manifest(input)?;
    let recipe_index = read_manifest_json(input, &manifest, "recipeIndex")?
        .ok_or_else(|| anyhow!("recipe compiler blocked: recipeIndex is missing"))?;
    let handlers = read_jsonl_values(input, &manifest, "neiHandlers")?;
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

    let handler_pack = handlers
        .iter()
        .map(|handler| {
            json!({
                "handlerKey": value_string(handler, "handlerKey"),
                "handlerClass": value_string(handler, "handlerClass"),
                "displayName": value_string(handler, "displayName"),
                "localizedName": value_string(handler, "localizedName"),
                "canonicalMachineFamily": value_string(handler, "canonicalMachineFamily"),
                "modId": value_string(handler, "modId"),
                "preferredMachineItemName": value_string(handler, "preferredMachineItemName"),
                "maxRecipesPerPage": value_u64(handler, "maxRecipesPerPage"),
            })
        })
        .collect::<Vec<_>>();

    let mut produced_by: BTreeMap<String, Vec<Value>> = BTreeMap::new();
    let mut used_in: BTreeMap<String, Vec<Value>> = BTreeMap::new();
    let mut recipe_pack = Vec::new();

    for recipe in &recipes {
        let recipe_id = value_string(recipe, "recipeId").unwrap_or_default();
        let machine = recipe.get("machine").cloned().unwrap_or(Value::Null);
        let category_id = machine
            .get("machineId")
            .and_then(Value::as_str)
            .unwrap_or_else(|| {
                recipe
                    .get("family")
                    .and_then(Value::as_str)
                    .unwrap_or("unknown")
            })
            .to_string();
        let display_name = machine
            .get("displayName")
            .and_then(Value::as_str)
            .unwrap_or(category_id.as_str())
            .to_string();
        let ref_value = json!({
            "recipeId": recipe_id,
            "categoryId": category_id,
            "displayName": display_name,
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

    let rust_dir = output.join("rust");
    fs::create_dir_all(&rust_dir)?;
    write_json_value(
        &rust_dir.join("recipe-pack.json"),
        &json!({
            "schemaVersion": "neonei/rust-recipe-pack/current",
            "counts": {
                "recipes": recipe_pack.len(),
                "handlers": handler_pack.len(),
                "recipeItemIndexItems": item_index.len(),
            },
            "recipes": recipe_pack,
            "handlers": handler_pack,
            "itemIndex": item_index,
        }),
    )?;
    Ok(())
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
