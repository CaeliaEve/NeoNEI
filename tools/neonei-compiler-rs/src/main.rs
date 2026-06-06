use anyhow::{anyhow, Context, Result};
use clap::{Parser, Subcommand};
use flate2::read::GzDecoder;
use serde::{Deserialize, Serialize};
use serde_json::Value;
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
