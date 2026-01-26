import mongoose from "mongoose";

const SourceRefSchema = new mongoose.Schema(
  {
    sourceId: { type: mongoose.Schema.Types.ObjectId, ref: "public_sources" },
    source_url: { type: String },
    retrieved_at: { type: Date },
    published_at: { type: Date },
  },
  { _id: false }
);

const PublicSupplierSchema = new mongoose.Schema(
  {
    supplier_key: { type: String, unique: true, index: true },
    legal_name: { type: String, required: true },
    demoInviteEmail: { type: String },
    aliases: { type: [String], default: [] },
    country: { type: String },
    website: { type: String },
    claimed_status: { type: String, enum: ["unclaimed", "claimed", "verified"], default: "unclaimed" },
    signals: {
      last_inspection_date: { type: Date },
      warning_letter_count: { type: Number, default: 0 },
      import_alert_active: { type: Boolean, default: false },
      recall_count: { type: Number, default: 0 },
      cep_count: { type: Number, default: 0 },
      who_pq_count: { type: Number, default: 0 },
    },
    last_synced_at: { type: Date },
    sources: { type: [SourceRefSchema], default: [] },
  },
  { timestamps: true }
);

const PublicSiteSchema = new mongoose.Schema(
  {
    site_key: { type: String, unique: true, index: true },
    supplier_id: { type: mongoose.Schema.Types.ObjectId, ref: "public_suppliers", index: true },
    address1: { type: String },
    address2: { type: String },
    city: { type: String },
    state: { type: String },
    postal_code: { type: String },
    country: { type: String },
    regulatory_ids: { type: Map, of: String },
    geo: { type: { lat: Number, lng: Number } },
    last_synced_at: { type: Date },
    sources: { type: [SourceRefSchema], default: [] },
  },
  { timestamps: true }
);

const PublicApiSchema = new mongoose.Schema(
  {
    api_key: { type: String, unique: true, index: true },
    api_name: { type: String, required: true },
    synonyms: { type: [String], default: [] },
    manufacturers: [
      {
        supplier_id: { type: mongoose.Schema.Types.ObjectId, ref: "public_suppliers" },
        confidence: { type: Number, default: 1 },
      },
    ],
    filings_summary: {
      dmf_count: { type: Number, default: 0 },
      cep_count: { type: Number, default: 0 },
      who_pq_count: { type: Number, default: 0 },
    },
    last_synced_at: { type: Date },
    sources: { type: [SourceRefSchema], default: [] },
  },
  { timestamps: true }
);

const PublicInspectionSchema = new mongoose.Schema(
  {
    supplier_id: { type: mongoose.Schema.Types.ObjectId, ref: "public_suppliers", index: true },
    site_id: { type: mongoose.Schema.Types.ObjectId, ref: "public_sites", index: true },
    authority: { type: String },
    inspection_date: { type: Date },
    classification: { type: String },
    product_type: { type: String },
    raw: { type: Object },
    sources: { type: [SourceRefSchema], default: [] },
  },
  { timestamps: true }
);

const PublicActionSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["WarningLetter", "ImportAlert", "Recall"], index: true },
    authority: { type: String },
    supplier_id: { type: mongoose.Schema.Types.ObjectId, ref: "public_suppliers", index: true },
    site_id: { type: mongoose.Schema.Types.ObjectId, ref: "public_sites", index: true },
    date: { type: Date },
    status: { type: String },
    title: { type: String },
    url: { type: String },
    raw: { type: Object },
    sources: { type: [SourceRefSchema], default: [] },
  },
  { timestamps: true }
);

const PublicFilingSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["DMF", "CEP", "WHO_PQ"] },
    api_name: { type: String },
    supplier_id: { type: mongoose.Schema.Types.ObjectId, ref: "public_suppliers" },
    site_id: { type: mongoose.Schema.Types.ObjectId, ref: "public_sites" },
    status: { type: String },
    number: { type: String },
    sources: { type: [SourceRefSchema], default: [] },
  },
  { timestamps: true }
);

const PublicSourceSchema = new mongoose.Schema(
  {
    name: { type: String, unique: true },
    authority: { type: String },
    source_url: { type: String },
    format: { type: String },
    schedule: { type: String },
    last_run_at: { type: Date },
    last_success_at: { type: Date },
    stats: { type: Object },
    checksum: { type: String },
    etag: { type: String },
    notes_on_terms: { type: String },
  },
  { timestamps: true }
);

const PublicClaimRequestSchema = new mongoose.Schema(
  {
    supplier_id: { type: mongoose.Schema.Types.ObjectId, ref: "public_suppliers", index: true },
    request_type: { type: String, enum: ["claim", "dispute"], required: true },
    requester_email: { type: String, required: true },
    message: { type: String },
    status: { type: String, enum: ["new", "in_review", "resolved"], default: "new" },
  },
  { timestamps: true }
);

const PublicUnmatchedSchema = new mongoose.Schema(
  {
    source_name: { type: String },
    raw_row: { type: Object },
    reason: { type: String },
  },
  { timestamps: true }
);

export const PublicSupplier = mongoose.model("public_suppliers", PublicSupplierSchema);
export const PublicSite = mongoose.model("public_sites", PublicSiteSchema);
export const PublicApi = mongoose.model("public_apis", PublicApiSchema);
export const PublicInspection = mongoose.model("public_inspections", PublicInspectionSchema);
export const PublicAction = mongoose.model("public_actions", PublicActionSchema);
export const PublicFiling = mongoose.model("public_filings", PublicFilingSchema);
export const PublicSource = mongoose.model("public_sources", PublicSourceSchema);
export const PublicClaimRequest = mongoose.model("public_claim_requests", PublicClaimRequestSchema);
export const PublicUnmatched = mongoose.model("public_unmatched", PublicUnmatchedSchema);
