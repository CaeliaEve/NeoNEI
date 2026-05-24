# NeoNEI Runtime V3 CDN Layout

Runtime V3 publishes immutable dist-data bundles. The frontend hot path reads
these files directly; backend and PostgreSQL only choose the active version and
record validation/publish history.

## Immutable version bundle

```text
/neonei-data/
  versions/
    <version-key>/
      manifest.json
      search/
        all.json
      browser/
        item-catalog.json
        group-index.json
      recipes/
        item-index.json
        recipe-category-index.json
        ui-payload-index.json
        ui-payloads/
          <encoded-recipe-id>.json
      textures/
        atlas-manifest.json
        browser-atlas-index.json
        atlas/
          *.webp
          *.png
      validation/
        report.json
```

Rules:

- `<version-key>` is immutable after publish.
- Every file under a version uses long-lived cache headers.
- `manifest.json` contains every relative file path the frontend needs.
- Texture and animation paths are referenced from `atlas-manifest.json` and
  `browser-atlas-index.json`; the browser grid does not guess single-image
  fallbacks.

## Mutable pointers

```text
/neonei-data/
  channels/
    stable.json
    dev.json
    canary.json
```

Each channel pointer is tiny and short-cache:

```json
{
  "schemaVersion": "neonei/channel-pointer/v1",
  "channel": "stable",
  "versionKey": "gtnh-2.8.0-2026-05-25",
  "manifestUrl": "/neonei-data/versions/gtnh-2.8.0-2026-05-25/manifest.json",
  "sourceSignature": "sha256:..."
}
```

Rollback is a pointer swap plus a `neonei_publish_events` row; no immutable
bundle is rewritten.
