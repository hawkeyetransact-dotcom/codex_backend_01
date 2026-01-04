import mongoose from "mongoose";

const hawkUnansweredSchema = new mongoose.Schema(
  {
    tenantId: { type: String, index: true },
    role: { type: String, index: true },
    question: { type: String, required: true },
    answer: String,
    confidence: { type: Number, default: 0 },
    tags: [{ type: String }],
    status: { type: String, enum: ["new", "reviewed", "converted"], default: "new" },
  },
  { timestamps: true }
);

hawkUnansweredSchema.index({ tenantId: 1, status: 1 });

export default mongoose.model("HawkUnanswered", hawkUnansweredSchema);
