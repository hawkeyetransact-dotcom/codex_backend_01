import mongoose from "mongoose";

const QuestionnaireSectionAssignmentSchema = new mongoose.Schema(
  {
    auditRequestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "audit-requests-master",
      required: true,
      index: true,
    },
    tenantOrgId: { type: String, index: true },
    categoryName: { type: String, required: true },
    assignedToUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
      index: true,
    },
    assignedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
    },
    status: {
      type: String,
      enum: ["ASSIGNED", "IN_PROGRESS", "SUBMITTED", "REOPENED", "REASSIGNED"],
      default: "ASSIGNED",
    },
    dueDate: { type: Date },
    notes: { type: String, default: "" },
    submittedAt: { type: Date },
  },
  { timestamps: true }
);

QuestionnaireSectionAssignmentSchema.index({
  auditRequestId: 1,
  categoryName: 1,
  status: 1,
});

QuestionnaireSectionAssignmentSchema.index({
  auditRequestId: 1,
  assignedToUserId: 1,
});

export const QuestionnaireSectionAssignment = mongoose.model(
  "questionnaire-section-assignments",
  QuestionnaireSectionAssignmentSchema
);
