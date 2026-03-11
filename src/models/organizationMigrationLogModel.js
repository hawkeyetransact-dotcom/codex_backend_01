import mongoose from "mongoose";

const organizationMigrationLogSchema = new mongoose.Schema(
  {
    runId: { type: String, required: true, index: true },
    scriptKey: { type: String, required: true, index: true },
    mode: { type: String, enum: ["DRY_RUN", "COMMIT"], default: "DRY_RUN" },
    status: { type: String, enum: ["STARTED", "COMPLETED", "FAILED"], default: "STARTED", index: true },
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", default: null, index: true },
    counts: { type: mongoose.Schema.Types.Mixed, default: {} },
    errorEntries: { type: [mongoose.Schema.Types.Mixed], default: [] },
    startedAt: { type: Date, default: Date.now },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

organizationMigrationLogSchema.index({ scriptKey: 1, startedAt: -1 });

export const OrganizationMigrationLog = mongoose.model(
  "organization_migration_logs",
  organizationMigrationLogSchema
);
