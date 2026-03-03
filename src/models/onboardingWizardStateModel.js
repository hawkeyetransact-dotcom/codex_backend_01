import mongoose from "mongoose";

const onboardingWizardStateSchema = new mongoose.Schema(
  {
    tenantId: { type: String, required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true, index: true },
    role: { type: String, required: true, index: true },
    playbookKey: { type: String, required: true, default: "role-default", index: true },
    playbookVersion: { type: String, required: true, default: "v1" },
    status: {
      type: String,
      enum: ["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "DISMISSED"],
      default: "NOT_STARTED",
      index: true,
    },
    currentStepId: { type: String, default: "" },
    completedStepIds: { type: [String], default: [] },
    skippedStepIds: { type: [String], default: [] },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    dismissedAt: { type: Date, default: null },
    lastSeenAt: { type: Date, default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

onboardingWizardStateSchema.index({ tenantId: 1, userId: 1, playbookKey: 1 }, { unique: true });

export const OnboardingWizardState = mongoose.model(
  "onboarding_wizard_states",
  onboardingWizardStateSchema
);

