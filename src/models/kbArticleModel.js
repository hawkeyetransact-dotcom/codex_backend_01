import mongoose from "mongoose";

const kbArticleSchema = new mongoose.Schema(
  {
    tenantId: { type: String, index: true },
    role: { type: String, index: true },
    productArea: { type: String, index: true },
    tags: [{ type: String, index: true }],
    title: { type: String, required: true },
    slug: { type: String, required: true, index: true, unique: true },
    summary: String,
    source: String,
  },
  { timestamps: true }
);

kbArticleSchema.index({ tenantId: 1, role: 1, productArea: 1 });
kbArticleSchema.index({ tags: 1 });

export default mongoose.model("KbArticle", kbArticleSchema);
