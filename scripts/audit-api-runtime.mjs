import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);

function readText(relativePath) {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

function matchAll(text, regex) {
  return Array.from(text.matchAll(regex)).map((match) => match[0]);
}

function matchCaptureAll(text, regex, group = 1) {
  return Array.from(text.matchAll(regex)).map((match) => match[group]).filter(Boolean);
}


function collectRouteRegistrationsWithContext(text) {
  const lines = text.split(/\r?\n/);
  const contexts = [];
  const routes = [];
  let pendingPublicRuntimeOnlyIf = null;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();
    const opens = (line.match(/\{/g) ?? []).length;
    const closes = (line.match(/\}/g) ?? []).length;

    if (/^if\s*\(\s*!\s*PUBLIC_RUNTIME_ONLY\s*\)/.test(trimmed)) {
      pendingPublicRuntimeOnlyIf = contexts.length + opens;
    }

    const gatedByPublicRuntimeOnly = pendingPublicRuntimeOnlyIf !== null || contexts.includes("!PUBLIC_RUNTIME_ONLY");
    if (/app\.(?:use|get|post|put|delete)\(/.test(line)) {
      routes.push({
        line: line.trim(),
        lineNumber: i + 1,
        gatedByPublicRuntimeOnly,
      });
    }

    for (let openIndex = 0; openIndex < opens; openIndex += 1) {
      if (pendingPublicRuntimeOnlyIf !== null && contexts.length + 1 === pendingPublicRuntimeOnlyIf) {
        contexts.push("!PUBLIC_RUNTIME_ONLY");
        pendingPublicRuntimeOnlyIf = null;
      } else {
        contexts.push("block");
      }
    }
    for (let closeIndex = 0; closeIndex < closes; closeIndex += 1) {
      contexts.pop();
    }
    if (opens === 0 && pendingPublicRuntimeOnlyIf !== null) {
      pendingPublicRuntimeOnlyIf = null;
    }
  }

  return routes;
}

function hasArg(name) {
  return args.includes(name);
}

function getNumberArg(name, fallback = Number.POSITIVE_INFINITY) {
  const prefix = `${name}=`;
  const raw = args.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
  if (raw === undefined || raw === "") {
    return fallback;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

const gateEnabled = hasArg("--gate");
const maxFallbackReferences = getNumberArg("--max-fallback-references");
const maxLegacyApiReferences = getNumberArg("--max-legacy-api-references", 0);
const maxLegacyDynamicRoutes = getNumberArg("--max-legacy-dynamic-routes");
const requireRuntimeDiagnostics = !hasArg("--allow-missing-runtime-diagnostics");
const requireApiTierHeaders = !hasArg("--allow-missing-api-tier-headers");

const server = readText("backend/src/server.ts");
const staticAssetRoutes = existsSync(join(repoRoot, "backend/src/routes/static-assets.routes.ts"))
  ? readText("backend/src/routes/static-assets.routes.ts")
  : "";
const runtimeAdminRoutes = existsSync(join(repoRoot, "backend/src/routes/runtime-admin.routes.ts"))
  ? readText("backend/src/routes/runtime-admin.routes.ts")
  : "";
const apiNamespaceRoutes = existsSync(join(repoRoot, "backend/src/routes/api-namespaces.routes.ts"))
  ? readText("backend/src/routes/api-namespaces.routes.ts")
  : "";
const apiNamespaceRegistry = existsSync(join(repoRoot, "backend/src/routes/api-namespace-registry.ts"))
  ? readText("backend/src/routes/api-namespace-registry.ts")
  : "";
const currentRuntimeEndpointRegistry = existsSync(join(repoRoot, "backend/src/routes/current-runtime-endpoint-registry.ts"))
  ? readText("backend/src/routes/current-runtime-endpoint-registry.ts")
  : "";
const routeSource = [server, staticAssetRoutes, runtimeAdminRoutes, apiNamespaceRoutes].join("\n");
const apiService = readText("frontend/src/services/api.ts");
const runtimeRoutes = existsSync(join(repoRoot, "backend/src/routes/runtime.routes.ts"))
  ? readText("backend/src/routes/runtime.routes.ts")
  : "";
const routeRegistrationsWithContext = collectRouteRegistrationsWithContext(routeSource);
const routeRegistrations = routeRegistrationsWithContext.map((route) => route.line);
const staticMounts = routeRegistrationsWithContext
  .filter((route) => /express\.static|createPublishStaticRoute|createRawStaticRoute/.test(route.line))
  .map((route) => route.line);
const legacyDynamicRoutePattern = /\/api\/(?:items|recipes-indexed|recipe-bootstrap|render-contract|gt-diagrams|forestry-genetics|multiblocks|patterns)/;
const legacyDynamicRoutesWithContext = routeRegistrationsWithContext.filter((route) => legacyDynamicRoutePattern.test(route.line));
const legacyDynamicRoutes = legacyDynamicRoutesWithContext.map((route) => route.line);
const publicRuntimeExposedLegacyDynamicRoutes = legacyDynamicRoutesWithContext
  .filter((route) => !route.gatedByPublicRuntimeOnly)
  .map((route) => route.line);
const devOnlyLegacyDynamicRoutes = legacyDynamicRoutesWithContext
  .filter((route) => route.gatedByPublicRuntimeOnly)
  .map((route) => route.line);
const adminRoutes = routeRegistrationsWithContext.filter((route) => /\/api\/admin/.test(route.line)).map((route) => route.line);
const apiNamespaceMountPaths = matchCaptureAll(apiNamespaceRegistry, /mountPath:\s*['"`]([^'"`]+)['"`]/g);
const currentRuntimeEndpointPaths = matchCaptureAll(currentRuntimeEndpointRegistry, /path:\s*['"`]([^'"`]+)['"`]/g);
const registryProductRuntimeRoutes = apiNamespaceMountPaths
  .filter((path) => /^\/(?:runtime|lab)\b/.test(path))
  .map((path) => `api-namespace-registry:${path}`);
const registryPublicRuntimeRoutes = apiNamespaceMountPaths
  .filter((path) => /^\/runtime\b|^\/api\/publish\b|^\/api\/v1\b/.test(path))
  .map((path) => `api-namespace-registry:${path}`);
const currentRuntimeRegistryRoutes = currentRuntimeEndpointPaths
  .filter((path) => /^\/runtime\b|^\/diagnostics\b|^\/health\b/.test(path))
  .map((path) => `current-runtime-endpoint-registry:/api${path}`);
const productRuntimeRoutes = [
  ...routeRegistrationsWithContext.filter((route) => /['"`]\/(?:runtime|ops|lab)\b/.test(route.line)).map((route) => route.line),
  ...registryProductRuntimeRoutes,
  ...currentRuntimeRegistryRoutes,
];
const publicRuntimeRoutes = [
  ...routeRegistrationsWithContext.filter((route) => /['"`]\/runtime\b|\/api\/publish|\/api\/v1|\/publish|\/dist-data|\/canonical/.test(route.line)).map((route) => route.line),
  ...registryPublicRuntimeRoutes,
  ...currentRuntimeRegistryRoutes,
];

const frontendRuntimeCalls = {
  distDataReferences: (apiService.match(/dist-data/g) ?? []).length,
  publishReferences: (apiService.match(/publish/g) ?? []).length,
  legacyApiReferences: (apiService.match(/\/api\/(?:items|recipes-indexed|recipe-bootstrap|render-contract)/g) ?? []).length,
  fallbackReferences: (apiService.match(/fallback/gi) ?? []).length,
  strictRuntimeReferences: (apiService.match(/strictRuntime|runtime-v3-strict|STRICT/g) ?? []).length,
};

const runtimeCapabilities = {
  hasRuntimeNamespace: productRuntimeRoutes.some((line) => /(?:['"`]|:)\/runtime\b|:\/api\/runtime\b/.test(line)),
  hasOpsNamespace: productRuntimeRoutes.some((line) => /['"`]\/ops\b/.test(line)),
  hasLabNamespace: productRuntimeRoutes.some((line) => /(?:['"`]|:)\/lab\b/.test(line)),
  hasRuntimeDiagnostics: /\/diagnostics/.test(runtimeRoutes) || /\/runtime\/diagnostics/.test(server),
  hasRuntimeContracts: /\/contracts/.test(runtimeRoutes) || /\/runtime\/contracts/.test(server),
  hasApiTierHeaders: /x-neonei-api-tier/.test(routeSource),
};

const dependencyMap = {
  homeFirstPaint: [
    "/runtime/manifest",
    "/runtime/files/runtime-manifest.json",
    "/runtime/files/rust/browser.bin",
    "/runtime/files/rust/groups.bin",
    "/runtime/files/rust/search.bin",
    "/runtime/files/rust/textures.bin",
    "/runtime/files/rust/animations.bin",
    "/runtime/files/textures/atlas/*.webp",
  ],
  browserPaging: [
    "WASM browser/search/group projection packs",
    "GPU resident atlas descriptor pack",
    "immutable runtime atlas image files",
  ],
  search: [
    "WASM search.bin projection",
    "worker-local query/mod/group projection cache",
    "no HTTP hot-path lookup",
  ],
  recipeOpen: [
    "/runtime/recipes/current/item/{itemId}",
    "/runtime/recipes/current/usage/{itemId}",
    "binary recipe packs when available",
  ],
};

const fallbackClassification = {
  keepForDevCompatibility: [
    "/lab/items",
    "/lab/recipes",
    "/lab/recipe-bootstrap",
    "/lab/render-contract",
  ],
  migrateToRuntimeContracts: [
    "recipe bootstrap dynamic lookups",
    "search fallback paths",
    "direct image fallback probes",
  ],
  removeFromProductionHotPath: [
    "single item texture probing in browser grid",
    "page scoped atlas fallback",
    "silent fallback after runtime-v3 contract failure",
  ],
};

const gateChecks = [
  {
    id: "frontend-legacy-api-references",
    ok: frontendRuntimeCalls.legacyApiReferences <= maxLegacyApiReferences,
    actual: frontendRuntimeCalls.legacyApiReferences,
    expected: `<= ${maxLegacyApiReferences}`,
  },
  {
    id: "frontend-fallback-reference-budget",
    ok: frontendRuntimeCalls.fallbackReferences <= maxFallbackReferences,
    actual: frontendRuntimeCalls.fallbackReferences,
    expected: Number.isFinite(maxFallbackReferences) ? `<= ${maxFallbackReferences}` : "not budgeted",
    skipped: !Number.isFinite(maxFallbackReferences),
  },
  {
    id: "public-runtime-exposed-legacy-dynamic-route-budget",
    ok: publicRuntimeExposedLegacyDynamicRoutes.length <= maxLegacyDynamicRoutes,
    actual: publicRuntimeExposedLegacyDynamicRoutes.length,
    expected: Number.isFinite(maxLegacyDynamicRoutes) ? `<= ${maxLegacyDynamicRoutes}` : "not budgeted",
    skipped: !Number.isFinite(maxLegacyDynamicRoutes),
  },
  {
    id: "runtime-namespace-present",
    ok: runtimeCapabilities.hasRuntimeNamespace,
    actual: runtimeCapabilities.hasRuntimeNamespace,
    expected: true,
  },
  {
    id: "ops-namespace-present",
    ok: runtimeCapabilities.hasOpsNamespace,
    actual: runtimeCapabilities.hasOpsNamespace,
    expected: true,
  },
  {
    id: "lab-namespace-present",
    ok: runtimeCapabilities.hasLabNamespace,
    actual: runtimeCapabilities.hasLabNamespace,
    expected: true,
  },
  {
    id: "runtime-contracts-present",
    ok: runtimeCapabilities.hasRuntimeContracts,
    actual: runtimeCapabilities.hasRuntimeContracts,
    expected: true,
  },
  {
    id: "runtime-diagnostics-present",
    ok: !requireRuntimeDiagnostics || runtimeCapabilities.hasRuntimeDiagnostics,
    actual: runtimeCapabilities.hasRuntimeDiagnostics,
    expected: requireRuntimeDiagnostics,
    skipped: !requireRuntimeDiagnostics,
  },
  {
    id: "api-tier-headers-present",
    ok: !requireApiTierHeaders || runtimeCapabilities.hasApiTierHeaders,
    actual: runtimeCapabilities.hasApiTierHeaders,
    expected: requireApiTierHeaders,
    skipped: !requireApiTierHeaders,
  },
];

const gateFailures = gateChecks.filter((check) => !check.skipped && !check.ok);

const report = {
  schemaVersion: "neonei/api-runtime-audit/v1",
  generatedAt: new Date().toISOString(),
  routeSummary: {
    totalRegistrations: routeRegistrations.length,
    staticMounts,
    productRuntimeRoutes,
    publicRuntimeRoutes,
    legacyDynamicRoutes,
    legacyDynamicRoutesByExposure: {
      publicRuntimeExposed: publicRuntimeExposedLegacyDynamicRoutes,
      devOnlyGatedByPublicRuntimeOnly: devOnlyLegacyDynamicRoutes,
    },
    adminRoutes,
  },
  frontendRuntimeCalls,
  runtimeCapabilities,
  gate: {
    enabled: gateEnabled,
    status: gateFailures.length === 0 ? "ok" : "failed",
    checks: gateChecks,
    failures: gateFailures,
  },
  dependencyMap,
  fallbackClassification,
  recommendations: [
    "Use /runtime, /ops, and /lab as the product-semantic runtime namespace.",
    "Keep /api/v1 as the stable versioned runtime contract surface. Updated consumers should use /api/runtime/current directly.",
    "Keep dynamic diagnostic APIs lab-only under /lab; do not remount SQLite-backed dev routes under production /api.",
    "Validate raw-export compiled runtime packs through native runtime gates before activation.",
    "Continue moving production browser/search/recipe paths to immutable runtime artifacts.",
  ],
};

const outputDir = join(repoRoot, ".runtime-logs");
mkdirSync(outputDir, { recursive: true });
const outputPath = join(outputDir, "api-runtime-audit.json");
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ outputPath, ...report }, null, 2));

if (gateEnabled && gateFailures.length > 0) {
  process.exitCode = 1;
}
