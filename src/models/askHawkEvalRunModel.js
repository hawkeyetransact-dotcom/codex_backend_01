import mongoose from "mongoose";

const askHawkEvalRunSchema = new mongoose.Schema(
  {
    tenantId: { type: String, index: true },
    runType: { type: String, enum: ["manual", "ci", "scheduled"], default: "manual", index: true },
    suite: { type: String, default: "askhawk_phase3_core" },
    version: { type: String, default: "" },
    score: { type: Number, default: 0, index: true },
    passRate: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    passed: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    threshold: { type: Number, default: 0.85 },
    status: { type: String, enum: ["PASS", "FAIL"], default: "FAIL", index: true },
    checks: { type: [mongoose.Schema.Types.Mixed], default: [] },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    createdBy: { type: String, default: "" },
  },
  { timestamps: true }
);

askHawkEvalRunSchema.index({ tenantId: 1, createdAt: -1 });
askHawkEvalRunSchema.index({ tenantId: 1, runType: 1, createdAt: -1 });

export default mongoose.model("AskHawkEvalRun", askHawkEvalRunSchema);

