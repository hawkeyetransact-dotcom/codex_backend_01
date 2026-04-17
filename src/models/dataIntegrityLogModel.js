import mongoose from "mongoose";

/**
 * DataIntegrityLog — ALCOA+ compliance record.
 *
 * Tracks data provenance for every GxP-significant operation.
 * Immutable, append-only. Each entry proves:
 *
 *   A — Attributable:     who performed the action (userId, IP, user agent)
 *   L — Legible:          human-readable description + structured before/after
 *   C — Contemporaneous:  server-generated timestamp (not client-provided)
 *   O — Original:         contentHash of the record at time of action
 *   A — Accurate:         validated against schema before storage
 *   + Complete:           captures before AND after states
 *   + Consistent:         sequential entryNumber per record, no gaps
 *   + Enduring:           stored in dedicated collection, never purged
 *   + Available:          indexed for efficient retrieval during inspections
 *
 * References:
 *   - FDA Data Integrity Guidance (2018)
 *   - WHO Guidance on Good Data and Record Management Practices (TRS 996, Annex 5)
 *   - MHRA GxP Data Integrity Guidance (2018)
 */
const DataIntegrityLogSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", index: true },

    // ── WHAT record was affected ─────────────────────────────────────────────
    recordType: {
      type: String,
      required: true,
      enum: [
        "AUDIT_REQUEST", "AUDIT_ARTIFACT", "AUDIT_REPORT", "AUDIT_QUESTION",
        "DOCUMENT_CONTROL", "CHANGE_CONTROL", "CAPA", "DEVIATION", "COMPLAINT",
        "TRAINING_RECORD", "EQUIPMENT", "MANAGEMENT_REVIEW", "RISK_ITEM",
        "USER", "TEMPLATE", "SUPPLIER_PROFILE",
      ],
      index: true,
    },
    recordId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    recordCollection: { type: String, default: null },

    // ── WHAT happened ────────────────────────────────────────────────────────
    action: {
      type: String,
      required: true,
      enum: [
        "CREATE", "UPDATE", "DELETE", "STATUS_CHANGE", "PHASE_TRANSITION",
        "APPROVAL", "REJECTION", "SIGNATURE", "SEND", "SUBMIT", "REVIEW",
        "ARCHIVE", "RESTORE", "PUBLISH", "SUPERSEDE", "WITHDRAW",
        "CALIBRATION", "DISPOSITION", "INVESTIGATE", "CLOSE",
      ],
    },
    description: { type: String, required: true },

    // ── WHO did it (Attributable) ────────────────────────────────────────────
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true },
    performedByEmail: { type: String },
    performedByRole: { type: String },
    ipAddress: { type: String, default: null },
    userAgent: { type: String, default: null },

    // ── WHEN (Contemporaneous — server timestamp, immutable) ─────────────────
    performedAt: { type: Date, required: true, default: Date.now, immutable: true },

    // ── BEFORE / AFTER (Complete + Legible) ──────────────────────────────────
    previousValues: { type: mongoose.Schema.Types.Mixed, default: null },
    newValues: { type: mongoose.Schema.Types.Mixed, default: null },
    changedFields: { type: [String], default: [] },

    // ── INTEGRITY (Original + Accurate) ──────────────────────────────────────
    contentHashBefore: { type: String, default: null },
    contentHashAfter: { type: String, default: null },

    // ── SEQUENCE (Consistent — monotonic per record, no gaps) ────────────────
    entryNumber: { type: Number, default: 1 },

    // ── LINKED SIGNATURE (if this action was signed) ─────────────────────────
    signatureId: { type: mongoose.Schema.Types.ObjectId, ref: "ElectronicSignature", default: null },

    // ── CONTEXT ──────────────────────────────────────────────────────────────
    reason: { type: String, default: null },
    sourceModule: { type: String, default: null },
  },
  {
    timestamps: false, // We use performedAt instead
    strict: true,
  }
);

// Fast lookup: all changes to a specific record
DataIntegrityLogSchema.index({ recordType: 1, recordId: 1, entryNumber: 1 });
// User audit trail: all actions by a specific user
DataIntegrityLogSchema.index({ performedBy: 1, performedAt: -1 });
// Time range queries for inspections
DataIntegrityLogSchema.index({ tenantId: 1, performedAt: -1 });

export const DataIntegrityLog = mongoose.model(
  "DataIntegrityLog",
  DataIntegrityLogSchema,
  "data_integrity_logs"
);
