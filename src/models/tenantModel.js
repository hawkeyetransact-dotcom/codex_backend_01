import mongoose from "mongoose";

const tenantSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true }, // slug/key
    displayName: { type: String, required: true },
    type: {
      type: String,
      enum: ["SUPPLIER", "BUYER", "AUDITOR", "INTERNAL"],
      default: "INTERNAL",
    },
    status: {
      type: String,
      enum: ["ACTIVE", "SUSPENDED"],
      default: "ACTIVE",
    },
    ownerUserIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "users" }],
    branding: {
      logoUrl: { type: String },
      primaryColor: { type: String },
    },
    security: {
      allowedEmailDomains: { type: [String], default: [] },
      requireMFA: { type: Boolean, default: false },
    },
  },
  { timestamps: true }
);

export default mongoose.model("Tenant", tenantSchema);
