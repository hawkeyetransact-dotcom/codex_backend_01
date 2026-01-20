import mongoose from "mongoose";

const apiMasterSyncSchema = new mongoose.Schema(
  {
    _id: { type: String },
    sourceName: { type: String, default: "" },
    sourceUrl: { type: String, default: "" },
    status: {
      type: String,
      enum: ["idle", "running", "success", "failed"],
      default: "idle",
    },
    lastRunAt: { type: Date, default: null },
    lastSuccessAt: { type: Date, default: null },
    stats: {
      parsed: { type: Number, default: 0 },
      inserted: { type: Number, default: 0 },
      updated: { type: Number, default: 0 },
      skipped: { type: Number, default: 0 },
    },
    lockUntil: { type: Date, default: null },
    error: {
      message: { type: String, default: "" },
      at: { type: Date, default: null },
    },
    // Legacy fields retained for backward compatibility
    last_run_at: { type: Date, default: null },
    last_success_at: { type: Date, default: null },
  },
  { timestamps: true }
);

export const ApiMasterSync = mongoose.model("api_master_sync", apiMasterSyncSchema);
