import mongoose from "mongoose";

const ListingType = ["API", "FDF", "EXCIPIENT", "INTERMEDIATE", "PACKAGING_COMPONENT"];
const ClaimOrigin = ["supplier_submission", "public_source", "registry_verification", "legacy_backfill"];
const VerificationStatus = ["claimed", "verified", "rejected", "review_required", "unverified"];

const IdentifierSchema = new mongoose.Schema(
  {
    cas: { type: String, default: "" },
    inn: { type: String, default: "" },
    unii: { type: String, default: "" },
    gsrsId: { type: String, default: "" },
    productNdc: { type: String, default: "" },
    packageNdc: { type: String, default: "" },
    hsCode: { type: String, default: "" },
  },
  { _id: false }
);

const StrengthSchema = new mongoose.Schema(
  {
    value: { type: Number, default: null },
    unit: { type: String, default: "" },
  },
  { _id: false }
);

const ComparatorValueSchema = new mongoose.Schema(
  {
    value: { type: Number, default: null },
    comparator: { type: String, default: "" },
    unit: { type: String, default: "%" },
  },
  { _id: false }
);

const PackagingConfigSchema = new mongoose.Schema(
  {
    packSize: { type: Number, default: null },
    packUnit: { type: String, default: "" },
    material: { type: String, default: "" },
    innerOuter: { type: String, default: "" },
    label: { type: String, default: "" },
  },
  { _id: false }
);

const SiteAddressSchema = new mongoose.Schema(
  {
    address1: { type: String, default: "" },
    address2: { type: String, default: "" },
    city: { type: String, default: "" },
    state: { type: String, default: "" },
    postalCode: { type: String, default: "" },
    country: { type: String, default: "" },
  },
  { _id: false }
);

const SourceSummarySchema = new mongoose.Schema(
  {
    sourceName: { type: String, required: true },
    sourceUrl: { type: String, default: "" },
    fetchedAtUtc: { type: Date, default: Date.now },
    parserVersion: { type: String, default: "1.0.0" },
    confidenceScore: { type: Number, min: 0, max: 1, default: 0.5 },
    rawSnippetRef: { type: String, default: "" },
    claimOrigin: { type: String, enum: ClaimOrigin, default: "supplier_submission" },
    verificationStatus: {
      type: String,
      enum: VerificationStatus,
      default: "claimed",
    },
  },
  { _id: false }
);

const CatalogProductSchema = new mongoose.Schema(
  {
    listingType: { type: String, enum: ListingType, required: true, index: true },
    canonicalName: { type: String, required: true, index: true },
    normalizedName: { type: String, required: true, index: true },
    synonyms: { type: [String], default: [] },
    description: { type: String, default: "" },
    identifiers: { type: IdentifierSchema, default: () => ({}) },
    fdf: {
      dosageForm: { type: String, default: "" },
      strength: { type: StrengthSchema, default: () => ({}) },
      route: { type: String, default: "" },
    },
    quality: {
      specReference: { type: String, default: "" },
      assayPercent: { type: ComparatorValueSchema, default: () => ({}) },
      polymorph: { type: String, default: "" },
      particleSize: {
        d10: { type: Number, default: null },
        d50: { type: Number, default: null },
        d90: { type: Number, default: null },
        unit: { type: String, default: "" },
        method: { type: String, default: "" },
      },
      impurities: {
        type: [
          new mongoose.Schema(
            {
              name: { type: String, default: "" },
              limit: { type: Number, default: null },
              comparator: { type: String, default: "" },
              unit: { type: String, default: "" },
            },
            { _id: false }
          ),
        ],
        default: [],
      },
    },
    storage: {
      storageConditions: { type: String, default: "" },
      shelfLifeMonths: { type: Number, default: null },
      retestPeriodMonths: { type: Number, default: null },
    },
    verificationStatus: {
      type: String,
      enum: VerificationStatus,
      default: "review_required",
      index: true,
    },
    sourcePriority: { type: Number, default: 100 },
    sourceLastFetchedAt: { type: Date, default: null, index: true },
    sourceRecordHash: { type: String, default: "" },
    normalizedRecordVersion: { type: Number, default: 1 },
    verificationLastCheckedAt: { type: Date, default: null },
    refreshStatus: {
      type: String,
      enum: ["pending", "ready", "stale", "blocked", "error"],
      default: "pending",
      index: true,
    },
    refreshStrategy: {
      type: String,
      enum: ["full", "incremental", "manual_review"],
      default: "manual_review",
    },
    sourceSummary: { type: [SourceSummarySchema], default: [] },
    searchKeywords: { type: [String], default: [] },
  },
  { timestamps: true }
);

CatalogProductSchema.index({ listingType: 1, normalizedName: 1 });
CatalogProductSchema.index({ "identifiers.cas": 1 }, { sparse: true });
CatalogProductSchema.index({ "identifiers.inn": 1 }, { sparse: true });
CatalogProductSchema.index({ "identifiers.productNdc": 1 }, { sparse: true });

const CatalogVariantSchema = new mongoose.Schema(
  {
    catalogProductId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "catalog_products_v2",
      required: true,
      index: true,
    },
    variantKey: { type: String, required: true, index: true },
    saltOrForm: { type: String, default: "" },
    dosageForm: { type: String, default: "" },
    strength: { type: StrengthSchema, default: () => ({}) },
    grade: { type: String, default: "" },
    polymorph: { type: String, default: "" },
    particleProfile: {
      d10: { type: Number, default: null },
      d50: { type: Number, default: null },
      d90: { type: Number, default: null },
      unit: { type: String, default: "" },
    },
  },
  { timestamps: true }
);

CatalogVariantSchema.index({ catalogProductId: 1, variantKey: 1 }, { unique: true });

const SupplierProductClaimSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    supplierUserId: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true, index: true },
    ownerOrgId: { type: mongoose.Schema.Types.ObjectId, ref: "organizations", default: null, index: true },
    supplierProfileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "supplier-profiles",
      default: null,
      index: true,
    },
    catalogProductId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "catalog_products_v2",
      required: true,
      index: true,
    },
    variantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "catalog_product_variants_v2",
      default: null,
      index: true,
    },
    supplierRole: {
      type: [String],
      enum: ["manufacturer", "distributor", "trader", "cdmo", "packager", "lab"],
      default: [],
    },
    claimStatus: {
      type: String,
      enum: ["draft", "active", "inactive", "under_review", "rejected"],
      default: "draft",
      index: true,
    },
    verificationStatus: {
      type: String,
      enum: VerificationStatus,
      default: "claimed",
      index: true,
    },
    supplierNameSnapshot: { type: String, default: "" },
    commercialReady: { type: Boolean, default: false },
    evidenceSummary: {
      gmp: { type: Boolean, default: false },
      coa: { type: Boolean, default: false },
      sds: { type: Boolean, default: false },
      auditReport: { type: Boolean, default: false },
    },
    legacyProductId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "supplier-master-products",
      default: null,
      index: true,
    },
  },
  { timestamps: true }
);

SupplierProductClaimSchema.index(
  { tenantId: 1, catalogProductId: 1, variantId: 1, supplierUserId: 1 },
  { unique: true }
);

const ProductSiteLinkSchema = new mongoose.Schema(
  {
    claimId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "supplier_product_claims_v2",
      required: true,
      index: true,
    },
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    supplierUserId: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true, index: true },
    siteId: { type: mongoose.Schema.Types.ObjectId, ref: "supplier-sites", default: null, index: true },
    orgSiteId: { type: mongoose.Schema.Types.ObjectId, ref: "org_sites", default: null, index: true },
    roles: {
      type: [String],
      enum: [
        "api_manufacturing",
        "fdf_manufacturing",
        "packaging",
        "testing",
        "release",
        "warehousing",
      ],
      default: [],
    },
    addressSnapshot: { type: SiteAddressSchema, default: () => ({}) },
    verificationStatus: {
      type: String,
      enum: VerificationStatus,
      default: "claimed",
    },
    legacyMappingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "product-site-mappings",
      default: null,
      index: true,
    },
  },
  { timestamps: true }
);

ProductSiteLinkSchema.index({ claimId: 1, siteId: 1, orgSiteId: 1 }, { unique: true, sparse: true });

const OfferSchema = new mongoose.Schema(
  {
    claimId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "supplier_product_claims_v2",
      required: true,
      index: true,
    },
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    visibility: {
      type: String,
      enum: ["private", "registered", "public"],
      default: "private",
      index: true,
    },
    offerStatus: {
      type: String,
      enum: ["draft", "active", "paused", "expired"],
      default: "draft",
      index: true,
    },
    quality: {
      specReference: { type: String, default: "" },
    },
    packaging: {
      packConfigurations: { type: [PackagingConfigSchema], default: [] },
    },
    supply: {
      moq: {
        value: { type: Number, default: null },
        unit: { type: String, default: "" },
        isNegotiable: { type: Boolean, default: false },
      },
      leadTimeDays: {
        min: { type: Number, default: null },
        max: { type: Number, default: null },
      },
      price: {
        currency: { type: String, default: "" },
        amount: { type: Number, default: null },
        basis: { type: String, default: "" },
        isOnRequest: { type: Boolean, default: false },
      },
    },
    trade: {
      countryOfOrigin: { type: String, default: "" },
      hsCode: { type: String, default: "" },
    },
  },
  { timestamps: true }
);

OfferSchema.index({ claimId: 1, visibility: 1, offerStatus: 1 });

const ComplianceClaimRecordSchema = new mongoose.Schema(
  {
    claimId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "supplier_product_claims_v2",
      required: true,
      index: true,
    },
    offerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "supplier_product_offers_v2",
      default: null,
      index: true,
    },
    claimType: {
      type: String,
      enum: [
        "GMP",
        "cGMP",
        "USDMF",
        "JDMF",
        "KDMF",
        "CEP",
        "COA",
        "SDS",
        "ISO9001",
        "GDP",
        "AuditReport",
      ],
      required: true,
      index: true,
    },
    verificationStatus: {
      type: String,
      enum: VerificationStatus,
      default: "claimed",
      index: true,
    },
    claimedValue: { type: mongoose.Schema.Types.Mixed, default: null },
    verifiedValue: { type: mongoose.Schema.Types.Mixed, default: null },
    effectiveFrom: { type: Date, default: null },
    effectiveTo: { type: Date, default: null },
  },
  { timestamps: true }
);

ComplianceClaimRecordSchema.index({ claimId: 1, claimType: 1 }, { unique: true });

const ProductEvidenceLinkSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    claimId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "supplier_product_claims_v2",
      required: true,
      index: true,
    },
    offerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "supplier_product_offers_v2",
      default: null,
      index: true,
    },
    complianceRecordId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "compliance_claim_records_v2",
      default: null,
      index: true,
    },
    digilockerDocumentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "digilocker_documents",
      default: null,
      index: true,
    },
    genericDocumentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "documents",
      default: null,
      index: true,
    },
    docType: {
      type: String,
      enum: [
        "COA",
        "SDS",
        "GMP_CERT",
        "CEP_REFERENCE",
        "DMF_REFERENCE",
        "AUDIT_REPORT",
        "METHOD",
        "STABILITY_SUMMARY",
        "OTHER",
      ],
      required: true,
      index: true,
    },
    sha256: { type: String, default: "", index: true },
    sourceUrl: { type: String, default: "" },
    issuedAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
    extractedFields: { type: mongoose.Schema.Types.Mixed, default: {} },
    batchScope: {
      batchNumber: { type: String, default: "" },
      releaseDate: { type: Date, default: null },
    },
    verificationStatus: {
      type: String,
      enum: VerificationStatus,
      default: "claimed",
    },
  },
  { timestamps: true }
);

const ProductProvenanceEventSchema = new mongoose.Schema(
  {
    resourceType: {
      type: String,
      enum: [
        "catalog_product",
        "catalog_variant",
        "supplier_claim",
        "supplier_offer",
        "compliance_record",
        "evidence_link",
      ],
      required: true,
      index: true,
    },
    resourceId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    fieldPath: { type: String, default: "" },
    sourceName: { type: String, required: true, index: true },
    sourceUrl: { type: String, default: "" },
    fetchedAtUtc: { type: Date, default: Date.now, index: true },
    parserVersion: { type: String, default: "1.0.0" },
    confidenceScore: { type: Number, min: 0, max: 1, default: 0.5 },
    rawSnippetRef: { type: String, default: "" },
    claimOrigin: { type: String, enum: ClaimOrigin, default: "supplier_submission" },
    verificationStatus: {
      type: String,
      enum: VerificationStatus,
      default: "claimed",
    },
    sourceRecordHash: { type: String, default: "" },
  },
  { timestamps: true }
);

const ProductMergeEventSchema = new mongoose.Schema(
  {
    primaryProductId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "catalog_products_v2",
      required: true,
      index: true,
    },
    mergedProductId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "catalog_products_v2",
      required: true,
      index: true,
    },
    score: { type: Number, min: 0, max: 1, default: 0 },
    ruleId: { type: String, default: "" },
    reason: { type: String, default: "" },
    status: {
      type: String,
      enum: ["suggested", "approved", "rejected"],
      default: "suggested",
      index: true,
    },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
  },
  { timestamps: true }
);

const ProductRefreshRunSchema = new mongoose.Schema(
  {
    sourceName: { type: String, required: true, index: true },
    strategy: {
      type: String,
      enum: ["full", "incremental", "manual_review"],
      default: "incremental",
    },
    status: {
      type: String,
      enum: ["running", "completed", "failed", "blocked"],
      default: "running",
      index: true,
    },
    stats: {
      discovered: { type: Number, default: 0 },
      created: { type: Number, default: 0 },
      updated: { type: Number, default: 0 },
      merged: { type: Number, default: 0 },
      blocked: { type: Number, default: 0 },
    },
    startedAt: { type: Date, default: Date.now },
    completedAt: { type: Date, default: null },
    notes: { type: String, default: "" },
  },
  { timestamps: true }
);

const ProductReviewQueueSchema = new mongoose.Schema(
  {
    resourceType: { type: String, required: true, index: true },
    resourceId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    reviewType: {
      type: String,
      enum: ["match_review", "conflict_review", "legal_review", "verification_review"],
      required: true,
      index: true,
    },
    score: { type: Number, min: 0, max: 1, default: 0 },
    reasons: { type: [String], default: [] },
    status: {
      type: String,
      enum: ["open", "in_progress", "resolved"],
      default: "open",
      index: true,
    },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
  },
  { timestamps: true }
);

export const CatalogProduct = mongoose.model("catalog_products_v2", CatalogProductSchema);
export const CatalogProductVariant = mongoose.model(
  "catalog_product_variants_v2",
  CatalogVariantSchema
);
export const SupplierProductClaimV2 = mongoose.model(
  "supplier_product_claims_v2",
  SupplierProductClaimSchema
);
export const SupplierProductSiteLinkV2 = mongoose.model(
  "supplier_product_site_links_v2",
  ProductSiteLinkSchema
);
export const SupplierProductOfferV2 = mongoose.model(
  "supplier_product_offers_v2",
  OfferSchema
);
export const ComplianceClaimRecordV2 = mongoose.model(
  "compliance_claim_records_v2",
  ComplianceClaimRecordSchema
);
export const ProductEvidenceLinkV2 = mongoose.model(
  "product_evidence_links_v2",
  ProductEvidenceLinkSchema
);
export const ProductProvenanceEventV2 = mongoose.model(
  "product_provenance_events_v2",
  ProductProvenanceEventSchema
);
export const ProductMergeEventV2 = mongoose.model(
  "product_merge_events_v2",
  ProductMergeEventSchema
);
export const ProductRefreshRunV2 = mongoose.model(
  "product_refresh_runs_v2",
  ProductRefreshRunSchema
);
export const ProductReviewQueueV2 = mongoose.model(
  "product_review_queue_v2",
  ProductReviewQueueSchema
);

