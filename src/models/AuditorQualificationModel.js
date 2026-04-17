import mongoose from "mongoose";

/**
 * AuditorQualification — Phase 2: Auditor competency/qualification tracking.
 *
 * Per PIC/S PI 002 and ISO 19011:2018, auditors must demonstrate:
 *   - Formal education/training in the relevant domain
 *   - Audit experience (number of completed audits)
 *   - Industry-specific competencies (e.g. sterile manufacturing, API synthesis)
 *   - Active certifications with expiry tracking
 *   - COI declaration history
 *
 * This model tracks qualifications per auditor, enabling:
 *   - Competency verification before audit assignment
 *   - Lead auditor eligibility check (min 5 complete audits)
 *   - Certification expiry alerts
 *   - Industry-specific matching (right auditor for right audit)
 */
const CertificationSchema = new mongoose.Schema(
  {
    certificationName: { type: String, required: true },
    issuingBody: { type: String },
    certificationNumber: { type: String },
    issuedDate: { type: Date },
    expiryDate: { type: Date },
    status: { type: String, enum: ["ACTIVE", "EXPIRED", "REVOKED", "PENDING_RENEWAL"], default: "ACTIVE" },
    documentRef: { type: String }, // S3 key or digilocker reference
  },
  { _id: true }
);

const CompetencyAreaSchema = new mongoose.Schema(
  {
    domain: {
      type: String,
      enum: [
        "API_MANUFACTURING", "STERILE_MANUFACTURING", "SOLID_DOSAGE",
        "BIOLOGICS", "MEDICAL_DEVICE", "LABORATORY_CONTROLS",
        "DATA_INTEGRITY", "SUPPLY_CHAIN", "EHS", "FOOD_SAFETY",
        "QUALITY_SYSTEMS", "REGULATORY_AFFAIRS", "PACKAGING_LABELING",
        "CLEANING_VALIDATION", "PROCESS_VALIDATION", "COMPUTER_SYSTEMS",
        "OTHER",
      ],
    },
    proficiencyLevel: { type: String, enum: ["BASIC", "INTERMEDIATE", "ADVANCED", "EXPERT"], default: "BASIC" },
    yearsOfExperience: { type: Number, default: 0 },
    lastAssessedAt: { type: Date },
    notes: { type: String },
  },
  { _id: true }
);

const AuditorQualificationSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", index: true },
    auditorUserId: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true, unique: true },
    auditorProfileId: { type: mongoose.Schema.Types.ObjectId, ref: "auditor-profiles" },

    // ── Professional background ──────────────────────────────────────────────
    highestEducation: { type: String },
    fieldOfStudy: { type: String },
    totalYearsExperience: { type: Number, default: 0 },
    totalAuditsCompleted: { type: Number, default: 0 },
    totalAuditsAsLead: { type: Number, default: 0 },

    // ── Eligibility ──────────────────────────────────────────────────────────
    eligibleAsLead: { type: Boolean, default: false }, // requires min 5 complete audits
    eligibleAsCoAuditor: { type: Boolean, default: true },
    eligibleAsReviewer: { type: Boolean, default: true },

    // ── Competency areas ─────────────────────────────────────────────────────
    competencyAreas: { type: [CompetencyAreaSchema], default: [] },

    // ── Certifications ───────────────────────────────────────────────────────
    certifications: { type: [CertificationSchema], default: [] },

    // ── Languages ────────────────────────────────────────────────────────────
    languages: { type: [String], default: ["English"] },

    // ── Regulatory frameworks ────────────────────────────────────────────────
    regulatoryExpertise: {
      type: [String],
      enum: [
        "FDA_21CFR", "EU_GMP", "ICH_Q7", "ICH_Q10", "WHO_GMP",
        "PIC_S", "ISO_9001", "ISO_13485", "ISO_14001", "ISO_22000",
        "ISO_45001", "FSSC_22000", "BRC", "SQF", "GAMP5",
      ],
      default: [],
    },

    // ── Status ───────────────────────────────────────────────────────────────
    qualificationStatus: {
      type: String,
      enum: ["PENDING_REVIEW", "QUALIFIED", "CONDITIONALLY_QUALIFIED", "DISQUALIFIED", "EXPIRED"],
      default: "PENDING_REVIEW",
    },
    qualifiedAt: { type: Date },
    qualifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
    nextReviewDue: { type: Date },

    // ── COI tracking ─────────────────────────────────────────────────────────
    coiDeclarations: [
      {
        auditId: { type: mongoose.Schema.Types.ObjectId },
        declaredAt: { type: Date },
        hasConflict: { type: Boolean, default: false },
        conflictDetails: { type: String },
      },
    ],

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
  },
  { timestamps: true }
);

// Auto-compute eligibility
AuditorQualificationSchema.pre("save", function (next) {
  this.eligibleAsLead = this.totalAuditsCompleted >= 5;
  next();
});

export const AuditorQualification = mongoose.model(
  "AuditorQualification",
  AuditorQualificationSchema,
  "auditor_qualifications"
);
