import mongoose from "mongoose";

const recipientSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["userId", "email", "role", "tenant"], required: true },
    value: { type: String, required: true },
  },
  { _id: false }
);

const sharePolicySchema = new mongoose.Schema(
  {
    documentViewId: { type: mongoose.Schema.Types.ObjectId, ref: "document_views", index: true, required: true },
    recipients: { type: [recipientSchema], default: [] },
    startAt: { type: Date, required: true },
    endAt: { type: Date, required: true },
    controls: {
      allowDownload: { type: Boolean, default: false },
      watermark: { type: Boolean, default: false },
      otpRequired: { type: Boolean, default: false },
    },
    status: { type: String, enum: ["ACTIVE", "SCHEDULED", "EXPIRED"], default: "SCHEDULED" },
  },
  { timestamps: true }
);

sharePolicySchema.index({ documentViewId: 1, status: 1 });
sharePolicySchema.index({ startAt: 1, endAt: 1 });

export const SharePolicy = mongoose.model("document_share_policies", sharePolicySchema);
