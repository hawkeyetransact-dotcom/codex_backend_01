import mongoose from "mongoose";

const accessEventSchema = new mongoose.Schema(
  {
    documentViewId: { type: mongoose.Schema.Types.ObjectId, ref: "document_views", index: true, required: true },
    actorUserId: { type: mongoose.Schema.Types.ObjectId, ref: "users", index: true },
    actionType: { type: String, enum: ["VIEW", "DOWNLOAD", "DENIED"], required: true },
    ts: { type: Date, default: Date.now, index: true },
    metadata: { type: Object, default: {} },
  },
  { timestamps: false }
);

accessEventSchema.index({ documentViewId: 1, ts: -1 });

export const AccessEvent = mongoose.model("document_access_events", accessEventSchema);
