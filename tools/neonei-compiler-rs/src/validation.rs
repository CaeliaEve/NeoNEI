use crate::io::write_json_value;
use crate::json_ext::value_u64;
use crate::manifest::{read_manifest, read_manifest_json};
use anyhow::Result;
use serde_json::{json, Value};
use std::fs;
use std::path::Path;

pub fn compile_semantic_validation_report(input: &Path, output: &Path) -> Result<()> {
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
