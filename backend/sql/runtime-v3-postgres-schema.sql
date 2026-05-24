-- NeoNEI Runtime V3 publish metadata schema.
-- Hot path data stays in dist-data/CDN; PostgreSQL only tracks versions,
-- import quality, publication state, and rollback targets.

CREATE TABLE IF NOT EXISTS neonei_data_versions (
  id BIGSERIAL PRIMARY KEY,
  version_key TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  game_version TEXT,
  modpack_version TEXT,
  source_signature TEXT NOT NULL,
  dist_data_base_url TEXT NOT NULL,
  manifest_path TEXT NOT NULL DEFAULT 'manifest.json',
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'validating', 'published', 'deprecated', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ,
  deprecated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS neonei_export_batches (
  id BIGSERIAL PRIMARY KEY,
  version_id BIGINT NOT NULL REFERENCES neonei_data_versions(id) ON DELETE CASCADE,
  export_key TEXT NOT NULL,
  raw_export_path TEXT NOT NULL,
  source_repository TEXT,
  source_commit TEXT,
  command_line TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'succeeded', 'failed', 'cancelled')),
  item_count INTEGER NOT NULL DEFAULT 0,
  recipe_count INTEGER NOT NULL DEFAULT 0,
  texture_count INTEGER NOT NULL DEFAULT 0,
  animation_count INTEGER NOT NULL DEFAULT 0,
  warning_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  UNIQUE (version_id, export_key)
);

CREATE TABLE IF NOT EXISTS neonei_compile_records (
  id BIGSERIAL PRIMARY KEY,
  version_id BIGINT NOT NULL REFERENCES neonei_data_versions(id) ON DELETE CASCADE,
  export_batch_id BIGINT REFERENCES neonei_export_batches(id) ON DELETE SET NULL,
  compiler_version TEXT NOT NULL,
  input_signature TEXT NOT NULL,
  output_signature TEXT NOT NULL,
  dist_data_path TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'succeeded', 'failed', 'cancelled')),
  item_count INTEGER NOT NULL DEFAULT 0,
  recipe_count INTEGER NOT NULL DEFAULT 0,
  browser_entry_count INTEGER NOT NULL DEFAULT 0,
  atlas_entry_count INTEGER NOT NULL DEFAULT 0,
  search_pack_bytes BIGINT NOT NULL DEFAULT 0,
  dist_data_bytes BIGINT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS neonei_validation_reports (
  id BIGSERIAL PRIMARY KEY,
  version_id BIGINT NOT NULL REFERENCES neonei_data_versions(id) ON DELETE CASCADE,
  compile_record_id BIGINT REFERENCES neonei_compile_records(id) ON DELETE SET NULL,
  report_path TEXT NOT NULL,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  missing_textures INTEGER NOT NULL DEFAULT 0,
  missing_recipes INTEGER NOT NULL DEFAULT 0,
  duplicate_categories INTEGER NOT NULL DEFAULT 0,
  search_coverage NUMERIC(6, 3),
  browser_p95_ms NUMERIC(8, 3),
  search_p95_ms NUMERIC(8, 3),
  recipe_open_p95_ms NUMERIC(8, 3),
  passed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS neonei_publish_events (
  id BIGSERIAL PRIMARY KEY,
  version_id BIGINT NOT NULL REFERENCES neonei_data_versions(id) ON DELETE CASCADE,
  compile_record_id BIGINT REFERENCES neonei_compile_records(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('publish', 'rollback', 'deprecate')),
  target_version_key TEXT,
  actor TEXT,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_neonei_versions_status
  ON neonei_data_versions(status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_neonei_exports_version_status
  ON neonei_export_batches(version_id, status);
CREATE INDEX IF NOT EXISTS idx_neonei_compile_version_status
  ON neonei_compile_records(version_id, status);
CREATE INDEX IF NOT EXISTS idx_neonei_validation_version_created
  ON neonei_validation_reports(version_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_neonei_validation_summary_gin
  ON neonei_validation_reports USING GIN (summary);
CREATE INDEX IF NOT EXISTS idx_neonei_publish_version_created
  ON neonei_publish_events(version_id, created_at DESC);
