import mongoose from "mongoose";

const apiMasterSyncSchema = new mongoose.Schema(
  {
    _id: { type: String },
    sourceName: { type: String, default: "" },
    sourceUrl: { type: String, default: "" },
    last_run_at: { type: Date, default: null },
    last_success_at: { type: Date, default: null },
    status: {
      type: String,
      enum: ["idle", "running", "success", "failed"],
      default: "idle",
    },
    stats: { type: Object, default: {} },
    error: {
      message: { type: String, default: "" },
      at: { type: Date, default: null },
    },
    lockUntil: { type: Date, default: null },
  },
  { timestamps: true }
);

export const ApiMasterSync = mongoose.model("api_master_sync", apiMasterSyncSchema);
