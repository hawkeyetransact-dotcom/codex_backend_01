import mongoose from "mongoose";

const kbChunkSchema = new mongoose.Schema(
  {
    tenantId: { type: String, index: true },
    role: { type: String, index: true },
    productArea: { type: String, index: true },
    tags: [{ type: String, index: true }],
    articleId: { type: mongoose.Schema.Types.ObjectId, ref: "KbArticle", index: true, required: true },
    chunkOrder: { type: Number, default: 0, index: true },
    content: { type: String, required: true },
    embedding: { type: [Number], default: [] },
    embeddingNorm: { type: Number, default: 0 },
    embeddingProvider: { type: String, default: "deterministic_hash", index: true },
    embeddingModel: { type: String, default: "", index: true },
    tokenCount: { type: Number, default: 0 },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

kbChunkSchema.index({ tenantId: 1, role: 1, productArea: 1 });
kbChunkSchema.index({ tags: 1 });
kbChunkSchema.index({ tenantId: 1, role: 1, productArea: 1, updatedAt: -1 });
kbChunkSchema.index({ tenantId: 1, role: 1, productArea: 1, chunkOrder: 1 });
kbChunkSchema.index({ content: "text", tags: "text" });

export default mongoose.model("KbChunk", kbChunkSchema);
