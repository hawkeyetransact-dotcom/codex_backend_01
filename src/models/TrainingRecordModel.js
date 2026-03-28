/**
 * TrainingRecordModel.js
 *
 * Training & Competency management — tracks training assignments,
 * completion status, assessments, and competency levels per user/role.
 *
 * Phase 1 EQMS — ISO 9001:2015 clause 7.2 / GMP personnel training requirements
 */
import mongoose from "mongoose";

const AssessmentSchema = new mongoose.Schema(
  {
    assessmentType: {
      type: String,
      enum: ["WRITTEN_TEST", "PRACTICAL", "OBSERVATION", "SIGN_OFF", "ORAL_EXAM"],
      default: "SIGN_OFF",
    },
    score: { type: Number, default: null },        // percentage
    passingScore: { type: Number, default: 80 },
    passed: { type: Boolean, default: false },
    assessedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
    assessedAt: { type: Date, default: null },
    notes: { type: String, default: null },
  },
  { _id: false }
);

const TrainingRecordSchema = new mongoose.Schema(
  {
    tenantId: { type: String, required: true, index: true },

    // Trainee
    traineeId: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true, index: true },
    traineeName: { type: String, default: null },   // denormalized for reporting
    traineeRole: { type: String, default: null },
    department: { type: String, default: null },

    // Training definition
    trainingType: {
      type: String,
      enum: ["ONBOARDING", "SOP_READ_AND_UNDERSTAND", "REGULATORY", "GMP", "SAFETY", "TECHNICAL", "PROCESS", "QUALITY_SYSTEM", "CUSTOM"],
      required: true,
    },
    trainingTitle: { type: String, required: true },
    trainingCode: { type: String, default: null },

    // Source document (what they're being trained on)
    documentControlId: { type: mongoose.Schema.Types.ObjectId, ref: "document-controls", default: null },
    documentVersion: { type: String, default: null },

    // Schedule
    assignedAt: { type: Date, default: Date.now },
    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
    dueDate: { type: Date, required: true },

    // Completion
    status: {
      type: String,
      enum: ["ASSIGNED", "IN_PROGRESS", "COMPLETED", "OVERDUE", "WAIVED", "FAILED"],
      default: "ASSIGNED",
      index: true,
    },
    completedAt: { type: Date, default: null },
    trainingDurationMinutes: { type: Number, default: null },

    // Competency outcome
    competencyLevel: {
      type: String,
      enum: ["AWARE", "COMPETENT", "PROFICIENT", "EXPERT", null],
      default: null,
    },
    assessment: { type: AssessmentSchema, default: null },

    // Recurrence
    isRecurring: { type: Boolean, default: false },
    recurrenceMonths: { type: Number, default: 12 },
    nextDueDate: { type: Date, default: null },
    previousRecordId: { type: mongoose.Schema.Types.ObjectId, ref: "training-records", default: null },

    // Waiver
    waivedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
    waivedAt: { type: Date, default: null },
    waiverReason: { type: String, default: null },

    notes: { type: String, default: null },
  },
  { timestamps: true }
);

TrainingRecordSchema.index({ tenantId: 1, traineeId: 1, status: 1 });
TrainingRecordSchema.index({ tenantId: 1, dueDate: 1, status: 1 });
TrainingRecordSchema.index({ tenantId: 1, documentControlId: 1 });

export const TrainingRecord = mongoose.model("training-records", TrainingRecordSchema);
