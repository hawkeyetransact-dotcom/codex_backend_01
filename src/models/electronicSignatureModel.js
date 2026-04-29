import mongoose from "mongoose";

/**
 * ElectronicSignature — 21 CFR Part 11 compliant signature record.
 *
 * Each signature captures:
 *   - WHO signed (userId, full name, role)
 *   - WHAT they signed (recordType, recordId, recordVersion)
 *   - WHY (signatureMeaning: AUTHORED, REVIEWED, APPROVED, WITNESSED)
 *   - WHEN (signedAt — server-generated, tamper-proof)
 *   - HOW (method: PASSWORD, MFA, BIOMETRIC, CERTIFICATE)
 *   - HASH (sha256 of the record content at time of signing — for integrity)
 *
 * This model is APPEND-ONLY. Signatures are never updated or deleted.
 * Audit trail entries are auto-created for every signature via the post-save hook.
 *
 * References:
 *   - 21 CFR Part 11 §11.50 (signature manifestations)
 *   - 21 CFR Part 11 §11.70 (signature/record linking)
 *   - 21 CFR Part 11 §11.100 (general requirements)
 *   - ALCOA+ principles (Attributable, Legible, Contemporaneous, Original, Accurate)
 */
const ElectronicSignatureSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", index: true },

    // ── WHAT was signed ──────────────────────────────────────────────────────
    recordType: {
      type: String,
      required: true,
      enum: [
        "AUDIT_REPORT",
        "AUDIT_ARTIFACT",
        "INTIMATION_LETTER",     // G1: supplier signs the intimation letter (S05)
        "AUDIT_AGENDA",          // S10 supplier agenda acceptance
        "AUDIT_CLOSURE_CERTIFICATE", // G8: closure certificate (S21)
        "QUALITY_AGREEMENT",     // G10: contract giver/acceptor sign-off (EU GMP Ch.7)
        "DOCUMENT_CONTROL",
        "CHANGE_CONTROL",
        "CAPA",
        "DEVIATION",
        "COMPLAINT",
        "TRAINING_RECORD",
        "EQUIPMENT_CALIBRATION",
        "MANAGEMENT_REVIEW",
        "RISK_ITEM",
      ],
      index: true,
    },
    recordId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    recordVersion: { type: Number, default: 1 },

    // ── WHO signed ───────────────────────────────────────────────────────────
    signerId: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true },
    signerEmail: { type: String, required: true },
    signerFullName: { type: String, required: true },
    signerRole: { type: String, required: true },

    // ── WHY (meaning of signature — 21 CFR Part 11 §11.50) ──────────────────
    signatureMeaning: {
      type: String,
      required: true,
      enum: ["AUTHORED", "REVIEWED", "APPROVED", "WITNESSED", "VERIFIED", "REJECTED"],
    },

    // ── WHEN (server-side, not client-provided) ─────────────────────────────
    signedAt: { type: Date, required: true, default: Date.now },

    // ── HOW (authentication method used) ────────────────────────────────────
    authMethod: {
      type: String,
      enum: ["PASSWORD", "PASSWORD_MFA", "BIOMETRIC", "CERTIFICATE", "SSO"],
      default: "PASSWORD",
    },

    // ── INTEGRITY (ALCOA+ Original + Accurate) ──────────────────────────────
    // SHA-256 hash of the record content at time of signing
    contentHash: { type: String, default: null },
    // IP address of the signer (ALCOA+ Attributable)
    signerIpAddress: { type: String, default: null },
    // User agent (browser/device — ALCOA+ Attributable)
    signerUserAgent: { type: String, default: null },

    // ── NOTES ────────────────────────────────────────────────────────────────
    comments: { type: String, default: null },

    // ── REVOCATION (if signature is contested/withdrawn — immutable original preserved) ──
    revokedAt: { type: Date, default: null },
    revokedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
    revocationReason: { type: String, default: null },
  },
  {
    timestamps: true,
    // Immutable: prevent updates to signature records (21 CFR Part 11 §11.10(e))
    strict: true,
  }
);

// Compound index for efficient lookup: "all signatures for this record"
ElectronicSignatureSchema.index({ recordType: 1, recordId: 1, signedAt: -1 });
// Index for user audit: "all signatures by this person"
ElectronicSignatureSchema.index({ signerId: 1, signedAt: -1 });

export const ElectronicSignature = mongoose.model(
  "ElectronicSignature",
  ElectronicSignatureSchema,
  "electronic_signatures"
);
