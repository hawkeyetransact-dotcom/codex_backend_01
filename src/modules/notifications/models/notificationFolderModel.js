import mongoose from "mongoose";

const NotificationFolderSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", index: true, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "users", index: true, required: true },
    name: { type: String, required: true, trim: true },
    color: { type: String, default: "#64748b" },
    isSystem: { type: Boolean, default: false },
    systemKey: {
      type: String,
      enum: ["INBOX", "ARCHIVED", null],
      default: null,
      index: true,
    },
    sortOrder: { type: Number, default: 100 },
    isDeleted: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

NotificationFolderSchema.index(
  { tenantId: 1, userId: 1, systemKey: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false, systemKey: { $in: ["INBOX", "ARCHIVED"] } } }
);
NotificationFolderSchema.index(
  { tenantId: 1, userId: 1, name: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false } }
);

export default mongoose.model("NotificationFolder", NotificationFolderSchema, "notification_folders");
