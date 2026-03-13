CREATE TABLE IF NOT EXISTS substances (
  id UUID PRIMARY KEY,
  listing_type TEXT NOT NULL,
  canonical_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  cas TEXT,
  inn TEXT,
  unii TEXT,
  gsrs_id TEXT,
  product_ndc TEXT,
  dosage_form TEXT,
  strength_value NUMERIC,
  strength_unit TEXT,
  route TEXT,
  description TEXT,
  verification_status TEXT NOT NULL DEFAULT 'review_required',
  source_priority INTEGER NOT NULL DEFAULT 100,
  source_last_fetched_at TIMESTAMPTZ,
  source_record_hash TEXT,
  normalized_record_version INTEGER NOT NULL DEFAULT 1,
  verification_last_checked_at TIMESTAMPTZ,
  refresh_status TEXT NOT NULL DEFAULT 'pending',
  refresh_strategy TEXT NOT NULL DEFAULT 'manual_review',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_substances_normalized_name ON substances(normalized_name);
CREATE INDEX IF NOT EXISTS idx_substances_listing_type ON substances(listing_type);
CREATE INDEX IF NOT EXISTS idx_substances_cas ON substances(cas);
CREATE INDEX IF NOT EXISTS idx_substances_product_ndc ON substances(product_ndc);

CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY,
  supplier_name TEXT NOT NULL,
  tenant_id TEXT,
  owner_org_id TEXT,
  verification_status TEXT NOT NULL DEFAULT 'claimed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sites (
  id UUID PRIMARY KEY,
  supplier_id UUID REFERENCES suppliers(id),
  source_site_id TEXT,
  site_name TEXT NOT NULL,
  address_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  country TEXT,
  role_tags TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS supplier_product_claims (
  id UUID PRIMARY KEY,
  supplier_id UUID REFERENCES suppliers(id),
  substance_id UUID REFERENCES substances(id),
  supplier_roles TEXT[] NOT NULL DEFAULT '{}',
  claim_status TEXT NOT NULL DEFAULT 'draft',
  verification_status TEXT NOT NULL DEFAULT 'claimed',
  source_legacy_product_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS site_product_mappings (
  id UUID PRIMARY KEY,
  claim_id UUID REFERENCES supplier_product_claims(id),
  site_id UUID REFERENCES sites(id),
  mapping_roles TEXT[] NOT NULL DEFAULT '{}',
  verification_status TEXT NOT NULL DEFAULT 'claimed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS offers (
  id UUID PRIMARY KEY,
  claim_id UUID REFERENCES supplier_product_claims(id),
  visibility TEXT NOT NULL DEFAULT 'private',
  offer_status TEXT NOT NULL DEFAULT 'draft',
  commercial_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS compliance_records (
  id UUID PRIMARY KEY,
  claim_id UUID REFERENCES supplier_product_claims(id),
  offer_id UUID REFERENCES offers(id),
  claim_type TEXT NOT NULL,
  claimed_value JSONB NOT NULL DEFAULT '{}'::jsonb,
  verified_value JSONB NOT NULL DEFAULT '{}'::jsonb,
  verification_status TEXT NOT NULL DEFAULT 'claimed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS evidence_documents (
  id UUID PRIMARY KEY,
  claim_id UUID REFERENCES supplier_product_claims(id),
  offer_id UUID REFERENCES offers(id),
  compliance_record_id UUID REFERENCES compliance_records(id),
  document_type TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  source_url TEXT,
  issued_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  extracted_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS provenance_events (
  id UUID PRIMARY KEY,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  field_path TEXT,
  source_name TEXT NOT NULL,
  source_url TEXT,
  fetched_at_utc TIMESTAMPTZ NOT NULL,
  parser_version TEXT NOT NULL,
  confidence_score NUMERIC NOT NULL,
  raw_snippet_ref TEXT,
  claim_origin TEXT NOT NULL,
  verification_status TEXT NOT NULL,
  source_record_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS merge_events (
  id UUID PRIMARY KEY,
  primary_resource_id TEXT NOT NULL,
  merged_resource_id TEXT NOT NULL,
  score NUMERIC NOT NULL,
  status TEXT NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS refresh_runs (
  id UUID PRIMARY KEY,
  source_name TEXT NOT NULL,
  strategy TEXT NOT NULL,
  status TEXT NOT NULL,
  stats_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  notes TEXT
);
