import mongoose from "mongoose";

const fdaDashboardSnapshotSchema = new mongoose.Schema(
  {
    stats: { type: Object, default: {} },
  },
  { timestamps: true }
);

export default mongoose.model("FdaDashboardSnapshot", fdaDashboardSnapshotSchema);
