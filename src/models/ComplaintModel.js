/**
 * ComplaintModel.js — Phase 1 EQMS
 * Customer / patient / regulatory complaint tracking.
 * ISO 9001:2015 clause 8.2.1 / 21 CFR Part 820.198
 *
 * Auto-generates complaintNumber: CMP-YYYY-NNNN
 */
import mongoose from "mongoose";

const { Schema } = mongoose;

const ComplaintSchema = new Schema(
  {
    tenantId: { type: String, required: true, index: true },
    complaintNumber: { type: String, unique: true },

    // ── Core fields ─────────────────────────────────────────────────────────
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },

    complaintType: {
      type: String,
      enum: ["PRODUCT_QUALITY", "LABELING", "PACKAGING", "DELIVERY", "SERVICE", "SAFETY", "REGULATORY", "OTHER"],
      required: true,
    },
    source: {
      type: String,
      enum: ["CUSTOMER", "PATIENT", "REGULATOR", "DISTRIBUTOR", "INTERNAL", "FIELD_REPORT", "OTHER"],
      default: "CUSTOMER",
    },

    // ── Severity / Risk ─────────────────────────────────────────────────────
    severity: {
      type: String,
      enum: ["CRITICAL", "MAJOR", "MINOR", "INFORMATIONAL"],
      required: true,
    },
    isMedicalDeviceReport: { type: Boolean, default: false },
    requiresRegulatoryReporting: { type: Boolean, default: false },
    regulatoryReportSubmittedAt: { type: Date },

    // ── Status lifecycle ─────────────────────────────────────────────────────
    status: {
      type: String,
      enum: [
        "OPEN",
        "UNDER_INVESTIGATION",
        "PENDING_CAPA",
        "CAPA_IN_PROGRESS",
        "PENDING_CLOSURE",
        "CLOSED",
        "CANCELLED",
      ],
      default: "OPEN",
      index: true,
    },

    // ── Complainant ─────────────────────────────────────────────────────────
    complainantName: { type: String, trim: true },
    complainantEmail: { type: String, trim: true },
    complainantOrg: { type: String, trim: true },

    // ── Product / Batch ─────────────────────────────────────────────────────
    productId: { type: Schema.Types.ObjectId, ref: "SupplierProduct" },
    productName: { type: String, trim: true },
    batchLotNumber: { type: String, trim: true },
    manufacturedAt: { type: Date },
    expiresAt: { type: Date },

    // ── Linked entities ─────────────────────────────────────────────────────
    supplierId: { type: Schema.Types.ObjectId },
    siteId: { type: Schema.Types.ObjectId },
    linkedCAPAIds: [{ type: Schema.Types.ObjectId }],
    linkedNCIds: [{ type: Schema.Types.ObjectId }],

    // ── Investigation ────────────────────────────────────────────────────────
    assignedTo: { type: Schema.Types.ObjectId, ref: "User" },
    investigationSummary: { type: String, trim: true },
    rootCause: { type: String, trim: true },
    correctiveAction: { type: String, trim: true },
    preventiveAction: { type: String, trim: true },
    investigationCompletedAt: { type: Date },

    // ── Closure ─────────────────────────────────────────────────────────────
    closedAt: { type: Date },
    closedBy: { type: Schema.Types.ObjectId, ref: "User" },
    closureNotes: { type: String, trim: true },
    customerResponseSentAt: { type: Date },

    // ── Dates ────────────────────────────────────────────────────────────────
    receivedAt: { type: Date, default: Date.now },
    dueDateForResponse: { type: Date },

    reportedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  {
    timestamps: true,
    collection: "complaints",
  }
);

// ── Auto-generate complaintNumber ─────────────────────────────────────────────
ComplaintSchema.pre("save", async function (next) {
  if (this.isNew && !this.complaintNumber) {
    const year = new Date().getFullYear();
    const prefix = `CMP-${year}-`;
    const last = await mongoose
      .model("Complaint")
      .findOne({ complaintNumber: { $regex: `^${prefix}` } })
      .sort({ complaintNumber: -1 })
      .select("complaintNumber")
      .lean();
    const seq = last
      ? parseInt(last.complaintNumber.split("-")[2], 10) + 1
      : 1;
    this.complaintNumber = `${prefix}${String(seq).padStart(4, "0")}`;
  }
  next();
});

export const Complaint = mongoose.model("Complaint", ComplaintSchema);
