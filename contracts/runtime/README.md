# NeoNEI Runtime Contracts

These schemas define the stable public runtime surface consumed by the web frontend.

Compatibility rules:

- Additive fields are allowed.
- Removing or changing required fields requires a new `schemaVersion`.
- Public runtime paths should prefer immutable `dist-data` / `publish` artifacts.
- Dynamic APIs are compatibility, diagnostics, admin, or development surfaces unless explicitly promoted here.

Current core contracts:

- `manifest.schema.json`
- `browser.schema.json`
- `search.schema.json`
- `recipe.schema.json`
- `texture.schema.json`
- `error.schema.json`
