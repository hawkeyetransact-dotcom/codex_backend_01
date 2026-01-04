import mongoose from "mongoose";

const hawkPlaybookSchema = new mongoose.Schema(
  {
    tenantId: { type: String, index: true },
    role: { type: String, index: true },
    productArea: { type: String, index: true },
    tags: [{ type: String, index: true }],
    title: { type: String, required: true },
    steps: [{ type: String }],
    summary: String,
  },
  { timestamps: true }
);

hawkPlaybookSchema.index({ tenantId: 1, role: 1, productArea: 1 });
hawkPlaybookSchema.index({ tags: 1 });

export default mongoose.model("HawkPlaybook", hawkPlaybookSchema);
