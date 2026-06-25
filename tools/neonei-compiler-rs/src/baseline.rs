use crate::io::normalize_path;
use crate::manifest::read_manifest;
use crate::raw_export::summarize_raw_export;
use crate::reports::{summarize_runtime_output, write_report, CompilerReport};
use anyhow::{anyhow, Result};
use std::fs;
use std::path::Path;
use std::time::Instant;

pub fn run_baseline(
    input: &Path,
    output: Option<&Path>,
    report: &Path,
    strict: bool,
) -> Result<()> {
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
