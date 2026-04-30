/**
 * ManagementReviewModel.js
 *
 * Management Review meeting record — captures inputs, decisions,
 * action items, and QMS performance metrics per ISO 9001:2015 clause 9.3.
 *
 * Phase 1 EQMS
 */
import mongoose from "mongoose";

const ActionItemSchema = new mongoose.Schema(
  {
    description: { type: String, required: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
    dueDate: { type: Date, default: null },
    status: {
      type: String,
      enum: ["OPEN", "IN_PROGRESS", "COMPLETED", "OVERDUE", "CANCELLED"],
      default: "OPEN",
    },
    completedAt: { type: Date, default: null },
    notes: { type: String, default: null },
    priority: {
      type: String,
      enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
      default: "MEDIUM",
    },
  },
  { _id: true }
);

const InputSectionSchema = new mongoose.Schema(
  {
    topic: { type: String, required: true },    // e.g. "Audit Results", "CAPA Status"
    summary: { type: String, default: null },
    dataRefs: { type: [String], default: [] }, // links to reports, dashboards
    trend: {
      type: String,
      enum: ["IMPROVING", "STABLE", "DECLINING", "NOT_ASSESSED"],
      default: "NOT_ASSESSED",
    },
  },
  { _id: false }
);

const ManagementReviewSchema = new mongoose.Schema(
  {
    tenantId: { type: String, required: true, index: true },

    // Identity
    reviewNumber: { type: String, index: true, sparse: true }, // MR-YYYY-NNNN
    reviewSequence: { type: Number, sparse: true },
    title: { type: String, required: true },
    reviewType: {
      type: String,
      enum: ["ANNUAL", "QUARTERLY", "AD_HOC", "POST_INCIDENT", "REGULATORY"],
      default: "ANNUAL",
    },

    // Schedule
    plannedDate: { type: Date, required: true },
    actualDate: { type: Date, default: null },
    location: { type: String, default: null },
    durationMinutes: { type: Number, default: null },

    // Lifecycle
    status: {
      type: String,
      enum: ["PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"],
      default: "PLANNED",
      index: true,
    },

    // Attendees
    chairId: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
    attendeeIds: { type: [mongoose.Schema.Types.ObjectId], ref: "users", default: [] },
    minutesTakerId: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },

    // Mandatory ISO 9001:2015 clause 9.3.2 inputs
    inputs: { type: [InputSectionSchema], default: [] },

    // QMS performance indicators
    kpis: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
      // e.g. { auditCount: 12, openCapas: 5, onTimeDelivery: 94.2 }
    },

    // ISO 9001:2015 clause 9.3.3 outputs
    qmsAdequacy: {
      type: String,
      enum: ["ADEQUATE", "NEEDS_IMPROVEMENT", "INADEQUATE", null],
      default: null,
    },
    resourceDecisions: { type: String, default: null },
    improvementOpportunities: { type: [String], default: [] },

    // Action items
    actionItems: { type: [ActionItemSchema], default: [] },

    // Minutes document
    minutesDocumentId: { type: mongoose.Schema.Types.ObjectId, ref: "document-controls", default: null },
    minutesStorageRef: { type: String, default: null },

    // Approval — e-signature gated on /complete
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
    approvedAt: { type: Date, default: null },
    approvalNotes: { type: String, default: null },
    completionSignatureId: { type: mongoose.Schema.Types.ObjectId, ref: "electronic-signatures", default: null },

    // Period covered
    periodStartDate: { type: Date, default: null },
    periodEndDate: { type: Date, default: null },

    // Link to previous review
    previousReviewId: { type: mongoose.Schema.Types.ObjectId, ref: "management-reviews", default: null },
  },
  { timestamps: true }
);

// Auto-generate reviewNumber
ManagementReviewSchema.pre("save", async function (next) {
  if (this.isNew && !this.reviewNumber) {
    const year = new Date().getFullYear();
    const Model = mongoose.model("management-reviews");
    const count = await Model.countDocuments({ tenantId: this.tenantId }) + 1;
    this.reviewSequence = count;
    this.reviewNumber = `MR-${year}-${String(count).padStart(4, "0")}`;
  }
  next();
});

ManagementReviewSchema.index({ tenantId: 1, status: 1 });
ManagementReviewSchema.index({ tenantId: 1, plannedDate: 1 });

export const ManagementReview = mongoose.model("management-reviews", ManagementReviewSchema);
