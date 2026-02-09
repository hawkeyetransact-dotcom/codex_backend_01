import mongoose from "mongoose";

const NotificationLabelSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", index: true, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "users", index: true, required: true },
    name: { type: String, required: true, trim: true },
    color: { type: String, default: "#0ea5e9" },
    isDeleted: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

NotificationLabelSchema.index(
  { tenantId: 1, userId: 1, name: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false } }
);

export default mongoose.model("NotificationLabel", NotificationLabelSchema, "notification_labels");

