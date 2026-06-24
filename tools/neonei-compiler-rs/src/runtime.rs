use crate::cli::CompileScope;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::path::Path;

pub fn is_text_runtime_artifact(path: &Path) -> bool {
    path.extension()
        .and_then(|value| value.to_str())
        .is_some_and(|extension| matches!(extension, "json" | "txt" | "log"))
}

pub fn rust_manifest_file_entries(
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
        CompileScope::NativeUi => entries.extend([
            ("rustBrowserBin", "rust/browser.bin"),
            ("rustGroupsBin", "rust/groups.bin"),
            ("rustSearchBin", "rust/search.bin"),
            ("rustRecipeBin", "rust/recipes.bin"),
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
            CompileScope::NativeUi => entries.extend([
                ("rustBrowserPack", "rust/browser-pack.json"),
                ("rustSearchPack", "rust/search-pack.json"),
                ("rustRecipePack", "rust/recipe-pack.json"),
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

pub fn runtime_id_from_integrity(integrity: &BTreeMap<String, String>) -> String {
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

pub fn rust_entrypoints_from_integrity(integrity: &BTreeMap<String, String>) -> Value {
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

pub fn rust_capabilities(scope: CompileScope) -> Value {
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
        CompileScope::NativeUi => json!([
            "groups.collapse",
            "groups.semantic-nbt",
            "recipes.lookup",
            "recipes.native-ui-layout",
            "recipes.ui-pack",
            "search.zh-cn",
            "strings.zh-cn",
            "native-render.webgl2"
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
