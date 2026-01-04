import mongoose from "mongoose";

const hawkPolicySchema = new mongoose.Schema(
  {
    tenantId: { type: String, index: true },
    role: { type: String, index: true },
    productArea: { type: String, index: true },
    tags: [{ type: String, index: true }],
    title: { type: String, required: true },
    body: { type: String, required: true },
  },
  { timestamps: true }
);

hawkPolicySchema.index({ tenantId: 1, role: 1, productArea: 1 });
hawkPolicySchema.index({ tags: 1 });

export default mongoose.model("HawkPolicy", hawkPolicySchema);
