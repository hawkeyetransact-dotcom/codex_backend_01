import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ["user", "assistant", "system"], required: true },
    content: { type: String, required: true },
    citations: [{ type: String }],
    actions: [{ type: String }],
  },
  { _id: false }
);

const hawkConversationSchema = new mongoose.Schema(
  {
    tenantId: { type: String, index: true },
    userId: { type: String, index: true },
    role: { type: String, index: true },
    productArea: { type: String, index: true },
    intent: { type: String, index: true },
    cost: { type: Number, default: 0 },
    tags: [{ type: String, index: true }],
    feedback: { type: Number },
    messages: [messageSchema],
    actions: [{ type: String }],
    citations: [{ type: String }],
    metadata: Object,
  },
  { timestamps: true }
);

hawkConversationSchema.index({ tenantId: 1, role: 1, productArea: 1, tags: 1 });

export default mongoose.model("HawkConversation", hawkConversationSchema);
